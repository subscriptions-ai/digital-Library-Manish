/**
 * READ-ONLY audit of three data-quality problems seen in the Content Library, written as review manifests. It changes nothing: every query is a SELECT
 * inside a READ ONLY transaction, and the output is files. Applying any correction is a separate, reviewed step this script does not contain.
 *
 *   npx tsx scripts/audit-library-data-quality.ts [outDir]       (database: DATABASE_URL, i.e. .env — pass the QA copy or a read-only export)
 *
 * 1. "Books" that look like journal articles. A title is never proof. The evidence is what the source record carries:
 *      legacy Content (contentType = 'Books'): the file's address (an article page of a journal platform), a description that opens as an abstract,
 *        and the absence of anything a book has (an ISBN, a book-publisher address).
 *      structured Book: a DOI or source page that names an article, and a page count of an article.
 * 2. Subject Area values that are not subjects (DOIs, addresses, citations, identifiers): where they live and how many records carry them.
 * 3. Titles that arrive as markup or entities.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { whyNotASubject } from '../src/lib/subjectFacets.js';
import { abstractToPlainText } from '../src/lib/abstractPreview.js';

const out = process.argv[2] || 'docs/library-data-quality-2026-10-29';
mkdirSync(out, { recursive: true });
const db = new PrismaClient();
const ro = async <T>(f: (tx: any) => Promise<T>): Promise<T> => db.$transaction(async (tx: any) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); return f(tx); }, { timeout: 120_000 });
const csv = (rows: Record<string, any>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n';
};

// ── 1a. Legacy "Books" ──────────────────────────────────────────────────────
const ARTICLE_URL = /(\/article[_s/-]?\d|\/articles?\/|\/doi\/(abs|full|pdf)?|\/index\.php\/[^/]+\/article|\/view\/\d+\/\d+|ojs|journals?\.|e3s-conferences|\/jour[n/])/i;
const BOOK_URL = /(\/books?\/|oapen|doabooks|\/bitstream\/|\/handle\/|library\.oapen|\bisbn\b|978[-\d]{10})/i;
const ABSTRACT_OPENING = /^\s*(abstract|summary|background[:\s]|introduction|1\.\s*introduction|the (aim|purpose|objective|present study)|this (study|paper|article|research|work)|objective[:\s])/i;
const ISBN = /\b97[89][-\s]?\d[-\s\d]{8,14}\b|\bISBN(-1[03])?[:\s]/i;

const legacy = await ro(tx => tx.content.findMany({
  where: { contentType: 'Books' }, select: { id: true, title: true, authors: true, domain: true, status: true, fileUrl: true, description: true, tags: true, subjectArea: true, validationStatus: true },
}));
const legacyRows = legacy.map((c: any) => {
  const url = String(c.fileUrl || '');
  let host = ''; try { host = new URL(url).host; } catch { }
  const text = `${c.description || ''} ${JSON.stringify(c.tags || '')} ${url}`;
  const evidence: string[] = [];
  if (ARTICLE_URL.test(url)) evidence.push('file address is an article page of a journal platform');
  if (ABSTRACT_OPENING.test(String(c.description || ''))) evidence.push('description opens as an abstract');
  const bookSigns: string[] = [];
  if (ISBN.test(text)) bookSigns.push('an ISBN is present');
  if (BOOK_URL.test(url)) bookSigns.push('file address is a book/repository address');
  const confidence = bookSigns.length ? 'kept (book evidence present)'
    : evidence.length === 2 ? 'high' : evidence.length === 1 ? 'medium' : 'none';
  return { id: c.id, title: abstractToPlainText(c.title), domain: c.domain, status: c.status, host, evidence: evidence.join('; '), bookEvidence: bookSigns.join('; '), confidence, fileUrl: url };
});
const legacySuspect = legacyRows.filter((r: any) => r.confidence === 'high' || r.confidence === 'medium');

// ── 1b. Structured Book ─────────────────────────────────────────────────────
const structured = await ro(tx => tx.book.findMany({
  where: { status: { in: ['Published', 'Draft'] } }, select: { id: true, title: true, domain: true, status: true, source: true, doi: true, isbn: true, pages: true, originalUrl: true, chapterCount: true },
}));
const structuredRows = structured.flatMap((b: any) => {
  const ev: string[] = [];
  const u = `${b.originalUrl || ''} ${b.doi || ''}`;
  if (/\/articles?\/|\/article_|journal|\/jour[n/]|\.\d{4}\.\d{2,}\b/i.test(u) && !/books?\b|978|979/i.test(u)) ev.push('DOI or source page names an article');
  const pg = String(b.pages || '').trim();
  const pm = /^(\d+)\s*[-–]\s*(\d+)$/.exec(pg);
  if (/^e\d+/i.test(pg) || (pm && Number(pm[2]) - Number(pm[1]) < 40 && Number(pm[2]) - Number(pm[1]) >= 0)) ev.push('page range is an article\'s');
  if (!b.isbn && !/books?|978|979|isbn/i.test(u) && ev.length) ev.push('no ISBN and nothing in the address that says book');
  return ev.length >= 2 ? [{ id: b.id, title: abstractToPlainText(b.title), domain: b.domain, status: b.status, source: b.source, doi: b.doi, pages: b.pages, originalUrl: b.originalUrl, evidence: ev.join('; ') }] : [];
});

// ── 2. Subject values ───────────────────────────────────────────────────────
const subjectTables: [string, string, string][] = [['Content', 'subjectArea', 'legacy Content (archived shelf)'], ['Article', 'subject', 'Article'], ['Book', 'subject', 'Book'], ['Journal', 'subject', 'Journal']];
const subjectRows: Record<string, any>[] = [];
const subjectSummary: { table: string; distinct: number; held: number; recordsAffected: number }[] = [];
for (const [table, col, label] of subjectTables) {
  const rows: any[] = await ro(tx => tx.$queryRawUnsafe(`select "${col}" v, count(*)::int n from "${table}" where "${col}" is not null group by 1`));
  let held = 0, recs = 0;
  for (const r of rows) {
    const why = whyNotASubject(r.v, null);
    // The archived shelf's facet applies the full rule (a subject there is a short category). The other tables legitimately hold classification
    // paths ("Medicine: Internal medicine: Neoplasms…"), so only what is plainly not a subject at all is reported for them.
    const plain = why && why !== 'empty' && (table === 'Content' || !why.startsWith('not a category'));
    if (plain) { held++; recs += r.n; subjectRows.push({ table: label, column: col, value: String(r.v).slice(0, 200), records: r.n, reason: why }); }
  }
  if (table === 'Article') {
    // An ingestion-mapping defect: the journal's own name written into the subject column.
    const copied: any[] = await ro(tx => tx.$queryRawUnsafe(`select subject v, count(*)::int n from "Article" where subject is not null and "journalName" is not null and lower(btrim(subject)) = lower(btrim("journalName")) group by 1`));
    for (const r of copied) { held++; recs += r.n; subjectRows.push({ table: label, column: col, value: String(r.v).slice(0, 200), records: r.n, reason: 'journal title copied into the subject column (ingestion mapping)' }); }
  }
  subjectSummary.push({ table: label, distinct: rows.length, held, recordsAffected: recs });
}
subjectRows.sort((a, b) => b.records - a.records);

// ── 3. Titles that arrive as markup ─────────────────────────────────────────
const markup: Record<string, number> = {};
for (const t of ['Article', 'Book', 'Content']) {
  const [r] = await ro(tx => tx.$queryRawUnsafe(`select count(*)::int n from "${t}" where title ~ '&(lt|gt|amp|quot|#[0-9]+|#x[0-9a-f]+);|</?[a-zA-Z][^>]*>'`));
  markup[t] = r.n;
}

// ── Outputs ─────────────────────────────────────────────────────────────────
const byDomain = (rows: any[]) => Object.entries(rows.reduce((m: any, r: any) => (m[r.domain || '(none)'] = (m[r.domain || '(none)'] || 0) + 1, m), {})).sort((a: any, b: any) => b[1] - a[1]);
writeFileSync(`${out}/legacy-books-suspect.csv`, csv(legacySuspect));
writeFileSync(`${out}/structured-books-suspect.csv`, csv(structuredRows));
writeFileSync(`${out}/subject-values-held-back.csv`, csv(subjectRows.slice(0, 5000)));
const manifest = {
  generatedAt: new Date().toISOString(), mode: 'PROPOSED ONLY — nothing has been changed; applying this is a separate, reviewed step',
  database: (await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d,
  proposals: [
    ...legacySuspect.map((r: any) => ({ table: 'Content', id: r.id, field: 'contentType', from: 'Books', proposed: 'Periodicals (journal article)', confidence: r.confidence, evidence: r.evidence, action: r.confidence === 'high' ? 'propose-reclassify' : 'needs-human-review' })),
    ...structuredRows.map((r: any) => ({ table: 'Book', id: r.id, field: 'record kind', from: 'Book', proposed: 'Article (journal article)', confidence: 'medium', evidence: r.evidence, action: 'needs-human-review' })),
  ],
};
writeFileSync(`${out}/proposed-corrections.json`, JSON.stringify(manifest, null, 1));
const summary = {
  legacyBooksTotal: legacyRows.length, legacySuspectHigh: legacyRows.filter((r: any) => r.confidence === 'high').length, legacySuspectMedium: legacyRows.filter((r: any) => r.confidence === 'medium').length,
  legacyKeptWithBookEvidence: legacyRows.filter((r: any) => r.confidence.startsWith('kept')).length, legacyNoEvidence: legacyRows.filter((r: any) => r.confidence === 'none').length,
  legacySuspectByDomain: byDomain(legacySuspect), structuredBooksChecked: structured.length, structuredSuspect: structuredRows.length, subjectSummary, titlesWithMarkup: markup,
  topHostsOfSuspect: Object.entries(legacySuspect.reduce((m: any, r: any) => (m[r.host] = (m[r.host] || 0) + 1, m), {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15),
};
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await db.$disconnect();
