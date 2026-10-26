import { fetchSourceJson, type SourceResult } from './sourceHealth.js';
import { normaliseIssn, openAlexJournalUrl, openAlexWork, OPENALEX_HEADERS, searchTermsFor } from '../ingestionWorker.js';
import { normaliseDoi } from './dedup.js';

/**
 * Where articles come from, and how each source's answer becomes a candidate.
 *
 * These are the fetchers the one-off wizard has always used, moved out of the server file so that an
 * administrator's Quick Import and the wizard share them: one place that knows what Crossref, OpenAlex,
 * Europe PMC and arXiv look like, and one set of rules about what a record without a file is.
 *
 * Every request goes through `fetchSourceJson`, so it is retried politely, honours Retry-After, and — the
 * part the wizard's own fetches never had — respects and feeds the same circuit breaker the continuous
 * engine uses. A source that is resting is not asked.
 *
 * A fetch never writes. It returns what the source said, reduced to the shape the shared rules judge.
 */

const CONTACT = process.env.OPENALEX_CONTACT || 'info@celnet.in';
const UA = { 'User-Agent': `STM Digital Library (mailto:${CONTACT})` };

export type ArticleSourceId = 'openalex' | 'crossref' | 'europepmc' | 'arxiv' | 'doaj';

/** What a source gave, before the department and the rules are applied. */
export type RawCandidate = {
  source: string;
  sourceRecordId: string | null;
  title: string;
  authors: string | null;
  doi: string | null;
  pdfUrl: string | null;
  journalName: string | null;
  issn: string | null;
  publisherName: string | null;
  volume: any;
  issue: any;
  year: number | null;
  subject: string | null;
  openAccess: boolean;
  licence: string | null;
  extra?: Record<string, any> | null;
};

/** `fetched` is how many records the source handed over (what "checked" means); `skipped` those dropped while reading them. */
export type FetchResult = { items: RawCandidate[]; fetched: number; skipped: number };

/** A source that did not give a usable page. Nothing was read from it, so nothing may be written because of it. */
export class SourceError extends Error {
  constructor(public source: string, message: string, public kind: 'unavailable' | 'rate_limited' | 'invalid', public status: number | null = null) {
    super(message);
  }
}

function fail(source: string, r: SourceResult): never {
  if (r.paused || r.status === 429) throw new SourceError(source, r.error || `${source} is rate limited`, 'rate_limited', r.status);
  throw new SourceError(source, r.error || `${source} did not answer`, 'unavailable', r.status);
}
const invalid = (source: string, what: string): never => { throw new SourceError(source, `${source} sent a response in a shape we do not recognise (${what})`, 'invalid'); };

let pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export function __useArticlePauseForTests(f: ((ms: number) => Promise<any>) | null) { pause = (f ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))) as any; }

// ── Is a file really a file we can serve? ──────────────────────────────────

/**
 * Hosts whose PDFs open in our own viewer. Anything else (doi.org redirects, Wiley, ACS, RSC, ScienceDirect, MDPI,
 * Hindawi, most repositories) only opens in a real browser, never in the in-app reader.
 */
const TRUSTED_PDF_HOSTS = [
  'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'biomedcentral.com', 'journals.plos.org', 'plos.org', 'frontiersin.org',
  'elifesciences.org', 'peerj.com', 'nature.com', 'escholarship.org', 'f1000research.com', 'wellcomeopenresearch.org',
  'gatesopenresearch.org', 'dovepress.com', 'copernicus.org', 'mdpi-res.com', 'ojs.', 'jstage.jst.go.jp', 'scielo.br', 'scielo.org',
];
export function isTrustedPdfHost(url?: string | null): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return TRUSTED_PDF_HOSTS.some(t => h === t || h.endsWith('.' + t) || h.endsWith(t) || h.includes(t));
  } catch { return false; }
}

const PDF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
async function realFileCheck(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    const nodeFetch = (await import('node-fetch')).default;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res: any = await nodeFetch(url, {
      method: 'GET', headers: { 'User-Agent': PDF_UA, 'Accept': 'application/pdf,*/*', 'Range': 'bytes=0-2047' },
      redirect: 'follow', signal: ctrl.signal as any,
    });
    clearTimeout(timer);
    if (res.status >= 400) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/pdf')) return true;
    if (ct.includes('text/html')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.slice(0, 5).toString('latin1').startsWith('%PDF');
  } catch { return false; }
}
let fileCheck: (url: string | null) => Promise<boolean> = realFileCheck;
export function __useFileCheckForTests(f: ((url: string | null) => Promise<boolean>) | null) { fileCheck = f ?? realFileCheck; }
/** Verify a PDF address actually opens (a real PDF, not a landing page, a bot wall or a 404). */
export const isFetchablePdf = (url: string | null) => fileCheck(url);

