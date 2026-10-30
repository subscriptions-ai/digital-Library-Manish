/**
 * Run-ID scoped rollback for the Medical Laboratory Technology journal inserts. NOT RUN by the insert session: it exists so a rollback is one reviewed command, and it needs an explicit
 * --execute (default is a dry run that only reports).
 *
 *   (printf 'var __RUN__ = "%s";\n' dept-mlt-...; cat scripts/dept-mlt-rollback.cjs) | docker exec -i -w /app <app> node - [--execute]
 *
 * Scope: ONLY the ids the run's own IngestionAudit rows (action JOURNAL_SOURCE_IMPORT, meta.runId) list as inserted, and only those that are still exactly what the run wrote
 * (department Medical Laboratory Technology, status MetadataOnly, rightsBasis "... listing — OA unverified") AND that nothing references: no Article (by id or ISSN), no IngestionRun,
 * no LibraryEvent, and no row in ANY table with a foreign key to Journal. Anything else is left in place and listed. Executes under the shared insert lock, in one transaction,
 * and writes one IngestionAudit row (action JOURNAL_SOURCE_ROLLBACK). The run's own audit rows are never deleted.
 */
const { PrismaClient } = require('@prisma/client');
const EXEC = process.argv.includes('--execute');
(async () => { const p = new PrismaClient();
  if (typeof __RUN__ === 'undefined' || !/^dept-mlt-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(__RUN__)) { console.error('set var __RUN__ = "dept-mlt-<date>-<8 hex>";'); process.exit(2); }
  const result = await p.$transaction(async tx => {
    if (EXEC) { await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '60s'`); await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); } else { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); }
    const audits = await tx.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' = $1`, __RUN__);
    const ids = audits.flatMap(a => (a.meta.inserted || []).map(x => x.id));
    const rows = await tx.$queryRawUnsafe(`select id, issn, eissn, title, domain, status::text status, "rightsBasis" basis from "Journal" where id = any($1::text[])`, ids);
    const fks = await tx.$queryRawUnsafe(`select conrelid::regclass::text tbl, a.attname col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where c.confrelid = '"Journal"'::regclass and c.contype = 'f'`);
    const keep = [], del = [];
    for (const r of rows) {
      const why = [];
      if (r.domain !== 'Medical Laboratory Technology') why.push('department changed');
      if (r.status !== 'MetadataOnly') why.push('status changed to ' + r.status);
      if (!/listing — OA unverified$/.test(r.basis || '')) why.push('rights label changed');
      for (const f of fks) { const n = (await tx.$queryRawUnsafe(`select count(*)::int n from ${f.tbl} where "${f.col}" = $1`, r.id))[0].n; if (n) why.push(`${n} row(s) in ${f.tbl}.${f.col}`); }
      const art = (await tx.$queryRawUnsafe(`select count(*)::int n from "Article" where "journalId" = $1 or "journalIssn" = any($2::text[])`, r.id, [r.issn, r.eissn].filter(Boolean)))[0].n; if (art) why.push(`${art} article(s)`);
      const ev = (await tx.$queryRawUnsafe(`select count(*)::int n from "LibraryEvent" where "journalId" = $1`, r.id))[0].n; if (ev) why.push(`${ev} library event(s)`);
      (why.length ? keep : del).push({ id: r.id, issn: r.issn, title: r.title, why });
    }
    const missing = ids.filter(i => !rows.find(r => r.id === i));
    let deleted = 0;
    if (EXEC && del.length) {
      deleted = (await tx.journal.deleteMany({ where: { id: { in: del.map(d => d.id) } } })).count;
      await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-source-import', action: 'JOURNAL_SOURCE_ROLLBACK', meta: { runId: __RUN__, at: new Date().toISOString(), deleted: del.map(d => d.id), kept: keep } } });
    }
    return { run: __RUN__, mode: EXEC ? 'EXECUTED' : 'dry run (nothing changed)', listedByAudit: ids.length, stillPresent: rows.length, alreadyAbsent: missing.length, wouldDelete: del.length, deleted, kept: keep };
  }, { timeout: 150000, maxWait: 20000 });
  process.stdout.write(JSON.stringify(result, null, 1)); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
