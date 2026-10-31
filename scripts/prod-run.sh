#!/usr/bin/env bash
# scripts/prod-run.sh - the one gate for production department writes.
#
#   scripts/prod-run.sh scripts/dept-<x>-apply.cjs      <plan.json> --max=N [--batch=N] [--expect-db=NAME] [--execute]
#   scripts/prod-run.sh scripts/dept-<x>-articles-<y>.cjs <plan.json> --max=N [--batch=N] [--execute]
#   scripts/prod-run.sh scripts/dept-<x>-rollback.cjs   <run-id> [--plan=<frozen plan.json>] [--dept=paramedical|radiology|mlt|optometry] [--expect-db=NAME] [--execute]
#
# Three extra gates on --execute (all local, all checked before anything reaches the server):
#   - apply: the plan's ids (ISSN / e-ISSN / uuid, plus the titles of hold rows that carry no id) must not
#     appear in any coordinator-* hold file. The intersection is counted in every dry run; > 0 refuses --execute.
#   - rollback: needs --plan=<the frozen plan that created the run> (checksum-verified like an apply plan) and
#     ~/stm-evidence/approvals/<run-id>.ok containing that plan's sha256, created by the owner by hand. This script never creates it.
#   - daily caps, all sessions together, fixed in this file: journals + books 1,500 rows, articles 10,000 rows.
#
# Two more:
#   - one writer at a time: an --execute (apply or rollback) holds a global flock until it exits; a second one waits 30 s, then is refused with the holder named.
#   - lock order: the script must take its advisory locks as `select pg_advisory_xact_lock(...)` in the coordinator's order
#     2026103001 -> stm.journal.insert -> dept-radiology-book-insert, all three present; a script that takes them in another order is refused (dry run too).
#
# Without --execute it is a dry run and nothing is written. --execute is accepted only after a
# dry run of the SAME script + plan + arguments succeeded in the last hour (one dry run buys one
# real run), so the dry-run output is always on screen before anything is written.
#
# It runs nothing but those three kinds of script and nothing inline. Everything it sends to the
# server is built here from validated pieces: the container id (found, never typed), the plan
# (JSON, checksum-verified), a run id (strict pattern), and a fixed set of flags.
set -Eeuo pipefail
umask 077

HOST=root@173.199.130.49
KEY=$HOME/.ssh/claude_readonly
APP_UUID=utidqyl42yiofiqgfh0gaflh   # Coolify application uuid: stable across deploys, unlike the container id
EVID=$HOME/stm-evidence
LOGDIR=$EVID/prod-run-logs
readonly CAP_ROWS=1500              # journals + books together, rows per IST day, all sessions (reserved up front)
readonly CAP_ARTICLES=10000         # articles, rows per IST day, all sessions (reserved up front). Hardcoded on purpose: no env, no config file.
APPROVALS=$EVID/approvals           # rollback --execute needs $APPROVALS/<run-id>.ok
HOLD_FIND=(-iname '*held*.json' -o -iname '*noncompliant*.json' -o -iname '*flagged*.json')   # hold files, inside $EVID/coordinator-*
DERIVED_HELD=$EVID/coordinator-derived/held-journal-ids.json                    # the 218 held ISSNs resolved to journal uuid + eISSN (production read-only lookup); must exist
REMEDIATION=$EVID/coordinator-2026-10-30/round4/remediation-ids.json            # {"books":[uuid..],"journals":[uuid..]}; its "books" join the hold set of books-type plans
DRY_VALID_SECS=3600
EXEC_LOCK=$LOGDIR/.execute.lock     # global single-writer mutex: held (fd 8) by the one --execute that is running
EXEC_WAIT_SECS=30
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)

die() { echo "REFUSED: $*" >&2; exit 2; }
[[ $# -ge 2 ]] || die "usage: prod-run.sh <scripts/dept-*-apply|-articles-*|-rollback.cjs> <plan.json | run-id> [flags]"
script_arg=$1; target=$2; shift 2

# --- 2. allowlist: three filename shapes, directly inside this repo's scripts/, no symlinks -----
[[ -f $script_arg && ! -L $script_arg ]] || die "script missing or a symlink: $script_arg"
SCRIPT=$(realpath -e -- "$script_arg")
[[ $(dirname "$SCRIPT") == "$REPO/scripts" ]] || die "script must sit directly in $REPO/scripts"
base=$(basename "$SCRIPT")
[[ $base =~ ^[A-Za-z0-9._-]+$ ]] || die "odd characters in script name"
case "$base" in
  dept-*-rollback.cjs)                     KIND=rollback ;;
  dept-*-apply.cjs|dept-*-articles-*.cjs)  KIND=apply ;;
  *) die "$base is not on the allowlist (dept-*-apply.cjs, dept-*-articles-*.cjs, dept-*-rollback.cjs)" ;;
