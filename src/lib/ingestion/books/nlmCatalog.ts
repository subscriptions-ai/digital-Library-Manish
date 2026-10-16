import { fetchSourceJson, SourceParseError } from '../sourceHealth.js';
import { isbn13s } from './identifiers.js';
import { decode } from './oaiXml.js';
import type { NormalisedBook } from './normalise.js';

/**
 * NLM Catalog — the National Library of Medicine's catalogue of books, through NCBI's E-utilities. Bibliographic records, not texts.
 *
 * What a record gives: title, authors, publisher, year, ISBNs, language, MeSH subject headings and the NLM CLASSIFICATION ("WY 100" is
 * nursing, "WU" dentistry, "QV" pharmacology). That classification is a controlled code, so a health book here can be placed with the
 * same confidence as one with a BIC or LCC code — which is why this source can fill the health departments where words alone cannot.
 *
 * What it is not: full text. A catalogue entry says a book exists and where the library shelves it, never that anyone may read it, so every
 * record is Metadata Only (no Read / Open Access button) and nothing is inferred from the fact that NLM holds it. Open access health books
 * come from NCBI Bookshelf, a different source with its own limits; the two share nothing but the host.
 *
 * Polite use: three requests a second without an API key (ten with NCBI_API_KEY), a User-Agent that names us, small pages, and a health row
 * of its own ('NLMCatalog') so a rest here never stops Bookshelf and the reverse.
 */
export const NLM_EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
export const NLM_PROVIDER = 'NLMCatalog';

/** The departments this source is asked for, and the subject words that ask for them. The classifier still decides every book. */
export const NLM_QUERIES: { department: string; term: string }[] = [
  { department: 'Medical Sciences', term: '(medicine[Subject] OR internal medicine[Subject] OR surgery[Subject] OR pathology[Subject])' },
  { department: 'Nursing', term: 'nursing[Subject]' },
  { department: 'Pharmacy', term: '(pharmacy[Subject] OR pharmacology[Subject])' },
  { department: 'Dental', term: 'dentistry[Subject]' },
  { department: 'Physiotherapy', term: '(physical therapy modalities[Subject] OR rehabilitation[Subject])' },
  { department: 'Life Sciences', term: '(biology[Subject] OR genetics[Subject] OR microbiology[Subject])' },
  { department: 'Bio Technology', term: 'biotechnology[Subject]' },
];
export const NLM_TARGET_DEPARTMENTS = NLM_QUERIES.map(q => q.department);
export const PAGE = 50;

