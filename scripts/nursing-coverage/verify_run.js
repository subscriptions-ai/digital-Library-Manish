// READ-ONLY verification of one insertion run (placeholders __ISSNS__ and __RUN__ are filled by the caller). Run through `docker exec -i -w /app <app> node -`.
// Reports: the rows of the run by ISSN (ids, status, openAccess, licence, rights, department, source label, publisher), duplicate identifiers (global, cross-field, same title), articles attached,
// the content hash of every row that is NOT in the run (existing-record preservation), counts by status and for Nursing, the production audit entries of the run, and the public detail
// endpoint (/api/library/journal/:issn) for every row: status, department, title and that no full-text access is granted by the rights fields.
const { PrismaClient } = require('@prisma/client');
const issns = __ISSNS__, RUN = '__RUN__';
(async () => { const p = new PrismaClient();
 const r = await p.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 90000");
  const rowsQ = await tx.$queryRawUnsafe('select id, issn, eissn, title, status::text st, "openAccess" oa, licence, "licenceIsNC" nc, "rightsVerifiedAt" rv, domain, "rightsBasis" rb, "publisherName" pub, "createdAt" from "Journal" where issn = any($1::text[]) order by "createdAt", title', issns);
  const ids = rowsQ.map(x => x.id);
  const aud = await tx.$queryRawUnsafe("select id, meta from \"IngestionAudit\" where action='JOURNAL_SOURCE_IMPORT' and meta->>'runId'=$1 order by at", RUN);
  const auditIds = aud.flatMap(a => ((a.meta && a.meta.inserted) || []).map(x => x.id));
  const dupI = (await tx.$queryRawUnsafe('select count(*)::int n from (select issn from "Journal" where issn is not null group by issn having count(*)>1) x'))[0].n;
  const cross = (await tx.$queryRawUnsafe('select count(*)::int n from "Journal" a join "Journal" b on a.eissn = b.issn and a.id <> b.id where a.id = any($1::text[]) or b.id = any($1::text[])', ids))[0].n;
  const sameT = (await tx.$queryRawUnsafe('select count(*)::int n from "Journal" j where j.id = any($1::text[]) and exists (select 1 from "Journal" o where o.id <> j.id and lower(btrim(o.title)) = lower(btrim(j.title)))', ids))[0].n;
  const arts = (await tx.$queryRawUnsafe('select count(*)::int n from "Article" where "journalId" = any($1::text[])', ids))[0].n;
  const hash = (await tx.$queryRawUnsafe(`select count(*)::int n, md5(string_agg(id||'|'||coalesce(title,'')||'|'||coalesce(issn,'')||'|'||coalesce(eissn,'')||'|'||status::text||'|'||coalesce(domain,'')||'|'||"openAccess"::text||'|'||coalesce(licence,''), ',' order by id)) h from "Journal" where not (id = any($1::text[]))`, ids))[0];
  const st = await tx.$queryRawUnsafe('select status::text status, count(*)::int n from "Journal" group by 1 order by 1');
  const nur = await tx.$queryRawUnsafe(`select status::text status, count(*)::int n from "Journal" where domain='Nursing' group by 1 order by 1`);
  return { rows: rowsQ, ids, auditEntries: aud.length, auditIdsEqualRunIds: auditIds.length === ids.length && auditIds.every(i => ids.includes(i)), dupIssn: dupI, crossFieldCollisions: cross, sameTitleRows: sameT, articlesAttached: arts, existingExcludingRun: hash, status: st, nursing: nur }; });
 await p.$disconnect();
 const pub = [];
 for (const x of r.rows) { try { const res = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/library/journal/' + x.issn); const j = await res.json().catch(() => ({})); pub.push({ issn: x.issn, ok: res.status === 200 && j.domain === 'Nursing' && j.status === 'MetadataOnly' && j.title === x.title && j.licence == null && j.openAccess === false }); } catch (e) { pub.push({ issn: x.issn, ok: false }); } }
 r.publicEndpoint = { checked: pub.length, ok: pub.filter(q => q.ok).length, bad: pub.filter(q => !q.ok).slice(0, 5) };
 r.fieldSummary = {}; for (const x of r.rows) { const k = [x.st, 'oa=' + x.oa, x.licence == null ? 'noLicence' : 'LICENCE', x.nc == null ? 'ncNull' : 'NC', x.rv == null ? 'notVerified' : 'VERIFIED', x.domain, x.rb, x.pub && String(x.pub).trim() ? 'publisher' : 'NOPUBLISHER'].join(' | '); r.fieldSummary[k] = (r.fieldSummary[k] || 0) + 1; }
 console.log(JSON.stringify(r)); })();