esac
# What the script writes decides which daily cap counts it. journals and books share one cap, articles have their own.
TYPE=-; CAP=0
if [[ $KIND == apply ]]; then
  case "$base" in
    *-articles-*) TYPE=articles; CAP=$CAP_ARTICLES ;;
    *books*)      TYPE=books;    CAP=$CAP_ROWS ;;
    *)            TYPE=journals; CAP=$CAP_ROWS ;;
  esac
fi

EXECUTE=0; BATCH=100; MAX=; DEPT=; EXPECT_DB=; ROLLBACK_PLAN=
for a in "$@"; do
  v=${a#*=}
  case "$a" in
    --execute) EXECUTE=1 ;;
    --batch=*) [[ $KIND == apply && $v =~ ^[0-9]{1,3}$ ]] && (( 10#$v >= 1 && 10#$v <= 100 )) || die "--batch is 1..100, apply only"; BATCH=$((10#$v)) ;;
    --max=*)   [[ $KIND == apply && $v =~ ^[0-9]{1,6}$ ]] && (( 10#$v >= 1 && 10#$v <= CAP )) || die "--max is 1..$CAP for $TYPE, apply only"; MAX=$((10#$v)) ;;
    --plan=*)  [[ $KIND == rollback && -n $v ]] || die "--plan is rollback only"; ROLLBACK_PLAN=$v ;;
    --dept=*)  [[ $KIND == rollback ]] || die "--dept is rollback only"
               case "$v" in paramedical) DEPT="Paramedical Sciences" ;; radiology) DEPT="Radiology" ;;
                 mlt) DEPT="Medical Laboratory Technology" ;; optometry) DEPT="Optometry & Ophthalmology" ;;
                 *) die "--dept must be paramedical|radiology|mlt|optometry" ;; esac ;;
    --expect-db=*) [[ $v =~ ^[A-Za-z0-9_]{1,63}$ ]] || die "--expect-db is [A-Za-z0-9_]"; EXPECT_DB=$v ;;
    *) die "unknown or not allowed for $KIND: $a" ;;
  esac
done

# --- lock order: every `select pg_advisory_xact_lock(...)` in the script, in file order, must follow 2026103001 -> stm.journal.insert -> dept-radiology-book-insert ---------
# (Comments that quote a call are ignored: only the SQL form `select pg_advisory_xact_lock(` counts.) Two writers that take the same locks in different orders can wait on each other.
check_lock_order() {
  local call rank prev=0 have1=0 have2=0 have3=0
  while IFS= read -r call; do
    case "$call" in
      *2026103001*)                           rank=1; have1=1 ;;
      *stm.journal.insert*|*LOCK_SQL_KEY*)    rank=2; have2=1 ;;
      *dept-radiology-book-insert*)           rank=3; have3=1 ;;
      *) die "$base takes an advisory lock this wrapper does not know: $call" ;;
    esac
    (( rank >= prev )) || die "$base takes its advisory locks out of order (needs 2026103001, then stm.journal.insert, then dept-radiology-book-insert); offending call: $call"
    prev=$rank
  done < <(grep -oiE 'select[[:space:]]+pg_advisory_xact_lock\(([^()]|\([^()]*\))*\)' "$SCRIPT")
  (( have1 && have2 && have3 )) || die "$base does not take all three advisory locks as 'select pg_advisory_xact_lock(...)' (2026103001, stm.journal.insert, dept-radiology-book-insert)"
}

# --- the script must be able to do what this wrapper relies on ---------------------------------
need() { grep -qE -- "$1" "$SCRIPT" || die "$base lacks $2"; }
need 'stm\.journal\.insert' "the shared insert lock (stm.journal.insert)"
check_lock_order
if [[ $KIND == apply ]]; then
  need "'--dry'" "a --dry mode: without it the dry run would be a real write"
  need '2026103001' "the Paramedical lock key (coordinator protocol: all three locks)"
  need 'dept-radiology-book-insert' "the Radiology book lock key (coordinator protocol: all three locks)"
  if (( EXECUTE )); then
    need "arg\('max'|--max" "--max, so the daily cap cannot be enforced"
  fi
  [[ -n $MAX ]] || die "apply needs --max=N (the row cap the daily limit counts; the dry run must use the same one)"
else
  need "'--execute'" "an --execute switch (a rollback must default to a dry run)"
