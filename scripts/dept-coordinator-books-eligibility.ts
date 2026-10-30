/** READ-ONLY: which Draft books of the four departments may be published under the platform's established rules.
 *  Route A (declared licence): src/lib/ingestion/publicationEligibility.ts bookPublicationEligibility, unchanged.
 *  Route B (metadata-only listing): the harvest's own policy — a SELF_PUBLISHING feed (not review-first: NLM Catalog, DOAB, OAPEN, NCBI, Open Textbook Library …), status Draft, ingested, no file,
 *    no licence claimed, year >= the saved book year, and STRONG evidence = a controlled NLM class AND title/subject wording agreeing (the stored department evidence says so).
 *    Review-first sources (Open Library, Crossref Books, Pressbooks) and licence-less OpenAlex records are never published by this route.
 *  npx tsx scripts/dept-coordinator-books-eligibility.ts <books.ndjson> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { bookPublicationEligibility, PUBLISH_REASON_LABEL } from '../src/lib/ingestion/publicationEligibility.js';
import { SELF_PUBLISHING_SOURCES } from '../src/lib/ingestion/localWork.js';
const MIN_YEAR = 2001;
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const out: any = { selfPublishing: SELF_PUBLISHING_SOURCES, minYear: MIN_YEAR, eligible: [] as any[], held: [] as any[] };
const kindsOf = (r: any) => { const d = r.dept || {}; const c = d.checks || d.kinds || []; return Array.isArray(c) ? c.map(String) : []; };
for (const r of rows) {
  if (r.status !== 'Draft') continue;
  const base = { id: r.id, domain: r.domain, title: r.title, source: r.source, run: r.run };
  if (r.licence) {
    const b = { ...r, ownershipSource: r.own, rejectionNote: r.rej, licenceIsNC: r.nc, rightsBasis: r.basis, rightsStatus: r.rs, accessStatus: r.acc, originalUrl: r.url, pdfUrl: r.pdf, hasLicenceFill: false };
    const el = await bookPublicationEligibility(b as any, r.domain, MIN_YEAR, { checkDuplicates: false });
    if (el.ok) out.eligible.push({ ...base, route: 'A: declared licence', licence: r.licence, access: r.acc }); else out.held.push({ ...base, reason: PUBLISH_REASON_LABEL[el.reason!], detail: el.detail });
    continue;
  }
  const reasons: string[] = [];
  if (!SELF_PUBLISHING_SOURCES.includes(r.source)) reasons.push(`source ${r.source} is review-first or not a harvest feed`);
  if (r.own !== 'Ingested') reasons.push('not ingested'); if (r.rej) reasons.push('rejected'); if (r.pdf) reasons.push('carries a file');
  if (r.rs !== 'MetadataOnly') reasons.push(`rights ${r.rs}`); if (r.acc && r.acc !== 'MetadataOnly') reasons.push(`access ${r.acc}`);
  if (!(r.year >= MIN_YEAR)) reasons.push(`year ${r.year} before policy`);
  const k = kindsOf(r); const reasonsText = JSON.stringify(r.dept?.reasons || []);
  const controlled = k.includes('CLASS') || /code: NLM|narrow code/.test(reasonsText);
  const wording = k.includes('TITLE') || k.includes('KEYWORD') || /title: narrow|subject:/.test(reasonsText);
  if (!(controlled && wording)) reasons.push('not strong: needs a controlled NLM class AND title/subject wording');
  if (!r.doi && !r.isbn && !r.sid) reasons.push('no stable identity');
  if (reasons.length) out.held.push({ ...base, reason: reasons[0], detail: reasons.join(' | ') }); else out.eligible.push({ ...base, route: 'B: metadata-only listing (self-publishing feed, strong)', licence: null, access: r.acc || 'MetadataOnly' });
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
const tab: Record<string, Record<string, number>> = {};
for (const e of out.eligible) { tab[e.domain] ??= {}; tab[e.domain][e.route] = (tab[e.domain][e.route] || 0) + 1; }
console.log(JSON.stringify({ eligible: out.eligible.length, held: out.held.length, byDepartment: tab }, null, 1));
const hr: Record<string, number> = {}; for (const h of out.held) { const k = `${h.domain.slice(0, 10)} | ${h.reason}`; hr[k] = (hr[k] || 0) + 1; } console.log(JSON.stringify(hr, null, 1));
process.exit(0);