const contact = () => process.env.OPENALEX_CONTACT || 'info@celnet.in';
export const nlmHeaders = () => ({ 'User-Agent': `STM Digital Library (mailto:${contact()})` });
const keyParam = () => (process.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}` : '');
/** The pause between E-utilities calls: NCBI allows 3 a second without a key. */
export const nlmPauseMs = () => (process.env.NCBI_API_KEY ? 120 : 400);

/** The token is "<query index>|<offset in that query>". */
export function parseNlmToken(t: string | null): { q: number; start: number } {
  const [q, s] = String(t || '0|0').split('|');
  return { q: Math.max(0, Number(q) || 0), start: Math.max(0, Number(s) || 0) };
}

const tag = (x: string, name: string) => [...x.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map(m => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter(Boolean);
const one = (x: string, name: string) => tag(x, name)[0] ?? null;

/** NLM Catalog XML → records. Tolerant: a record that is not a book, or has no title, is simply not returned. */
export function parseNlmRecords(xml: string): string[] {
  return [...xml.matchAll(/<NLMCatalogRecord\b[\s\S]*?<\/NLMCatalogRecord>/g)].map(m => m[0]);
}

export function normaliseNlmRecord(provider: string, rec: string): NormalisedBook | null {
  const id = one(rec, 'NlmUniqueID');
  const titleBlock = /<TitleMain>([\s\S]*?)<\/TitleMain>/.exec(rec)?.[1] ?? '';
  const title = (one(titleBlock, 'Title') || '').replace(/\s*[./:;,]+\s*$/, '').trim();
  if (!id || !title) return null;
  if (one(rec, 'TypeOfResource') !== 'Book') return null;                 // serials and the rest are not books
  const authorList = /<AuthorList\b[\s\S]*?<\/AuthorList>/.exec(rec)?.[0] ?? '';
  const people = [...authorList.matchAll(/<Author\b[\s\S]*?<\/Author>/g)].map(a => {
    const last = one(a[0], 'LastName'), fore = one(a[0], 'ForeName');
    return last ? [fore, last].filter(Boolean).join(' ') : one(a[0], 'CollectiveName') || '';
  }).filter(Boolean);
  const imprint = /<Imprint\b[\s\S]*?<\/Imprint>/.exec(rec)?.[0] ?? '';
  // MARC punctuation ("F.A. Davis Co.,") loses its trailing comma, semicolon and colon; a full stop after an abbreviation is part of the name.
  const publisher = (one(imprint, 'Entity') || '').replace(/[\s,;:]+$/, '') || null;
  const yearRaw = one(rec, 'PublicationFirstYear') || one(imprint, 'Year') || one(/<DateIssued>[\s\S]*?<\/DateIssued>/.exec(rec)?.[0] ?? '', 'Year');
  const year = yearRaw && /^\d{4}$/.test(yearRaw) && Number(yearRaw) > 1400 && Number(yearRaw) < 2200 ? Number(yearRaw) : null;
  const mesh = tag(/<MeshHeadingList>[\s\S]*?<\/MeshHeadingList>/.exec(rec)?.[0] ?? '', 'DescriptorName');
  const classes = tag(rec, 'Classification');
  // No contributor and no publisher is not enough to identify a book.
  if (!people.length && !publisher) return null;
  const landing = `https://www.ncbi.nlm.nih.gov/nlmcatalog/${id}`;
  return {
    provider, sourceRecordId: id, title,
    authors: people.slice(0, 10).join(', ') || null, editors: null,
    publisherName: publisher, year, doi: null,
    isbns: isbn13s(tag(rec, 'ISBN').map(v => v.replace(/\s*\(.*$/, ''))).slice(0, 8),
    language: one(rec, 'Language'),
    description: null,
    subjects: [...new Set(mesh)].slice(0, 20),
    classifications: [], pages: (one(rec, 'Extent') || '').match(/(\d+)\s*p\b/)?.[1] ?? null,
    lcc: [], edition: one(rec, 'Edition'), country: one(rec, 'Country'), coverUrl: null,
    landingUrl: landing, externalUrl: landing, fileUrl: null,
    // A library catalogue record is not a licence.
    licence: null, licenceBasis: 'none',
    modified: null, deleted: false,
    extra: { nlmClass: classes.slice(0, 4), nlmId: id, lccn: one(rec, 'LCCN') },
  };
}

/** One page of one department's search: the ids (esearch) then their records (efetch). */
export async function fetchNlmPage(qIndex: number, start: number, size = PAGE, pause: (ms: number) => Promise<any> = ms => new Promise(r => setTimeout(r, ms))) {
  const q = NLM_QUERIES[qIndex];
  if (!q) return { ok: true as const, ids: [] as string[], records: [] as string[], total: 0 };
  const term = `${q.term} AND books[Filter] AND eng[Language]`;
  const search = await fetchSourceJson(`${NLM_EUTILS}/esearch.fcgi?db=nlmcatalog&retmode=json&retmax=${size}&retstart=${start}&term=${encodeURIComponent(term)}${keyParam()}`, {
    source: NLM_PROVIDER, timeoutMs: 45_000, attempts: 2, headers: nlmHeaders(),
    parse: (b: any) => { if (!Array.isArray(b?.esearchresult?.idlist)) throw new SourceParseError('invalid_response', 'NLM Catalog sent a response in a shape we do not recognise'); return b; },
  });
  if (!search.ok) return { ok: false as const, error: search };
  const ids: string[] = search.json.esearchresult.idlist.map(String);
  const total = Number(search.json.esearchresult.count) || 0;
  if (!ids.length) return { ok: true as const, ids, records: [] as string[], total };
  await pause(nlmPauseMs());
  const fetched = await fetchSourceJson(`${NLM_EUTILS}/efetch.fcgi?db=nlmcatalog&retmode=xml&id=${ids.join(',')}${keyParam()}`, {
    source: NLM_PROVIDER, timeoutMs: 90_000, attempts: 2, text: true, headers: nlmHeaders(),
    parse: (b: any) => { if (typeof b !== 'string' || !/<NLMCatalogRecordSet|<NLMCatalogRecord\b/.test(b)) throw new SourceParseError('invalid_xml', 'NLM Catalog sent something that is not a record set'); return b; },
  });
  if (!fetched.ok) return { ok: false as const, error: fetched };
  return { ok: true as const, ids, records: parseNlmRecords(String(fetched.json)), total };
}
