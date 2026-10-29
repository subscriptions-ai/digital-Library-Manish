/**
 * Verify a Book import. READ ONLY (one REPEATABLE READ, READ ONLY transaction). Plain Node + @prisma/client:
 *
 *   (printf 'var __PLAN__ = %s;\nvar __RUN__ = "%s";\n' "$(cat plan.json)" "$RUN"; cat scripts/book-import-verify.cjs) | node - [--ids=ids.json-in-__IDS__]
 *
 * For every row written under the run id (found through the audit entries, so what is checked is what was really inserted) it checks that the stored
 * row is exactly what the frozen manifest said, that the rights shape is "listed as a record only", that no second copy of the book exists, and that the audit
 * accounts for every id and for nothing else. It writes nothing.
 */
const { PrismaClient } = require('@prisma/client');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
(async () => {
  const p = new PrismaClient();
  const plan = __PLAN__, runId = __RUN__;
  const res = await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const q = async (sql, ...a) => JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(sql, ...a), (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    const snapshot = (await q('select now() as at, current_database() as db'))[0];
    const audits = await q(`select id, meta from "IngestionAudit" where action = 'BOOK_SOURCE_IMPORT' and meta->>'runId' = $1 order by (meta->>'batch')::int`, runId);
    const audited = audits.flatMap(a => (a.meta.inserted || []).map(x => x.id));
    const rows = audited.length ? await q(`select * from "Book" where id = any($1::text[])`, audited) : [];
    const byFp = new Map(plan.rows.map(r => [r.fingerprint, r]));
    const problems = []; const bump = (k, id, detail) => problems.push({ check: k, id, detail });
    for (const r of rows) {
      const m = byFp.get(r.fingerprint); const e = m && m.row;
      if (!e) { bump('in_manifest', r.id, r.title); continue; }
      if (r.status !== 'Published') bump('status', r.id, r.status);
      if (r.domain !== e.domain) bump('department', r.id, `${r.domain} vs ${e.domain}`);
      if (r.licence !== e.licence) bump('licence', r.id, `${r.licence} vs ${e.licence}`);
      if (r.title !== e.title || (r.isbn ?? null) !== (e.isbn ?? null) || (r.doi ?? null) !== (e.doi ?? null) || (r.year ?? null) !== (e.year ?? null)) bump('fields', r.id, 'title/isbn/doi/year differ');
      if (r.pdfUrl) bump('rights:file_address', r.id, r.pdfUrl);
      if (r.accessStatus === 'ViewableHere') bump('rights:viewable_here', r.id, r.accessStatus);
      if (r.rightsStatus !== 'MetadataOnly') bump('rights:status', r.id, r.rightsStatus);
      if (r.ownershipSource !== 'Ingested') bump('ownership', r.id, r.ownershipSource);
      if (!r.domain) bump('department_missing', r.id, '');
      if (!(r.year >= (plan.bookMinYear || 2001))) bump('year_policy', r.id, String(r.year));
      if (!r.originalUrl) bump('landing_page', r.id, '');
    }
    // A second copy anywhere in the Book table, by any identity.
    const dupIsbn = audited.length ? await q(`select b.id, b.isbn from "Book" b where b.isbn is not null and upper(regexp_replace(b.isbn,'[^0-9Xx]','','g')) in (select upper(regexp_replace(isbn,'[^0-9Xx]','','g')) from "Book" where id = any($1::text[]) and isbn is not null) group by b.id, b.isbn having count(*) >= 1`, audited) : [];
    const isbnCount = new Map(); for (const d of dupIsbn) { const k = String(d.isbn).replace(/[^0-9Xx]/g, '').toUpperCase(); isbnCount.set(k, (isbnCount.get(k) || 0) + 1); }
    for (const [k, n] of isbnCount) if (n > 1) bump('duplicate_isbn', k, `${n} rows`);
    const dupDoi = audited.length ? await q(`select lower(doi) d, count(*)::int n from "Book" where doi is not null and lower(doi) in (select lower(doi) from "Book" where id = any($1::text[]) and doi is not null) group by 1 having count(*) > 1`, audited) : [];
    for (const d of dupDoi) bump('duplicate_doi', d.d, `${d.n} rows`);
    const titles = audited.length ? await q(`select b.id, b.title, b.authors, b.year, b.edition from "Book" b where btrim(regexp_replace(lower(b.title), '[^a-z0-9]+', ' ', 'g')) in (select btrim(regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g')) from "Book" where id = any($1::text[]))`, audited) : [];
    const ours = new Set(audited); const seen = new Map();
    for (const t of titles) { const k = `${norm(t.title)}|${norm(String(t.authors || '').split(/;|\band\b/)[0].split(',')[0].trim().split(/\s+/).pop())}|${t.year ?? ''}|${norm(t.edition)}`; const l = seen.get(k) || []; l.push(t); seen.set(k, l); }
    let titleTwins = 0; for (const l of seen.values()) if (l.length > 1 && l.some(x => ours.has(x.id))) { titleTwins++; if (titleTwins <= 20) bump('duplicate_title_author_year', l[0].id, l[0].title); }
    const totals = (await q(`select count(*)::int books, count(*) filter (where status = 'Published')::int published from "Book"`))[0];
    return { snapshot, audits: audits.length, auditedIds: audited.length, rowsFound: rows.length, uniqueAuditedIds: new Set(audited).size, titleTwins, problems, totals,
      byDepartment: rows.reduce((m, r) => (m[r.domain] = (m[r.domain] || 0) + 1, m), {}), ids: audited };
  }, { timeout: 120000, maxWait: 20000 });
  await p.$disconnect();
  const ok = res.problems.length === 0 && res.rowsFound === res.auditedIds && res.uniqueAuditedIds === res.auditedIds;
  process.stdout.write(JSON.stringify({ runId, ok, ...res }, null, 1) + '\n');
})().catch(e => { console.error('VERIFY FAILED', String((e && e.message) || e).slice(0, 400)); process.exit(1); });
