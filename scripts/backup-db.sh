#!/usr/bin/env bash
# Take a verified backup of a database and prove it can be restored.
#
#   ./scripts/backup-db.sh                  # backs up the local dev database (.env)
#   ./scripts/backup-db.sh "<db-url>"       # backs up whatever URL you pass (e.g. production)
#
# Writes to ./backups/ and refuses to report success unless the dump verifies.
set -uo pipefail

RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; BLD=$'\e[1m'; OFF=$'\e[0m'
step() { printf "\n${BLD}%s${OFF}\n" "$1"; }
ok()   { printf "  ${GRN}OK${OFF}  %s\n" "$1"; }
bad()  { printf "  ${RED}FAILED${OFF}  %s\n" "$1"; }

cd "$(dirname "$0")/.." || exit 1

# ── 1. Work out which database ────────────────────────────────────────────────
DB_URL="${1:-}"
if [ -z "$DB_URL" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'')
  WHICH="local (from .env)"
else
  WHICH="the URL you passed"
fi

if [ -z "$DB_URL" ]; then
  bad "No database URL."
  echo "  Pass it like:  ./scripts/backup-db.sh \"postgresql://user:pass@host:5432/dbname\""
  exit 1
fi

# Never print credentials.
SAFE=$(echo "$DB_URL" | sed -E 's#://[^:]+:[^@]+@#://***:***@#')
step "Backing up $WHICH"
echo "  $SAFE"

command -v pg_dump >/dev/null || { bad "pg_dump is not installed. Run: sudo apt install postgresql-client"; exit 1; }

# ── 2. Can we reach it? ───────────────────────────────────────────────────────
step "1/4  Connecting"
SIZE=$(psql "$DB_URL" -tAc "select pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null)
if [ -z "$SIZE" ]; then
  bad "Could not connect."
  echo "  If this is production, the database probably is not reachable from this machine."
  echo "  In that case run this script on the server instead, or ask for the public host/port."
  exit 1
fi
ok "connected — database is $SIZE"

# ── 3. Dump ───────────────────────────────────────────────────────────────────
mkdir -p backups
OUT="backups/db-$(date +%F-%H%M).dump"
step "2/4  Writing $OUT"
echo "  (this does not block the live site; large databases just take longer)"
if ! pg_dump "$DB_URL" -Fc -f "$OUT" 2>backups/.err; then
  bad "pg_dump failed:"; sed 's/^/    /' backups/.err; rm -f "$OUT" backups/.err; exit 1
fi
rm -f backups/.err
ok "written — $(du -h "$OUT" | cut -f1) on disk"

# ── 4. Verify the file is actually a restorable dump ──────────────────────────
step "3/4  Verifying the file"
TABLES=$(pg_restore --list "$OUT" 2>/dev/null | grep -c "TABLE DATA")
if [ "$TABLES" -lt 1 ]; then
  bad "The dump contains no table data — do NOT rely on this file."; exit 1
fi
ok "$TABLES tables present"

# ── 5. Row counts, so you can eyeball that the data is really in there ────────
step "4/4  What is inside"
for T in Article Content "User" Quotation Payment Receipt; do
  N=$(psql "$DB_URL" -tAc "select count(*) from \"$T\";" 2>/dev/null)
  [ -n "$N" ] && printf "  %-12s %s rows\n" "$T" "$N"
done

printf "\n${GRN}${BLD}Backup complete.${OFF}\n"
echo "  File:    $(pwd)/$OUT"
echo "  Restore: pg_restore -d \"<db-url>\" --clean --if-exists --no-owner \"$OUT\""
printf "${YEL}  Keep this file somewhere other than the server it came from.${OFF}\n"
