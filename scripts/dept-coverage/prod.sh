#!/bin/sh
# Usage: PROD_HOST=user@host PROD_KEY=~/.ssh/key scripts/dept-coverage/prod.sh <command>
# Thin wrappers around the one production access path this run uses (SSH to the Coolify host, then `docker exec` in the STM app container). Nothing here writes
# except `apply`, and that only through scripts/journal-source-apply.cjs (create-only, re-checks identifiers and titles against the live table before every insert).
#   prod.sh container                      print the STM app container id
#   prod.sh verify <ids.json|-> [plan.json] [runId]   read-only verification (scripts/dept-coverage/verify-prod.cjs)
#   prod.sh newrows <iso-time>             journals created after that instant (read-only)
#   prod.sh rollback-review <ids.json> <runId>   dependency counts for a rollback (read-only; a rollback is never executed by this run)
#   prod.sh apply <plan.json> [--dry]      create-only insert, batches of <= 100, one IngestionAudit row per batch
set -e
# The host and the SSH key are not kept in the repository: export PROD_HOST (user@host) and PROD_KEY (path to the private key) first.
: "${PROD_HOST:?set PROD_HOST=user@host}"; : "${PROD_KEY:?set PROD_KEY=path to the SSH private key}"
KEY=$PROD_KEY; HOST=$PROD_HOST
HERE=$(cd "$(dirname "$0")/.." && pwd)
ssh_() { ssh -o IdentitiesOnly=yes -i "$KEY" -o ConnectTimeout=20 "$HOST" "$@"; }
container() { ssh_ 'docker ps --filter name=utidqyl42yiofiqgfh0gaflh --format "{{.ID}}"' | head -1; }
case "$1" in
  container) container ;;
  verify)
    C=$(container); IDS=${2:--}; PLAN=${3:-}; RUN=${4:-}
    { if [ "$IDS" != "-" ]; then printf 'var __IDS__ = %s;\n' "$(cat "$IDS")"; fi
      if [ -n "$PLAN" ]; then printf 'var __PLAN__ = %s;\n' "$(cat "$PLAN")"; fi
      if [ -n "$RUN" ]; then printf 'var __RUN__ = "%s";\n' "$RUN"; fi
      cat "$HERE/dept-coverage/verify-prod.cjs"; } | ssh_ "docker exec -i -w /app $C node -" ;;
  newrows)
    C=$(container); { printf 'var __SINCE__ = "%s";\n' "$2"; cat "$HERE/dept-coverage/new-rows.cjs"; } | ssh_ "docker exec -i -w /app $C node -" ;;
  rollback-review)
    C=$(container); { printf 'var __IDS__ = %s;\n' "$(cat "$2")"; printf 'var __RUN__ = "%s";\n' "$3"; cat "$HERE/dept-coverage/rollback-review.cjs"; } | ssh_ "docker exec -i -w /app $C node -" ;;
  active-runs)
    C=$(container); ssh_ "docker exec -i -w /app $C node -" < "$HERE/dept-coverage/active-runs.cjs" ;;
  audit-backfill)
    C=$(container); { printf 'var __PLAN__ = %s;\n' "$(cat "$2")"; printf 'var __BATCH__ = %s;\n' "$3"; printf 'var __NOTE__ = %s;\n' "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$4")"; cat "$HERE/dept-coverage/audit-backfill.cjs"; } | ssh_ "docker exec -i -w /app $C node -" ;;
  apply)
    C=$(container); PLAN=$2; shift 2
    { printf 'var __PLAN__ = %s;\n' "$(cat "$PLAN")"; cat "$HERE/journal-source-apply.cjs"; } | ssh_ "docker exec -i -w /app $C node - --batch=100 $*" ;;
  *) echo "usage: prod.sh container|verify|apply" >&2; exit 2 ;;
esac