/** Check a batch of files, a few at a time. Returns one verdict per input, in order. */
export async function checkFiles(urls: (string | null)[], concurrency = 12): Promise<boolean[]> {
  const out: boolean[] = new Array(urls.length).fill(false);
  for (let i = 0; i < urls.length; i += concurrency) {
    const slice = urls.slice(i, i + concurrency);
    const oks = await Promise.all(slice.map(u => fileCheck(u)));
    oks.forEach((ok, k) => { out[i + k] = ok; });
  }
  return out;
}

// ── Licences, in the spelling the rules read ───────────────────────────────

/** "https://creativecommons.org/licenses/by-nc/4.0/" → "cc-by-nc". Anything that is not a Creative Commons licence → null. */
export function ccFromUrl(url?: string | null): string | null {
  const u = String(url || '');
  const m = /creativecommons\.org\/licenses\/(by(?:-(?:nc|nd|sa))*)(?:\/|$)/i.exec(u);
  if (m) return `cc-${m[1].toLowerCase()}`;
  if (/creativecommons\.org\/publicdomain\/zero/i.test(u)) return 'cc0';
  if (/creativecommons\.org\/publicdomain\/mark/i.test(u)) return 'public domain';
  return null;
}

// ── OpenAlex ───────────────────────────────────────────────────────────────

export const mapOpenAlexWork = (w: any): RawCandidate => {
  const src = w.primary_location?.source || {};
  return {
    title: w.title || w.display_name || 'Untitled',
    authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean).join(', ') || null,
    doi: w.doi || null,
    pdfUrl: w.best_oa_location?.pdf_url || w.open_access?.oa_url || null,
    journalName: src.display_name || null,
    issn: src.issn_l || (src.issn && src.issn[0]) || null,
    publisherName: src.host_organization_name || null,
    volume: w.biblio?.volume || null,
    issue: w.biblio?.issue || null,
    year: w.publication_year || null,
    subject: (w.concepts || [])[0]?.display_name || null,
    openAccess: !!w.open_access?.is_oa,
    source: 'OpenAlex',
    sourceRecordId: w.id || null,
    licence: w.best_oa_location?.license || null,
  };
};

