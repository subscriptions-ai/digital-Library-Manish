/**
 * OpenStax, judged by the same rules as every other book source (department classifier, licence, access, duplicate check) and written ONLY to the
 * scratch database `stm_books_stage`, as the DOAB/OAPEN harvest is. OpenStax's public CMS API lists its own titles (CC BY or CC BY-NC-SA per book);
 * nothing is downloaded and no full text is ever implied: access comes from judgeBookAccess (a non-commercial licence is a record that links out).
 *
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/books-stage-openstax.ts [--write]
 */
import { ingestionDb as db } from '../src/lib/ingestion/db.js';
import { judgeBooks, bookRow, type OaiProviderConfig } from '../src/lib/ingestion/books/oaiHarvest.js';
import { canonicalLicence } from '../src/lib/ingestion/books/licence.js';
import { normaliseIsbn } from '../src/lib/ingestion/books/identifiers.js';
import type { NormalisedBook } from '../src/lib/ingestion/books/normalise.js';

if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_books_stage') { console.error('refusing to run against anything but stm_books_stage'); process.exit(2); }
const WRITE = process.argv.includes('--write');
const API = 'https://openstax.org/apps/cms/api/v2/pages/?type=books.Book&fields=*&limit=200';
const res = await fetch(API, { headers: { 'User-Agent': 'STM-Digital-Library-metadata-harvest (contact: puneet.mehrotra@nstc.in)' } });
if (!res.ok) throw new Error(`OpenStax API ${res.status}`);
const items: any[] = (await res.json()).items.filter((i: any) => i.book_state === 'live');
const strip = (h: string | null) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;

const cfg: OaiProviderConfig = { provider: 'OpenStax', kind: 'otl', baseUrl: 'https://openstax.org', set: '', metadataPrefix: '', label: 'OpenStax CMS API', handleBase: '', reviewFirst: false };
const books: NormalisedBook[] = items.map(i => {
  const isbns = [...new Set(['print_isbn_13', 'digital_isbn_13', 'print_softcover_isbn_13'].map(k => normaliseIsbn(i[k])?.isbn13).filter(Boolean) as string[])];
  const lic = canonicalLicence(i.license_name) || canonicalLicence(i.license_url) || null;
  return {
    provider: 'OpenStax', sourceRecordId: i.book_uuid || String(i.id), title: i.title, authors: (i.authors || []).map((a: any) => a.name || a.value?.name).filter(Boolean).join('; ') || null, editors: null,
    publisherName: 'OpenStax', year: i.publish_date ? Number(String(i.publish_date).slice(0, 4)) : null, doi: null, isbns,
    language: /^(es|spanish)$/i.test(i.meta?.locale || '') || /volumen|estadística|cálculo|química|física|precálculo/i.test(i.title) ? 'spa' : 'eng',
    description: strip(i.description), subjects: (i.book_subjects || []).map((s: any) => s.subject_name).filter(Boolean), classifications: [], pages: null, lcc: [], edition: (/\b(\d)e\b|(\d)ed\b/i.exec(i.title) || [])[0] || null,
    country: 'United States', coverUrl: i.cover_url || null, landingUrl: i.meta?.html_url || null, externalUrl: i.webview_link || i.meta?.html_url || null, fileUrl: null,
    licence: lic, licenceBasis: lic ? 'title' : 'none', modified: i.updated || i.created || null, deleted: false, extra: { openstax: { slug: i.meta?.slug, license_name: i.license_name } },
  } as NormalisedBook;
});
const judged = await judgeBooks(cfg, books, db, null);
const summary = judged.map(j => ({ title: j.book.title, lang: j.book.language, licence: j.book.licence, band: j.verdict.band, dept: j.verdict.department, suggested: j.verdict.suggested, held: j.match ? j.match.via : null, access: j.access.accessStatus }));
const count = (f: (x: any) => string) => summary.reduce((m: any, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
console.log(JSON.stringify({ live: items.length, alreadyHeldByIdentity: summary.filter(s => s.held).length, byBand: count(s => s.band), byLicence: count(s => s.licence || '(none)'), netNew: summary.filter(s => !s.held).map(s => `${s.title} [${s.lang}, ${s.licence}, ${s.band}${s.dept ? ':' + s.dept : s.suggested ? '→' + s.suggested : ''}]`) }, null, 1));
if (WRITE) {
  let n = 0;
  for (const j of judged) {
    if (j.match) continue;
    const strong = j.verdict.band === 'strong';
    const row: any = bookRow(j, cfg, strong ? 'Published' : 'Draft');
    await db.book.create({ data: row }); n++;
  }
  console.log('written to the scratch database:', n);
}
await db.$disconnect();