fi

# --- hold check: ids of the plan vs ids of every coordinator-* hold file ---------------------------
# Hold files are JSON of three shapes (rows with "id" uuid, rows with "issn", rows with only "title"+"source");
# this does not parse by shape: every uuid / ISSN-shaped string anywhere counts as an id, on both sides. A hold row that
# carries no id at all can only be met by its normalised title, so the plan's titles are compared with those rows only.
HOLD_JS=$(cat <<'JS'
const fs = require('fs');
const [planFile, ...holdFiles] = process.argv.slice(1);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSN = /^\d{4}-\d{3}[\dX]$/i;
const idOf = s => typeof s !== 'string' ? null : UUID.test(s) ? s.toLowerCase() : ISSN.test(s) ? s.toUpperCase() : null;
const norm = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function scan(x, ids, titles, isPlan) {
  if (Array.isArray(x)) { let n = 0; for (const v of x) n += scan(v, ids, titles, isPlan); return n; }
  if (x && typeof x === 'object') {
    let n = 0; for (const v of Object.values(x)) n += scan(v, ids, titles, isPlan);
    const t = typeof x.title === 'string' ? norm(x.title) : '';
    if (t && (isPlan || n === 0)) titles.add(t);
    return n;
  }
  const id = idOf(x); if (id) { ids.add(id); return 1; }
  return 0;
}
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const holdIds = new Set(), holdTitles = new Set(), planIds = new Set(), planTitles = new Set();
for (const f of holdFiles) scan(read(f), holdIds, holdTitles, false);
scan(read(planFile), planIds, planTitles, true);
console.log(JSON.stringify({ holdFiles: holdFiles.length, holdIds: holdIds.size, holdTitleOnly: holdTitles.size,
  planIds: planIds.size, planTitles: planTitles.size,
  idHits: [...planIds].filter(i => holdIds.has(i)), titleHits: [...planTitles].filter(t => holdTitles.has(t)) }));
JS
)
HOLD_HITS=0; HOLD_LINE=-; APPROVAL_LINE=-
check_holds() {
  local files out
  mapfile -d '' -t files < <(find "$EVID"/coordinator-* -type f \( "${HOLD_FIND[@]}" \) -print0 2>/dev/null | sort -z)
  (( ${#files[@]} )) || die "no hold files found under $EVID/coordinator-*; with nothing to check against, the hold check cannot pass"
  [[ " ${files[*]} " == *" $DERIVED_HELD "* ]] || die "$DERIVED_HELD is missing: the 218 held journals are known by ISSN only without it"
  if [[ $TYPE == books ]]; then
    [[ -f $REMEDIATION ]] || die "books-type plans need $REMEDIATION in the hold set, and it is missing"
    EXTRA_HOLD=$(mktemp); jq -c '.books' "$REMEDIATION" > "$EXTRA_HOLD" || die "cannot read .books from $REMEDIATION"
    files+=("$EXTRA_HOLD")
  fi
  out=$(node -e "$HOLD_JS" "$PLAN" "${files[@]}") || die "hold check could not read the plan or a hold file (unparseable JSON?)"
  HOLD_HITS=$(jq '(.idHits|length)+(.titleHits|length)' <<<"$out")
  HOLD_LINE="$HOLD_HITS in common ($(jq '.idHits|length' <<<"$out") by id, $(jq '.titleHits|length' <<<"$out") by title) - ${#files[@]} hold files, $(jq .holdIds <<<"$out") hold ids + $(jq .holdTitleOnly <<<"$out") id-less hold rows, plan has $(jq .planIds <<<"$out") ids / $(jq .planTitles <<<"$out") titles"
  echo "hold check: $HOLD_LINE"
  if (( HOLD_HITS > 0 )); then
    jq -r '(.idHits[:20][] | "  held id: "+.), (.titleHits[:20][] | "  held title: "+.[0:90])' <<<"$out"
    echo "  (first 20 of each shown)"
  fi
}

# Sets PLAN, plan_sha and CHECKSUM_FILE for the plan at $1, or refuses. Used for an apply plan and for the plan named by rollback --plan.
verify_plan_checksum() {
  local pdir pbase expected= got c
  [[ -f $1 && ! -L $1 ]] || die "plan missing or a symlink: $1"
  PLAN=$(realpath -e -- "$1")
  [[ $PLAN == "$EVID"/*.json ]] || die "plan must be a .json under $EVID"
  plan_sha=$(sha256sum "$PLAN" | cut -d' ' -f1)
  pdir=$(dirname "$PLAN"); pbase=$(basename "$PLAN")
  for c in "$pdir"/*.sha256 "$pdir"/SHA256SUMS; do
    [[ -f $c ]] || continue
    got=$(awk -v f="$pbase" '{n=$2; sub(/^\*/,"",n); sub(/.*\//,"",n); if (n==f) print $1}' "$c" | sort -u)
    [[ -z $got ]] && continue
    [[ $(wc -l <<<"$got") -eq 1 ]] || die "$c lists $pbase with different checksums"
    expected=$got; CHECKSUM_FILE=$c; break
  done
  [[ -n $expected ]] || die "no checksum for $pbase in $pdir (*.sha256 or SHA256SUMS naming that file)"
  [[ $expected == "$plan_sha" ]] || die "plan sha256 $plan_sha != evidence checksum $expected ($CHECKSUM_FILE)"
}

# --- 3. plan checksum (apply) / run id (rollback) ----------------------------------------------
script_sha=$(sha256sum "$SCRIPT" | cut -d' ' -f1)
PREAMBLE_FILE=$(mktemp); EXTRA_HOLD=; trap 'rm -f "$PREAMBLE_FILE" "$EXTRA_HOLD"' EXIT
if [[ $KIND == apply ]]; then
  verify_plan_checksum "$target"
  compact=$(node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))))' "$PLAN") || die "plan is not valid JSON"
  printf 'var __PLAN__ = %s;\n' "$compact" > "$PREAMBLE_FILE"
  target_id=$plan_sha
  check_holds
  (( ! EXECUTE || HOLD_HITS == 0 )) || die "the plan has $HOLD_HITS row(s) in common with the coordinator hold files; --execute refused"
else
  [[ $target =~ ^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}(-[a-z0-9]+)*$ ]] || die "run id does not look like dept-...-YYYY-MM-DD-<8 hex>"
  printf 'var __RUN__ = "%s";\n' "$target" > "$PREAMBLE_FILE"
  [[ -n $DEPT ]] && printf 'var __DEPT__ = "%s";\n' "$DEPT" >> "$PREAMBLE_FILE"
  PLAN=-; plan_sha=-; CHECKSUM_FILE=-; target_id=$target
  [[ -z $ROLLBACK_PLAN ]] || verify_plan_checksum "$ROLLBACK_PLAN"
  APPROVAL=$APPROVALS/$target.ok
  if [[ ! -f $APPROVAL || -L $APPROVAL ]]; then APPROVAL_LINE="ABSENT ($APPROVAL)"
  elif [[ $plan_sha == - ]]; then APPROVAL_LINE="present, not checked (no --plan given)"
  elif awk -v s="$plan_sha" '$1 == s { f = 1 } END { exit !f }' "$APPROVAL"; then APPROVAL_LINE="present, names plan $plan_sha"
  else APPROVAL_LINE="present but does NOT name plan $plan_sha"; fi
  if (( EXECUTE )); then
    [[ $plan_sha != - ]] || die "rollback --execute needs --plan=<the frozen plan that created $target>"
    [[ $APPROVAL_LINE == "present, names plan"* ]] || die "rollback --execute needs the owner's file $APPROVAL to hold the plan's sha256 ($plan_sha) on a line of its own: $APPROVAL_LINE"
  fi
fi

if [[ $KIND == apply ]]; then
  if (( EXECUTE )); then ARGS="--batch=$BATCH --max=$MAX"; else ARGS="--dry --batch=$BATCH --max=$MAX"; fi
  ARGS="$ARGS${EXPECT_DB:+ --expect-db=$EXPECT_DB}"      # a writer that insists on knowing the database it writes to (the books publisher) gets it from here
else
  ARGS=; (( EXECUTE )) && ARGS="--execute${EXPECT_DB:+ --expect-db=$EXPECT_DB}"
fi

# --- 1. find the STM container: by name, never by a typed id; zero or two = stop ---------------
SSH=(ssh -p 22 -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 "$HOST")
listing=$("${SSH[@]}" -n "docker ps --format '{{.ID}} {{.Names}} {{.Image}}'") || die "ssh / docker ps failed"
matches=$(grep -E " ${APP_UUID}(-[0-9]{8}T[0-9]{6})? " <<<"$listing" || true)
n=$(grep -c . <<<"$matches" || true)
if [[ $n -ne 1 ]]; then echo "$matches" >&2; die "expected exactly one running STM app container, found $n (a deploy in progress?)"; fi
read -r CID CNAME CIMAGE <<<"$matches"
[[ $CID =~ ^[0-9a-f]{12}$ ]] || die "unexpected container id: $CID"

# --- 5. log -------------------------------------------------------------------------------------
mkdir -p "$LOGDIR"
now_ist() { TZ=Asia/Kolkata date +%F; }
MODE=dry; (( EXECUTE )) && MODE=EXECUTE
LOG=$LOGDIR/$(date -u +%Y%m%dT%H%M%SZ)-$MODE-${base%.cjs}.log
{
  echo "prod-run $MODE  $(date -u +%FT%TZ)  by $(id -un)@$(hostname)"
  echo "git HEAD   $(git -C "$REPO" rev-parse --short HEAD)  (script dirty: $(git -C "$REPO" status --porcelain -- "scripts/$base" | grep -q . && echo yes || echo no))"
  echo "script     $SCRIPT"; echo "script sha $script_sha"
  echo "plan/run   $PLAN  sha256 $plan_sha  (checksum file: ${CHECKSUM_FILE:--})"; [[ $KIND == rollback ]] && echo "run id     $target"
  echo "container  $CID  $CNAME  $CIMAGE"
  echo "args       $ARGS"
  echo "type/cap   $TYPE  (cap $CAP per IST day$([[ $TYPE == - ]] && echo ', not counted'))"
  echo "hold check $HOLD_LINE"
  echo "approval   $APPROVAL_LINE"
  echo "-----"
} | tee "$LOG"

stamp=$LOGDIR/.dry-ok-$(printf '%s' "$KIND|$script_sha|$target_id|$plan_sha|$BATCH|$MAX|$DEPT|$EXPECT_DB" | sha256sum | cut -c1-40)

if (( EXECUTE )); then
  [[ -f $stamp ]] || die "no successful dry run of this exact script + plan + arguments; run it without --execute first"
  age=$(( $(date +%s) - $(stat -c %Y "$stamp") ))
  (( age <= DRY_VALID_SECS )) || { rm -f "$stamp"; die "the dry run is ${age}s old (limit ${DRY_VALID_SECS}s); repeat it"; }
  # One writer at a time, apply and rollback alike. Taken before the ledger and before the dry-run stamp is spent, so a refused run costs nothing.
  # fd 8 stays open (and the lock held) until this process and its ssh child are gone.
  exec 8>>"$EXEC_LOCK"
  if ! flock -w "$EXEC_WAIT_SECS" 8; then
    die "another --execute is running (waited ${EXEC_WAIT_SECS}s). Holder: $(tr '\n' ' ' < "$EXEC_LOCK" | cut -c1-200). Run this again when it has finished."
  fi
  printf 'pid %s since %s: %s %s\n' "$$" "$(date -u +%FT%TZ)" "$base" "${target_id:0:16}" > "$EXEC_LOCK"
  if [[ $KIND == apply ]]; then
    # ledger columns: time, type (journals|books|articles), rows reserved, script, plan sha. One file per IST day, shared by every
    # session; journals and books are summed together, articles on their own. flock keeps two runs from both fitting under the cap.
    ledger=$LOGDIR/ledger-$(now_ist).tsv
    exec 9>"$LOGDIR/.ledger.lock"; flock -w 30 9 || die "ledger is locked by another run"
    used=$( [[ -f $ledger ]] && awk -F'\t' -v t="$TYPE" '{ if ((t == "articles") == ($2 == "articles")) s += $3 } END { print s+0 }' "$ledger" || echo 0 )
    (( used + MAX <= CAP )) || die "daily cap for $TYPE: $used reserved today + $MAX > $CAP"
    printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$TYPE" "$MAX" "$base" "$plan_sha" >> "$ledger"
    flock -u 9
  fi
  rm -f "$stamp"   # one dry run buys one real run
fi

set +e
{ cat "$PREAMBLE_FILE"; cat "$SCRIPT"; } | "${SSH[@]}" "docker exec -i -w /app $CID node - $ARGS" 2>&1 | tee -a "$LOG"
rc=${PIPESTATUS[1]}
set -e
echo "----- exit $rc" | tee -a "$LOG"

if (( rc != 0 )); then echo "STOPPED: the script exited $rc (its own auto-stop or an error). Nothing is retried. Log: $LOG" >&2; exit "$rc"; fi
if (( ! EXECUTE && HOLD_HITS > 0 )); then echo "Dry run ok, but $HOLD_HITS row(s) are on the coordinator hold list: --execute will be refused until the plan is fixed. Log: $LOG"
elif (( ! EXECUTE )); then touch "$stamp"; echo "Dry run ok. Look at it, then repeat the same command with --execute within $((DRY_VALID_SECS/60)) min. Log: $LOG"; fi