/** The wizard's search: open-access journal articles matching a department, over-fetched through the cursor when only trusted hosts count. */
export async function fetchOpenAlexByDepartment(department: string, perDept: number, trustedOnly = false): Promise<FetchResult> {
  const out: RawCandidate[] = [];
  let fetched = 0;
  const perPage = 200;
  let cursor: string | null = '*';
  const maxPages = trustedOnly ? 30 : Math.max(1, Math.ceil(perDept / perPage));
  for (let page = 0; page < maxPages && cursor; page++) {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(department)}&filter=has_doi:true,open_access.is_oa:true,primary_location.source.type:journal&per-page=${perPage}&cursor=${encodeURIComponent(cursor)}`;
    const r = await fetchSourceJson(url, { source: 'OpenAlex', headers: UA });
    if (!r.ok) fail('OpenAlex', r);
    if (!Array.isArray(r.json?.results)) invalid('OpenAlex', 'no results list');
    const results = r.json.results;
    if (!results.length) break;
    for (const w of results) {
      fetched++;
      const m = mapOpenAlexWork(w);
      if (!m.pdfUrl) continue;
      if (trustedOnly && !isTrustedPdfHost(m.pdfUrl)) continue;
      out.push(m);
      if (out.length >= perDept) break;
    }
    if (out.length >= perDept) break;
    cursor = r.json?.meta?.next_cursor ?? null;
  }
  return { items: out.slice(0, perDept), fetched, skipped: fetched - Math.min(out.length, perDept) };
}

/** What the engine would ask OpenAlex for one of our journals — the same request, newest first. */
export async function fetchOpenAlexForJournal(journal: { issn: string; title: string; publisherName?: string | null }, fromYear: number, rows: number): Promise<FetchResult> {
  const r = await fetchSourceJson(openAlexJournalUrl(journal.issn, fromYear, rows), { source: 'OpenAlex', headers: OPENALEX_HEADERS, attempts: 3 });
  if (!r.ok) fail('OpenAlex', r);
  if (!Array.isArray(r.json?.results)) invalid('OpenAlex', 'no results list');
  const items: RawCandidate[] = [];
  for (const w of r.json.results) {
    const a = openAlexWork(w);
    items.push({
      source: 'OpenAlex', sourceRecordId: a.sourceRecordId, title: a.title, authors: a.authors || null, doi: a.doi, pdfUrl: a.pdfUrl,
      // Named for the journal we hold, which is the relationship the request was made for.
      journalName: journal.title, issn: journal.issn, publisherName: journal.publisherName ?? null,
      volume: w.biblio?.volume || null, issue: w.biblio?.issue || null, year: a.year,
      subject: (w.concepts || [])[0]?.display_name || null, openAccess: true, licence: a.licence,
    });
  }
  return { items, fetched: r.json.results.length, skipped: 0 };
}

// ── Crossref ───────────────────────────────────────────────────────────────

const CROSSREF_SELECT = 'DOI,title,author,issued,container-title,ISSN,volume,issue,license,link,publisher,subject,type';

/**
 * One journal's articles from Crossref, by its ISSN, newest first.
 *
 * Only records that name this journal's ISSN are kept — the relationship is checked, not assumed — and a
 * file is offered only when the record carries a Creative Commons licence, because a Crossref `link` on
 * anything else is a publisher's text-mining address, not something a reader may be given.
 */
export async function fetchCrossrefForJournal(journal: { issn: string; eissn?: string | null; title: string; publisherName?: string | null }, fromYear: number, rows: number, offset = 0, indexedSince: string | null = null): Promise<FetchResult> {
  // `indexedSince` (YYYY-MM-DD): only what Crossref has indexed or re-indexed since that day — an incremental sync of a journal whose window was already read.
  const filter = `from-pub-date:${fromYear}-01-01,type:journal-article${indexedSince && /^\d{4}-\d{2}-\d{2}$/.test(indexedSince) ? `,from-index-date:${indexedSince}` : ''}`;
  const url = `https://api.crossref.org/journals/${encodeURIComponent(journal.issn)}/works?filter=${encodeURIComponent(filter)}`
    + `&rows=${rows}&offset=${offset}&sort=published&order=desc&select=${encodeURIComponent(CROSSREF_SELECT)}&mailto=${encodeURIComponent(CONTACT)}`;
  const r = await fetchSourceJson(url, { source: 'Crossref', headers: UA, attempts: 3 });
  // Crossref answers 404 for an ISSN it does not know: that is "no articles", not a source failure — and fetchSourceJson
  // already treats a 4xx as a permanent answer rather than a breaker strike.
  if (!r.ok && r.status === 404) return { items: [], fetched: 0, skipped: 0 };
  if (!r.ok) fail('Crossref', r);
  if (r.json?.status !== 'ok' || !Array.isArray(r.json?.message?.items)) invalid('Crossref', 'no items list');

  const mine = new Set([normaliseIssn(journal.issn), normaliseIssn(journal.eissn)].filter(Boolean) as string[]);
  const items: RawCandidate[] = [];
  let skipped = 0;
  for (const it of r.json.message.items) {
    const title = Array.isArray(it.title) ? String(it.title[0] || '').trim() : String(it.title || '').trim();
    const doi = normaliseDoi(it.DOI);
    if (!title || !doi) { skipped++; continue; }
    const theirs = (it.ISSN || []).map((x: string) => normaliseIssn(x)).filter(Boolean);
    if (theirs.length && !theirs.some((x: string) => mine.has(x))) { skipped++; continue; }       // a different journal's record
    const lic = (it.license || [])
      .filter((l: any) => !Number(l['delay-in-days']))
      .map((l: any) => ({ cc: ccFromUrl(l.URL), version: l['content-version'] }))
      .filter((l: any) => l.cc)
      .sort((a: any, b: any) => (b.version === 'vor' ? 1 : 0) - (a.version === 'vor' ? 1 : 0))[0];
    const pdf = lic ? (it.link || []).find((l: any) => /pdf/i.test(l['content-type'] || '') && l.URL)?.URL ?? null : null;
    const year = it.issued?.['date-parts']?.[0]?.[0];
    items.push({
      source: 'Crossref', sourceRecordId: `crossref:${doi}`, title, doi,
      authors: (it.author || []).map((a: any) => a.name || [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).join(', ') || null,
      pdfUrl: pdf, journalName: journal.title, issn: journal.issn, publisherName: journal.publisherName || it.publisher || null,
      volume: it.volume || null, issue: it.issue || null, year: Number.isInteger(year) ? year : null,
      subject: (it.subject || [])[0] || null, openAccess: true, licence: lic?.cc ?? null,
    });
  }
  return { items, fetched: r.json.message.items.length, skipped };
}

// ── Europe PMC ─────────────────────────────────────────────────────────────

/**
 * Europe PMC's open-access search. A file is offered only where Europe PMC lists a PDF; an HTML page, a PMC landing
 * page or a DOI is a place to read, not a file to serve, and is no longer dressed up as one.
 */
export async function fetchEuropePmc(department: string, perDept: number, opts: { page?: number; fromYear?: number } = {}): Promise<FetchResult> {
  const thisYear = new Date().getFullYear();
  const term = searchTermsFor(department)[0];
  const q = encodeURIComponent(`${term} AND OPEN_ACCESS:Y${opts.fromYear ? ` AND PUB_YEAR:[${opts.fromYear} TO ${thisYear}]` : ''}`);
  const size = Math.min(perDept, 100);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=${size}&page=${opts.page ?? 1}&resultType=core`;
  const r = await fetchSourceJson(url, { source: 'EuropePMC', headers: UA, attempts: 3 });
  if (!r.ok) fail('Europe PMC', r);
  if (!Array.isArray(r.json?.resultList?.result)) invalid('Europe PMC', 'no result list');
  const results: any[] = r.json.resultList.result;
  const items: RawCandidate[] = [];
  let skipped = 0;
  for (const x of results) {
    if (!x.title) { skipped++; continue; }
    const ji = x.journalInfo || {}; const j = ji.journal || {};
    const urls = x.fullTextUrlList?.fullTextUrl || [];
    const pdf = urls.find((u: any) => u.documentStyle === 'pdf');
    items.push({
      title: x.title, authors: x.authorString || null, doi: x.doi || null,
      pdfUrl: pdf?.url || null,
      journalName: j.title || null, issn: j.issn || j.essn || null, publisherName: null,
      volume: ji.volume || null, issue: ji.issue || null,
      year: ji.yearOfPublication ? parseInt(ji.yearOfPublication) : (x.pubYear ? parseInt(x.pubYear) : null),
      subject: null, openAccess: true, source: 'EuropePMC',
      sourceRecordId: x.pmcid || x.pmid || x.id || null, licence: x.license || null,
    });
  }
  return { items, fetched: results.length, skipped };
}

// ── arXiv ──────────────────────────────────────────────────────────────────

/**
 * arXiv preprints. A preprint has no journal, ISSN, volume or issue of its own and is not given one: `journalName` is
 * only ever the author's own `journal_ref`, when there is one. Its identity travels in `extra`.
 */
export async function fetchArxiv(department: string, perDept: number, opts: { start?: number; fromYear?: number } = {}): Promise<FetchResult> {
  const q = encodeURIComponent(searchTermsFor(department)[0]);
  const size = Math.min(perDept, 50);
  const url = `https://export.arxiv.org/api/query?search_query=all:${q}&start=${opts.start ?? 0}&max_results=${size}&sortBy=submittedDate&sortOrder=descending`;
  const r = await fetchSourceJson(url, { source: 'arXiv', headers: UA, text: true, attempts: 3 });
  if (!r.ok) fail('arXiv', r);
  const xml = String(r.json || '');
  if (!/<feed[\s>]/.test(xml)) invalid('arXiv', 'not an Atom feed');
  const entries = xml.split('<entry>').slice(1);
  const items: RawCandidate[] = [];
  let skipped = 0;
  for (const e of entries) {
    const get = (tag: string) => { const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
    const arxivId = ((get('id').split('/abs/')[1]) || '').replace(/v\d+$/, '');
    const published = get('published');
    const year = published ? parseInt(published.slice(0, 4)) : null;
    if (!arxivId || (opts.fromYear && year && year < opts.fromYear)) { skipped++; continue; }
    items.push({
      title: get('title') || 'Untitled',
      authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m: any) => m[1].trim()).join(', ') || null,
      doi: get('arxiv:doi') || null,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
      journalName: get('arxiv:journal_ref') || null,
      issn: null, publisherName: 'arXiv', volume: null, issue: null, year,
      // arXiv declares no open licence for a paper, so nothing here is verifiable and the file is not served.
      subject: null, openAccess: true, source: 'arXiv', sourceRecordId: `arxiv:${arxivId}`, licence: null,
      extra: { preprint: true, repository: 'arXiv', arxivId },
    });
  }
  return { items, fetched: entries.length, skipped };
}

