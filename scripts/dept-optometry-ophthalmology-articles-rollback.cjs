/**
 * Run-ID scoped rollback for the Optometry & Ophthalmology article backfill (scripts/dept-optometry-ophthalmology-articles-apply.cjs). NOT RUN by the insert session:
 * it exists so a rollback is one reviewed command, and the default is a dry run that only reports.
 *
 *   scripts/prod-run.sh scripts/dept-optometry-ophthalmology-articles-rollback.cjs <run-id> --plan=<the frozen plan that created it> [--execute]
 * which runs, inside the STM app container:
 *   (printf 'var __RUN__ = "%s";\n' <run-id>; cat this-file) | node - [--execute]
 *
 * Scope: ONLY the ids the run's own IngestionAudit rows (ARTICLE_BACKFILL_IMPORT, meta.runId) list as inserted, and only those still exactly what the run wrote:
 *   source Crossref or EuropePMC, status Published, accessStatus LinkOnly, createdBy "ArticleBackfill:<run-id>", fingerprint doi:<doi>, department Optometry & Ophthalmology, no views,
 *   no abstract, no file, AND referenced by nothing: no row in ANY table with a foreign key to Article, and no row in a table with an articleId / article_id column.
 * Anything else is kept and listed with the reason. Nothing is ever deleted by source, department or journal alone, and the run's own audit rows are never deleted.
 * Executes under the three shared locks, in the coordinator's order, in one transaction, and writes one IngestionAudit row (ARTICLE_BACKFILL_ROLLBACK) only if it deleted something.
 */
const { PrismaClient } = require('@prisma/client');
const EXEC = process.argv.includes('--execute');
const DEPARTMENT = 'Optometry & Ophthalmology';
const RUN_RE = /^dept-optometry-ophthalmology-articles-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/;

(async () => {
  const p = new PrismaClient();
  if (typeof __RUN__ === 'undefined' || !RUN_RE.test(__RUN__)) { console.error('set var __RUN__ = "dept-optometry-ophthalmology-articles-<date>-<8 hex>";'); process.exit(3); }
  const result = await p.$transaction(async (tx) => {
    if (EXEC) {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '60s'`);
      await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(2026103001::bigint)`);
      await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`);
      await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`);
    } else {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    }
    const audits = await tx.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'ARTICLE_BACKFILL_IMPORT' and meta->>'runId' = $1`, __RUN__);
    const ids = audits.flatMap((a) => (a.meta.inserted || []).map((x) => x.id));
    const rows = ids.length ? await tx.$queryRawUnsafe(
      `select id, doi, source, status, "accessStatus" access, "createdBy" created_by, fingerprint, domain, views, abstract is not null has_abstract, "pdfUrl" is not null has_file
         from "Article" where id = any($1::text[])`, ids) : [];
    // every way something can point at an article: declared foreign keys, plus any table with an articleId / article_id column
    const fks = await tx.$queryRawUnsafe(`select conrelid::regclass::text tbl, format('%I', a.attname) col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where c.confrelid = '"Article"'::regclass and c.contype = 'f'`);
    const cols = await tx.$queryRawUnsafe(`select format('%I.%I', table_schema, table_name) tbl, format('%I', column_name) col from information_schema.columns where column_name in ('articleId', 'article_id') and table_schema = 'public'`);
    // tbl and col come from the catalogue already quoted for SQL (regclass::text and format %I); the same table can arrive from both queries.
    const refs = new Map(); for (const f of [...fks, ...cols]) refs.set(`${f.tbl.replace(/"|^public\./g, '')}.${f.col.replace(/"/g, '')}`, f);
    const keep = [], del = [];
    for (const r of rows) {
      const why = [];
      if (r.created_by !== `ArticleBackfill:${__RUN__}`) why.push('createdBy changed');
      if (!['Crossref', 'EuropePMC'].includes(r.source)) why.push(`source is ${r.source}`);
      if (r.status !== 'Published') why.push(`status is ${r.status}`);
      if (r.access !== 'LinkOnly') why.push(`accessStatus is ${r.access}`);
      if (r.fingerprint !== `doi:${String(r.doi || '').toLowerCase()}`) why.push('fingerprint changed');
      if (r.domain !== DEPARTMENT) why.push(`department is ${r.domain}`);
      if (r.views > 0) why.push(`${r.views} view(s)`);
      if (r.has_abstract) why.push('an abstract was added');
      if (r.has_file) why.push('a file was added');
      for (const f of refs.values()) {
        // no catch: a reference check that cannot run must stop the rollback, not pass it
        const n = (await tx.$queryRawUnsafe(`select count(*)::int n from ${f.tbl} where ${f.col}::text = $1`, r.id))[0].n;
        if (n) why.push(`${n} row(s) in ${f.tbl}.${f.col}`);
      }
      (why.length ? keep : del).push({ id: r.id, doi: r.doi, why });
    }
    const missing = ids.filter((i) => !rows.some((r) => r.id === i));
    let deleted = 0;
    if (EXEC && del.length) {
      const res = await tx.$executeRawUnsafe(`delete from "Article" where id = any($1::text[]) and "createdBy" = $2 and status = 'Published' and views = 0`, del.map((d) => d.id), `ArticleBackfill:${__RUN__}`);
      deleted = Number(res);
      if (deleted !== del.length) throw new Error(`deleted ${deleted} but expected ${del.length}; rolled back`);
      await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'article-backfill-rollback', action: 'ARTICLE_BACKFILL_ROLLBACK', meta: {
        runId: __RUN__, at: new Date().toISOString(), deleted: del.map((d) => ({ id: d.id, doi: d.doi })), kept: keep.map((k) => ({ id: k.id, why: k.why })), alreadyGone: missing.length } } });
    }
    return { runId: __RUN__, executed: EXEC, auditRows: audits.length, listedByRun: ids.length, found: rows.length, alreadyGone: missing.length,
      wouldDelete: EXEC ? undefined : del.length, deleted: EXEC ? deleted : undefined, kept: keep.length, keptDetail: keep.slice(0, 50),
      referencingTables: [...refs.keys()] };
  }, { timeout: 150000, maxWait: 20000 });
  process.stdout.write(JSON.stringify(result));
  await p.$disconnect();
})().catch((e) => { console.error('FAILED', String((e && e.message) || e).slice(0, 400)); process.exitCode = /lock timeout|55P03/i.test(String(e && e.message)) ? 7 : 5; });
