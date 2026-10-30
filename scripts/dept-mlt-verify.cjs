/**
 * READ-ONLY production verification for the Medical Laboratory Technology run. Header lines set the inputs:
 *   var __IDS__ = [...inserted journal ids...];   (empty for the "before" snapshot)
 *   var __RUN__ = "dept-mlt-...";                  (optional; audit rows by run id)
 *   var __BASELINE__ = "<iso>";                    (rows created at or before this instant are the "existing rows": their content hash must not change)
 * One READ ONLY transaction. Prints JSON; never a secret, never a user record.
 */
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const IDS = typeof __IDS__ !== 'undefined' ? __IDS__ : [];
const RUN = typeof __RUN__ !== 'undefined' ? __RUN__ : null;
const BASELINE = typeof __BASELINE__ !== 'undefined' ? __BASELINE__ : null;
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
(async () => { const p = new PrismaClient();
  const r = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 120000');
    const out = { at: new Date().toISOString(), baseline: BASELINE };
    out.db = (await tx.$queryRawUnsafe('select current_database() d'))[0].d;
    out.status = Object.fromEntries((await tx.$queryRawUnsafe(`select status::text s, count(*)::int n from "Journal" group by 1`)).map(x => [x.s, x.n]));
    out.total = (await tx.$queryRawUnsafe(`select count(*)::int n from "Journal"`))[0].n;
    out.publicStatusRule = (await tx.$queryRawUnsafe(`select count(*)::int n from "Journal" where status::text in ('Accepted','MetadataOnly')`))[0].n;
    const dep = await tx.$queryRawUnsafe(`select count(*)::int total, count(*) filter (where status::text in ('Accepted','MetadataOnly'))::int pub, count(*) filter (where status::text='Accepted')::int accepted from "Journal" where domain = 'Medical Laboratory Technology'`);
    out.mlt = dep[0];
    const rows = await tx.$queryRawUnsafe(`select id, title, issn, eissn, status::text status, domain, "publisherName" pub, "rightsBasis" basis, "openAccess" oa, licence, "licenceIsNC" nc, homepage, country, subjects, "rightsVerifiedAt" rva, "updatedAt" u, "createdAt" c, "articleCount" ac from "Journal" order by id`);
    const ids = new Set(IDS);
    const h = crypto.createHash('sha256'); let n = 0;
    for (const x of rows) if (!ids.has(x.id) && (!BASELINE || x.c <= new Date(BASELINE))) { h.update(JSON.stringify([x.id, x.title, x.issn, x.eissn, x.status, x.domain, x.pub, x.basis, x.oa, x.licence, x.nc, x.homepage, x.country, x.subjects, x.rva, x.u, x.ac])); n++; }
    out.existingRowsHash = { rows: n, sha256: h.digest('hex'), includesUpdatedAt: true };
    out.newerRowsByOthers = rows.filter(x => !ids.has(x.id) && BASELINE && x.c > new Date(BASELINE)).map(x => ({ id: x.id, domain: x.domain, status: x.status, createdAt: x.c }));
    if (IDS.length) {
      const mine = rows.filter(x => ids.has(x.id)); out.inserted = { requested: IDS.length, found: mine.length };
      const bad = [];
      for (const x of mine) {
        const pr = [];
        if (x.status !== 'MetadataOnly') pr.push('status ' + x.status);
        if (x.oa !== false) pr.push('openAccess not false'); if (x.licence != null) pr.push('licence set'); if (x.nc != null) pr.push('licenceIsNC set'); if (x.rva != null) pr.push('rightsVerifiedAt set');
        if (!/listing — OA unverified$/.test(x.basis || '')) pr.push('rightsBasis ' + x.basis);
        if (x.domain !== 'Medical Laboratory Technology') pr.push('department ' + x.domain);
        if (!x.pub) pr.push('no publisher');
        if (pr.length) bad.push({ id: x.id, title: x.title, problems: pr });
      }
      out.inserted.fieldProblems = bad;
      out.inserted.accepted = mine.filter(x => x.status === 'Accepted').length;
      const byIssn = new Map(); for (const x of rows) for (const k of [x.issn, x.eissn]) if (k) (byIssn.get(String(k).toUpperCase()) || byIssn.set(String(k).toUpperCase(), new Set()).get(String(k).toUpperCase())).add(x.id);
      out.inserted.identifierCollisions = mine.flatMap(x => [x.issn, x.eissn].filter(Boolean).map(k => String(k).toUpperCase()).filter(k => byIssn.get(k).size > 1).map(k => ({ id: x.id, issn: k, rows: [...byIssn.get(k)] })));
      const byTitle = new Map(); for (const x of rows) { const t = norm(x.title); (byTitle.get(t) || byTitle.set(t, []).get(t)).push(x.id); }
      out.inserted.sameTitleRows = mine.filter(x => byTitle.get(norm(x.title)).length > 1).map(x => ({ id: x.id, title: x.title }));
      out.inserted.withArticles = (await tx.$queryRawUnsafe(`select count(*)::int n from "Article" where "journalId" = any($1::text[])`, IDS))[0].n;
      const seed = crypto.createHash('sha256').update(String(RUN || 'x') + IDS.length).digest();
      const order = [...mine].sort((a, b) => crypto.createHash('sha256').update(a.id).update(seed).digest('hex').localeCompare(crypto.createHash('sha256').update(b.id).update(seed).digest('hex')));
      out.inserted.spotCheck20 = order.slice(0, 20).map(x => ({ id: x.id, title: x.title, issn: x.issn, publisher: x.pub, department: x.domain }));
      if (RUN) {
        const a = await tx.$queryRawUnsafe(`select id, meta->>'batch' batch, jsonb_array_length(meta->'inserted') n from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' = $1 order by at`, RUN);
        out.audit = { rows: a.length, insertedSum: a.reduce((s, x) => s + x.n, 0), batches: a };
      }
    }
    return out; });
  process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