// ── DOAJ articles (the wizard's older source) ──────────────────────────────

export async function fetchDoajArticles(department: string, perDept: number, trustedOnly = false): Promise<FetchResult> {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(department)}?pageSize=${Math.min(perDept * (trustedOnly ? 5 : 1), 100)}`;
  const r = await fetchSourceJson(url, { source: 'DOAJ', headers: UA });
  if (!r.ok) fail('DOAJ', r);
  if (!Array.isArray(r.json?.results)) invalid('DOAJ', 'no results list');
  const results: any[] = r.json.results;
  const mapped: RawCandidate[] = results.map((rec: any) => {
    const b = rec.bibjson || {};
    const ids = b.identifier || [];
    const issnObj = ids.find((i: any) => i.type === 'eissn') || ids.find((i: any) => i.type === 'pissn');
    const pdfLink = (b.link || []).find((l: any) => l.type === 'fulltext');
    return {
      title: b.title || 'Untitled',
      authors: (b.author || []).map((a: any) => a.name).filter(Boolean).join(', ') || null,
      doi: (ids.find((i: any) => i.type === 'doi') || {}).id || null,
      pdfUrl: pdfLink?.url || null,
      journalName: b.journal?.title || null, issn: issnObj?.id || null, publisherName: b.journal?.publisher || null,
      volume: b.journal?.volume || null, issue: b.journal?.number || null,
      year: b.year ? parseInt(b.year) : null,
      subject: (b.subject || [])[0]?.term || null, openAccess: true, source: 'DOAJ',
      sourceRecordId: rec.id || null, licence: (b.journal?.license || [])[0]?.type || null,
    };
  }).filter((x: RawCandidate) => x.pdfUrl || x.doi);
  const kept = (trustedOnly ? mapped.filter(x => isTrustedPdfHost(x.pdfUrl)) : mapped).slice(0, perDept);
  return { items: kept, fetched: results.length, skipped: results.length - kept.length };
}

// ── The wizard's single entry point ────────────────────────────────────────

/** Crossref has no department search; for a department it reads the accepted journals we already hold there. */
async function crossrefByDepartment(department: string, perDept: number, fromYear: number, db: any): Promise<FetchResult> {
  const journals: any[] = await db.journal.findMany({
    where: { domain: department, status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration' },
    orderBy: [{ lastIngestedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 12,
  });
  const out: FetchResult = { items: [], fetched: 0, skipped: 0 };
  for (const j of journals) {
    if (out.items.length >= perDept) break;
    const got = await fetchCrossrefForJournal(j, fromYear, Math.min(25, perDept - out.items.length));
    out.items.push(...got.items); out.fetched += got.fetched; out.skipped += got.skipped;
    await pause(150);
  }
  out.items = out.items.slice(0, perDept);
  return out;
}

export async function fetchForDept(source: string, dept: string, limit: number, opts: { trustedOnly?: boolean; fromYear: number; db: any }): Promise<RawCandidate[]> {
  switch (source) {
    case 'doaj': return (await fetchDoajArticles(dept, limit, !!opts.trustedOnly)).items;
    case 'arxiv': return (await fetchArxiv(dept, limit)).items.filter(a => a.pdfUrl);
    case 'europepmc': return (await fetchEuropePmc(dept, limit)).items;
    case 'crossref': return (await crossrefByDepartment(dept, limit, opts.fromYear, opts.db)).items;
    default: return (await fetchOpenAlexByDepartment(dept, limit, !!opts.trustedOnly)).items;
  }
}

export const ARTICLE_SOURCE_IDS: ArticleSourceId[] = ['crossref', 'openalex', 'europepmc', 'arxiv', 'doaj'];
/** A polite gap between requests, replaceable in tests. */
export const articlePause = (ms: number) => pause(ms);
