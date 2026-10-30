/**
 * Guarded rollback of a BOOK INSERTION run (any of the four departments): deletes exactly the ids the run's own BOOK_SOURCE_IMPORT audit rows list, and only a book that is still
 *   - in the department named in the header, status Draft (a Published one is first returned to Draft by scripts/dept-coordinator-books-unpublish.cjs), Ingested, no file,
 *   - and referenced by NOTHING: no row in any table with a bookId / book_id column, and no chapter.
 * Anything else is kept and listed. Never deletes by source label or department alone. Default is a dry run (READ ONLY).
 *   (printf 'var __RUN__ = "%s"; var __DEPT__ = "%s";\n' <runId> "<department>"; cat scripts/dept-coordinator-books-rollback.cjs) | docker exec -i -w /app <app> node - [--execute --expect-db=<name>]
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const EXEC = process.argv.includes('--execute');
(async () => {
  const p = new PrismaClient(); const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (EXEC && arg('expect-db', '') !== db) { console.error('REFUSED: --expect-db does not match'); process.exit(2); }
  const r = await p.$transaction(async (tx) => {
    if (EXEC) { await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '60s'`); await tx.$executeRawUnsafe('select pg_advisory_xact_lock(2026103001::bigint)'); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`); } else await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const a = await tx.$queryRawUnsafe(`select meta->'inserted' ins from "IngestionAudit" where action = 'BOOK_SOURCE_IMPORT' and meta->>'runId' = $1`, __RUN__);
    const ids = [...new Set(a.flatMap(x => (x.ins || []).map(i => i.id).filter(Boolean)))];
    const cols = await tx.$queryRawUnsafe(`select table_name t, column_name c from information_schema.columns where table_schema = 'public' and column_name in ('bookId','book_id') and table_name <> 'Book'`);
    const referenced = new Set(), refTables = {};
    for (const { t, c } of cols) { const hit = await tx.$queryRawUnsafe(`select distinct "${c}" k from "${t}" where "${c}" = any($1::text[])`, ids); if (hit.length) { refTables[t] = hit.length; hit.forEach(h => referenced.add(h.k)); } }
    const rows = await tx.$queryRawUnsafe(`select id, domain, status, "ownershipSource" own, "pdfUrl" pdf from "Book" where id = any($1::text[])`, ids);
    const removable = rows.filter(x => x.domain === __DEPT__ && x.status === 'Draft' && x.own === 'Ingested' && !x.pdf && !referenced.has(x.id)).map(x => x.id);
    const kept = rows.filter(x => !removable.includes(x.id)).map(x => ({ id: x.id, why: referenced.has(x.id) ? 'referenced' : x.status !== 'Draft' ? `status ${x.status} (unpublish first)` : 'changed since the run' }));
    let deleted = 0;
    if (EXEC && removable.length) { deleted = await tx.$executeRawUnsafe(`delete from "Book" where id = any($1::text[])`, removable); await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: 'BOOK_SOURCE_ROLLBACK', meta: { runId: __RUN__, at: new Date().toISOString(), deleted: removable, kept } } }); }
    return { runId: __RUN__, mode: EXEC ? 'EXECUTED' : 'dry run', listedByAudit: ids.length, foundNow: rows.length, removable: removable.length, deleted, keptCount: kept.length, keptReasons: kept.reduce((m, k) => (m[k.why] = (m[k.why] || 0) + 1, m), {}), referencedBy: refTables };
  }, { timeout: 120000 });
  process.stdout.write(JSON.stringify(r)); await p.$disconnect();
})().catch(e => { console.error('ROLLBACK FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
