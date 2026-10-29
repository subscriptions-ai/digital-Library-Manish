/**
 * Read-only production check, run through `docker exec -i -w /app <app> node -` with a header line that sets the inputs:
 *   var __IDS__ = [...inserted journal ids...];  (empty for the "before" snapshot)
 *   var __PLAN__ = {rows:[...]};                 (the rows that were written, for field-by-field comparison; may be omitted)
 * One READ ONLY transaction. Prints JSON: counts per target department (total / public / public with a published article), status totals, a content hash of every row that is NOT in
 * __IDS__ (proves existing records are unchanged), and for the inserted rows: field checks, duplicate ISSNs, cross-field identifier collisions, same-title rows, attached articles, audit rows.
 */
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const IDS = typeof __IDS__ !== 'undefined' ? __IDS__ : [];
const PLAN = typeof __PLAN__ !== 'undefined' ? __PLAN__ : null;
const RUN = typeof __RUN__ !== 'undefined' ? __RUN__ : null;
const TARGETS = ['Electrical Engineering', 'Electronics & Telecommunication Engineering', 'Mechanical Engineering', 'Applied Mechanics', 'Pharmacy', 'Bio Technology', 'Chemical Engineering', 'Nano Technology', 'Architecture', 'Physiotherapy', 'Ayurveda', 'Engineering'];
(async () => { const p = new PrismaClient();
  const r = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 120000');
    const out = { at: new Date().toISOString() };
    out.db = (await tx.$queryRawUnsafe('select current_database() d'))[0].d;
    out.status = Object.fromEntries((await tx.$queryRawUnsafe(`select status::text s, count(*)::int n from "Journal" group by 1`)).map(x => [x.s, x.n]));
    out.total = (await tx.$queryRawUnsafe(`select count(*)::int n from "Journal"`))[0].n;
    const dep = await tx.$queryRawUnsafe(`select j.domain d, count(*)::int total,
        count(*) filter (where j.status::text in ('Accepted','MetadataOnly'))::int pub,
        count(*) filter (where j.status::text in ('Accepted','MetadataOnly') and exists (select 1 from "Article" a where a."journalId"=j.id and a.status::text='Published'))::int "pubWithArticles",
        count(*) filter (where j.status::text='NeedsReview')::int "needsReview" from "Journal" j where j.domain = any($1::text[]) group by 1`, TARGETS);
    out.departments = Object.fromEntries(dep.map(x => [x.d, { total: x.total, public: x.pub, publicWithPublishedArticles: x.pubWithArticles, needsReview: x.needsReview }]));
    const rows = await tx.$queryRawUnsafe(`select id, title, issn, eissn, status::text status, domain, "publisherName" pub, "rightsBasis" basis, "openAccess" oa, licence, "licenceIsNC" nc, homepage, country, subjects, "rightsVerifiedAt" rva from "Journal" order by id`);
    const ids = new Set(IDS);
    const h = crypto.createHash('sha256'); let n = 0;
    for (const x of rows) if (!ids.has(x.id)) { h.update(JSON.stringify([x.id, x.title, x.issn, x.eissn, x.status, x.domain, x.pub, x.basis, x.oa, x.licence, x.nc, x.homepage, x.country, x.subjects, x.rva])); n++; }
    out.existingRowsHash = { rows: n, sha256: h.digest('hex') };
    if (IDS.length) {
      const mine = rows.filter(x => ids.has(x.id)); out.inserted = { requested: IDS.length, found: mine.length };
      const bad = [];
      for (const x of mine) {
        const pr = PLAN && PLAN.rows.find(q => q.issn === x.issn);
        const problems = [];
        if (x.status !== 'MetadataOnly') problems.push('status ' + x.status);
        if (x.oa !== false) problems.push('openAccess not false'); if (x.licence != null) problems.push('licence set'); if (x.nc != null) problems.push('licenceIsNC set'); if (x.rva != null) problems.push('rightsVerifiedAt set');
        if (!/listing — OA unverified$/.test(x.basis || '')) problems.push('rightsBasis ' + x.basis);
        if (!x.pub) problems.push('no publisher');
        if (pr) { if (pr.title !== x.title) problems.push('title differs'); if (pr.domain !== x.domain) problems.push('department differs'); if ((pr.eissn || null) !== (x.eissn || null)) problems.push('eissn differs'); }
        if (problems.length) bad.push({ id: x.id, title: x.title, problems });
      }
      out.inserted.fieldProblems = bad;
      out.inserted.byDepartment = mine.reduce((a, x) => (a[x.domain] = (a[x.domain] || 0) + 1, a), {});
      // identifiers: every inserted ISSN/e-ISSN must appear in exactly one row in the whole table, in either column
      const byIssn = new Map(); for (const x of rows) for (const k of [x.issn, x.eissn]) if (k) (byIssn.get(k) || byIssn.set(k, new Set()).get(k)).add(x.id);
      out.inserted.identifierCollisions = mine.flatMap(x => [x.issn, x.eissn].filter(Boolean).filter(k => byIssn.get(k).size > 1).map(k => ({ id: x.id, issn: k, rows: [...byIssn.get(k)] })));
      const byTitle = new Map(); for (const x of rows) { const t = String(x.title).toLowerCase().trim(); (byTitle.get(t) || byTitle.set(t, []).get(t)).push(x.id); }
      out.inserted.sameTitleRows = mine.filter(x => byTitle.get(String(x.title).toLowerCase().trim()).length > 1).map(x => ({ id: x.id, title: x.title }));
      out.inserted.articlesAttached = (await tx.$queryRawUnsafe(`select count(*)::int n from "Article" where "journalId" = any($1::text[])`, IDS))[0].n;
      out.inserted.createdWindow = (await tx.$queryRawUnsafe(`select min("createdAt") a, max("createdAt") b from "Journal" where id = any($1::text[])`, IDS))[0];
    }
    if (RUN) out.auditRows = (await tx.$queryRawUnsafe(`select id, at, action, meta->>'batch' batch, jsonb_array_length(meta->'inserted') n from "IngestionAudit" where action='JOURNAL_SOURCE_IMPORT' and meta->>'runId'=$1 order by at`, RUN));
    if (RUN) {
      // the ids the audit rows themselves recorded (id, issn, department, source): the authoritative list of what this run inserted
      const a = await tx.$queryRawUnsafe(`select meta->>'batch' batch, e->>'id' id, e->>'issn' issn, e->>'eissn' eissn, e->>'dept' dept, e->>'sourceId' "sourceId" from "IngestionAudit" a, jsonb_array_elements(a.meta->'inserted') e where a.action='JOURNAL_SOURCE_IMPORT' and a.meta->>'runId'=$1 order by a.at, e->>'id'`, RUN);
      out.auditInserted = a;
    }
    return out; });
  process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error('VERIFY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
