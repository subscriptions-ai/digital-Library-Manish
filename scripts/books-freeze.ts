/**
 * Validate a staged book harvest and freeze the eligible set as an import manifest.
 *
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/books-freeze.ts --ids prod-ids.ndjson                 # REPORT: counts only, writes nothing
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/books-freeze.ts --ids prod-ids.ndjson --freeze <dir>   # also writes the manifest, evidence, held list, checksum
 *
 * Input: the scratch database (scripts/books-stage-harvest.ts) and an export of every production book identity, all statuses, plus every legacy
 * Books row (the NDJSON from the read-only export). Nothing here touches production.
 *
 * A harvested book is ELIGIBLE only if every check passes; otherwise it is HELD with each reason it failed. Nothing is forced into a department
 * and no number is a target.
 *   1  the application's own publication gate (publicationEligibility.ts): standing, metadata, year policy, a recognised licence with a recorded
 *      source, access derived from the licence (never viewable here, no file address), source scope. Confidence in a department is not an input.
 *   2  department evidence: the classifier's band is "strong" (a controlled code AND title/subject wording agree). Medium/low stays held.
 *   3  rights shape: no file address, not viewable here, rights not granted beyond "metadata only". A source listing or an open-access badge grants nothing.
 *   4  identity: a valid ISBN-13 (check digit) and/or DOI and/or the source's own handle; ISBNs normalised so ISBN-10 and -13 are one.
 *   4b English-language only (the classifier reads English wording and the product is English-only); others wait for a person.
 *   5  not a chapter, part, appendix or section of a book (those are not whole books).
 *   6  not already held, judged again here and independently of the harvest, against EVERY production status and both collections:
 *      ISBN/eISBN equivalents, DOI, source id, fingerprint, and title + first author (+ year, edition) so a print/electronic manifestation or a
 *      source mirror is not counted as a new title; a different edition (different year or edition statement) is kept.
 *   7  not a duplicate of another book in this same set (DOAB and OAPEN mirror each other).
 */
import { readFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';
import { bookPublicationEligibility } from '../src/lib/ingestion/publicationEligibility.js';
import { normaliseIsbn, titleKey, firstAuthorKey } from '../src/lib/ingestion/books/identifiers.js';
import { normaliseDoi } from '../src/lib/ingestion/dedup.js';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const idsFile = arg('--ids');
const freezeDir = arg('--freeze');
if (!idsFile) { console.error('usage: books-freeze.ts --ids prod-ids.ndjson [--freeze <dir>] [--run <runId>]'); process.exit(2); }
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_books_stage') { console.error('refusing to run against anything but stm_books_stage'); process.exit(2); }

// ── Production identities ────────────────────────────────────────────────────────────────────────────────────────────────
const prod = { isbn: new Set<string>(), doi: new Set<string>(), pid: new Set<string>(), fp: new Set<string>(), ids: new Set<string>(),
  byTitle: new Map<string, { kind: 'book' | 'legacy'; status: string; author: string; year: number | null; edition: string; publisher: string }[]>(),
  publishedByDept: new Map<string, number>(), minYear: 2001, rows: 0, legacy: 0 };
const normEdition = (e?: string | null) => String(e || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normPublisher = (e?: string | null) => String(e || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
{
  const rl = createInterface({ input: createReadStream(idsFile!) });
  for await (const line of rl) {
    const o = JSON.parse(line);
    if (o.t === 'state') { prod.minYear = o.v?.bookMinYear ?? 2001; continue; }
    if (o.t === 'b') {
      prod.rows++; prod.ids.add(o.id);
      const i = normaliseIsbn(o.isbn); if (i) { prod.isbn.add(i.isbn13); if (i.isbn10) prod.isbn.add(i.isbn10); }
      if (o.doi) prod.doi.add(normaliseDoi(o.doi) || String(o.doi).toLowerCase());
      if (o.source && o.sourceRecordId) prod.pid.add(`${o.source}|${o.sourceRecordId}`);
      if (o.fingerprint) prod.fp.add(o.fingerprint);
      if (o.status === 'Published' && o.domain) prod.publishedByDept.set(o.domain, (prod.publishedByDept.get(o.domain) || 0) + 1);
      const tk = titleKey(o.title); if (tk) { const l = prod.byTitle.get(tk) || []; l.push({ kind: 'book', status: o.status, author: firstAuthorKey(o.authors), year: o.year ?? null, edition: normEdition(o.edition), publisher: normPublisher(o.publisherName) }); prod.byTitle.set(tk, l); }
    } else if (o.t === 'c') {
      prod.legacy++;
      const tk = titleKey(o.title); if (tk) { const l = prod.byTitle.get(tk) || []; l.push({ kind: 'legacy', status: o.status, author: firstAuthorKey(o.authors), year: null, edition: '', publisher: '' }); prod.byTitle.set(tk, l); }
    }
  }
}

// ── What the harvest produced (rows that carry harvest metadata; the primed production copies do not) ────────────────────────
const harvested: any[] = await db.$queryRawUnsafe(`select * from "Book" where metadata ? 'harvest' and source in ('DOAB','OAPEN') order by source, "createdAt"`);
const CHAPTER = /^\s*(chapter|ch\.|section|appendix)\s*[\dIVXLivxl]+\b|^\s*part\s+[\dIVXLivxl]+\b[\s:.\-–—]/i;

type Why = string;
const verdicts: { row: any; reasons: Why[]; checks: string[] }[] = [];
for (const r of harvested) {
  const reasons: Why[] = []; const checks: string[] = [];
  const meta = r.metadata?.harvest || {};
  // 1. the application's own publication gate, applied as if the book were an undecided Draft
  const gate = await bookPublicationEligibility({
    id: r.id, title: r.title, status: 'Draft', ownershipSource: r.ownershipSource, source: r.source, year: r.year, licence: r.licence, licenceIsNC: r.licenceIsNC,
    rightsBasis: r.rightsBasis, rightsStatus: r.rightsStatus, accessStatus: r.accessStatus, rejectionNote: null, originalUrl: r.originalUrl, pdfUrl: r.pdfUrl,
    doi: r.doi, isbn: r.isbn, fingerprint: r.fingerprint, domain: r.domain, hasLicenceFill: !!r.metadata?.licenceFill,
  }, r.domain, prod.minYear, { checkDuplicates: false });
  if (!gate.ok) reasons.push(`gate:${gate.reason}${gate.detail ? ` (${String(gate.detail).slice(0, 60)})` : ''}`); else checks.push(...(gate.checks || []).map(c => `gate:${c}`));
  // 2. department evidence
  if (r.status !== 'Published') reasons.push('not_published_by_harvest');
  if (!r.domain) reasons.push('no_department'); else if (meta.department?.band !== 'strong') reasons.push(`department_not_strong:${meta.department?.band || 'none'}`); else checks.push('department:strong');
  // 3. rights shape
  if (r.pdfUrl || r.accessStatus === 'ViewableHere') reasons.push('rights:file_or_viewable');
  else if (r.rightsStatus !== 'MetadataOnly') reasons.push(`rights:status_${r.rightsStatus}`); else checks.push('rights:metadata_only');
  // 4. identity
  const isbn = normaliseIsbn(r.isbn);
  if (r.isbn && !isbn) reasons.push('identity:invalid_isbn'); else if (isbn) checks.push('identity:isbn_valid');
  if (!isbn && !r.doi && !r.sourceRecordId) reasons.push('identity:none');
  else if (!isbn && !r.doi) checks.push('identity:source_handle');
  // 4b. language: the classifier reads English wording, and the product is English-only, so a book not known to be English waits for a person
  //     (production already holds DOAB books in German, French, Italian and Spanish; this import does not add to them).
  if (!/^(eng|en|english)$/i.test(String(r.language || '').trim())) reasons.push(`language_not_english:${r.language || 'none'}`); else checks.push('language:english');
  // 5. whole books only
  if (CHAPTER.test(r.title || '')) reasons.push('not_a_whole_book:chapter_or_part'); else checks.push('whole_book');
  // 6. already held in production (independent of the harvest)
  const heldBy: string[] = [];
  if (isbn && (prod.isbn.has(isbn.isbn13) || (isbn.isbn10 && prod.isbn.has(isbn.isbn10)))) heldBy.push('isbn');
  if (r.doi && prod.doi.has(normaliseDoi(r.doi) || String(r.doi).toLowerCase())) heldBy.push('doi');
  if (r.source && r.sourceRecordId && prod.pid.has(`${r.source}|${r.sourceRecordId}`)) heldBy.push('source_id');
  if (r.fingerprint && prod.fp.has(r.fingerprint)) heldBy.push('fingerprint');
  const tk = titleKey(r.title), ak = firstAuthorKey(r.authors), ed = normEdition(r.edition);
  for (const e of tk ? prod.byTitle.get(tk) || [] : []) {
    const sameAuthor = !ak || !e.author || ak === e.author;
    if (!sameAuthor) continue;
    if (e.kind === 'legacy') { heldBy.push('title+author:legacy_collection'); break; }
    // A different year or a different edition statement is a different edition and is kept; the same year and edition is the same book,
    // however many ISBNs (print, electronic) or sources (DOAB, OAPEN) carry it.
    const sameYear = e.year == null || r.year == null || e.year === r.year;
    const sameEdition = !ed || !e.edition || ed === e.edition;
    if (sameYear && sameEdition) { heldBy.push(`title+author:${e.status.toLowerCase()}_manifestation_or_mirror`); break; }
  }
  if (heldBy.length) reasons.push(`already_held:${heldBy.join('+')}`); else checks.push('not_held');
  verdicts.push({ row: r, reasons, checks });
}

// 7. duplicates inside the set: keep the best record of each work, hold the rest
const passing = verdicts.filter(v => !v.reasons.length);
const groups = new Map<string, typeof passing>();
const bump = (k: string, v: (typeof passing)[number]) => { const l = groups.get(k) || []; l.push(v); groups.set(k, l); };
for (const v of passing) {
  const i = normaliseIsbn(v.row.isbn); if (i) bump(`isbn:${i.isbn13}`, v);
  if (v.row.doi) bump(`doi:${normaliseDoi(v.row.doi) || String(v.row.doi).toLowerCase()}`, v);
  bump(`t:${titleKey(v.row.title)}|${firstAuthorKey(v.row.authors)}|${v.row.year ?? ''}|${normEdition(v.row.edition)}`, v);
}
const rank = (v: (typeof passing)[number]) => (v.row.source === 'DOAB' ? 0 : 1) * 10 + (v.row.isbn ? 0 : 5) + (v.row.doi ? 0 : 3);
const loser = new Map<string, string>();
for (const [k, list] of groups) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => rank(a) - rank(b) || String(a.row.id).localeCompare(String(b.row.id)));
  for (const v of sorted.slice(1)) if (!loser.has(v.row.id)) loser.set(v.row.id, `${k.split(':')[0]}:${sorted[0].row.source}/${sorted[0].row.sourceRecordId}`);
}
for (const v of verdicts) if (loser.has(v.row.id)) v.reasons.push(`duplicate_in_set_of:${loser.get(v.row.id)}`);
// Same-source chains: a loser's winner must itself have survived; one pass is enough because winners are never losers of a better one.

const eligible = verdicts.filter(v => !v.reasons.length);
const held = verdicts.filter(v => v.reasons.length);

// ── Report ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const count = <T,>(xs: T[], f: (x: T) => string) => { const m: Record<string, number> = {}; for (const x of xs) { const k = f(x); m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const firstReason = (v: { reasons: string[] }) => v.reasons[0].replace(/\(.*$/, '').trim();
const report = {
  productionBooks: prod.rows, productionLegacyBooks: prod.legacy, bookMinYear: prod.minYear,
  discovered: harvested.length, discoveredBySource: count(harvested, r => r.source),
  discoveredAsPublishedByHarvest: harvested.filter(r => r.status === 'Published').length,
  eligible: eligible.length, eligibleBySource: count(eligible, v => v.row.source), eligibleByDepartment: count(eligible, v => v.row.domain),
  eligibleLanguages: count(eligible, v => v.row.language || '(none)'),
  eligibleLicences: count(eligible, v => v.row.licence || '(none)'),
  held: held.length, heldByFirstReason: count(held, firstReason),
  heldByAnyReason: (() => { const m: Record<string, number> = {}; for (const v of held) for (const r of new Set(v.reasons.map(x => x.replace(/[:(].*$/, '')))) m[r] = (m[r] || 0) + 1; return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); })(),
  coverageBefore: Object.fromEntries([...prod.publishedByDept].sort((a, b) => a[1] - b[1])),
};
console.log(JSON.stringify(report, null, 2));

if (freezeDir) {
  mkdirSync(freezeDir, { recursive: true });
  const runId = arg('--run') || `book-source-${new Date().toISOString().slice(0, 10)}-${createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 8)}`;
  const pick = (r: any) => {
    const { id, createdAt, updatedAt, publisherId, ...rest } = r;
    return rest;
  };
  const rows = eligible.map(v => ({
    source: v.row.source, sourceRecordId: v.row.sourceRecordId, doi: v.row.doi, isbn: v.row.isbn, fingerprint: v.row.fingerprint,
    row: JSON.parse(JSON.stringify(pick(v.row))),
  }));
  const plan = { runId, createdAt: new Date().toISOString(), bookMinYear: prod.minYear, count: rows.length, rows };
  const planJson = JSON.stringify(plan);
  const sha = createHash('sha256').update(planJson).digest('hex');
  writeFileSync(join(freezeDir, 'manifest-frozen.json.gz'), gzipSync(planJson));
  writeFileSync(join(freezeDir, 'manifest-frozen.sha256'), `${sha}  manifest-frozen.json (uncompressed JSON, ${planJson.length} bytes, ${rows.length} rows)\n`);
  writeFileSync(join(freezeDir, 'evidence.json.gz'), gzipSync(JSON.stringify(eligible.map(v => ({
    source: v.row.source, sourceRecordId: v.row.sourceRecordId, title: v.row.title, department: v.row.domain, checks: v.checks,
    departmentEvidence: v.row.metadata?.harvest?.department, licenceBasis: v.row.rightsBasis, originalUrl: v.row.originalUrl,
  })))));
  writeFileSync(join(freezeDir, 'held.json.gz'), gzipSync(JSON.stringify(held.map(v => ({ source: v.row.source, sourceRecordId: v.row.sourceRecordId, title: v.row.title, year: v.row.year, isbn: v.row.isbn, harvestStatus: v.row.status, suggestedDepartment: v.row.metadata?.harvest?.department?.suggested || v.row.domain, reasons: v.reasons })))));
  writeFileSync(join(freezeDir, 'report.json'), JSON.stringify({ runId, sha256: sha, ...report }, null, 2));
  console.log(`\nFROZEN ${rows.length} books → ${freezeDir}\nrunId ${runId}\nsha256 ${sha}`);
}
await db.$disconnect();
