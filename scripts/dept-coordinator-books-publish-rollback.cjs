/**
 * Guarded rollback of a coordinator publication run: Published -> Draft for exactly the ids that run's BOOK_SOURCE_PUBLISH audit rows list, and ONLY while each book is still what the run left:
 * status Published and metadata.reviewPublication.runId = this run. Removes only metadata.reviewPublication. Nothing else is touched; a book changed since is skipped and listed.
 * Wrapper form: scripts/prod-run.sh scripts/dept-coordinator-books-publish-rollback.cjs <run-id> --plan=<the plan that published it> --expect-db=postgres [--execute]   (identical to dept-coordinator-books-unpublish.cjs)
 *   (printf 'var __RUN__ = "%s";\n' <runId>; cat scripts/dept-coordinator-books-unpublish.cjs) | docker exec -i -w /app <app> node - [--execute --expect-db=<name>]     (default: dry run)
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const EXEC = process.argv.includes('--execute');
(async () => {
  const p = new PrismaClient(); const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (EXEC && arg('expect-db', '') !== db) { console.error('REFUSED: --expect-db does not match'); process.exit(2); }
  const res = await p.$transaction(async (tx) => {
    if (EXEC) { await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '60s'`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(2026103001::bigint)`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`); } else await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const a = await tx.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'BOOK_SOURCE_PUBLISH' and meta->>'runId' = $1`, __RUN__);
    const ids = a.flatMap(x => x.meta.published || []); const back = [], keep = [];
    for (const id of ids) {
      if (!EXEC) { const m = await tx.$queryRawUnsafe(`select id from "Book" where id = $1 and status = 'Published' and metadata->'reviewPublication'->>'runId' = $2`, id, __RUN__); (m.length ? back : keep).push(id); continue; }
      const u = await tx.$queryRawUnsafe(`update "Book" set status = 'Draft', "updatedAt" = now(), metadata = metadata - 'reviewPublication' where id = $1 and status = 'Published' and metadata->'reviewPublication'->>'runId' = $2 returning id`, id, __RUN__);
      (u.length ? back : keep).push(id);
    }
    if (EXEC && back.length) await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: 'BOOK_SOURCE_UNPUBLISH', meta: { runId: __RUN__, at: new Date().toISOString(), restoredToDraft: back, skipped: keep } } });
    return { runId: __RUN__, mode: EXEC ? 'EXECUTED' : 'dry run', listed: ids.length, restoreable: back.length, skippedBecauseChanged: keep.length };
  }, { timeout: 120000 });
  process.stdout.write(JSON.stringify(res)); await p.$disconnect();
})().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
