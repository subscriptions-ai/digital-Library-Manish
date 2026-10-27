import { createHash } from 'node:crypto';

/**
 * A deterministic OAPEN-FORMAT corpus and a fake OAI-PMH server for the Phase 2C tests. The XML is built to the shape of a real OAPEN xoai page (audited 2026-10-26: header with
 * identifier / datestamp / setSpec; the nested <element name=…> metadata; the bundles with a licence per bitstream; a stateless resumption token xoai/<from>/<until>/<set>/<offset>;
 * `completeListSize`; deletions as a header with status="deleted"). Nothing here touches the network: tests install `transport` with __useFetchForTests.
 *
 * Shape of record i (the same for every seed, so a run can be compared with the oracle exactly):
 *   k = i % 20
 *   0   deleted at the source (header only)                                  → not a book (counted, skipped)
 *   1   no title                                                            → unreadable (counted, skipped)
 *   2   published 1995, clear department, open licence                      → review (older than the book year policy)
 *   3   no publication year, clear department, open licence                 → review (no year)
 *   4   nothing that points at a department                                 → refused (no reliable department)
 *   5   department only by words (no controlled code)                       → review (department unclear)
 *   6   no licence declared, clear department, 2015                         → "open access first": review · "metadata only allowed": published as metadata only
 *   7   CC BY-NC (not commercial), clear department, 2018                  → "open access first": review · "metadata only allowed": published as a link
 *   8–19  CC BY or CC BY-SA, clear department, year 2000 + i % 25          → published (a file is claimed; every 7th claims a file that does not open)
 * department (when clear) = DEPARTMENTS[i % 3].
 * Repeats: a record with i % 100 = 58, and one with i % 100 = 8 (i ≥ 108, so it is on the NEXT page from its source), carry the DOI and ISBN of an earlier NEW book (cloneSource).
 * Held duplicates (seeded into the catalogue by the test) for normal records k ≥ 8 that are not repeats, by m = i % 12 — see heldKind.
 */

export const DEPARTMENTS = ['Computer / IT', 'Law', 'Medical Sciences'] as const;
const SUBJECT_WORDS = ['software programming', 'law', 'clinical medicine'] as const;
const CODES = ['thema EDItEUR::U Computing and Information technology::UM Computer programming / software development', 'thema EDItEUR::L Law::LN Laws of specific jurisdictions', 'thema EDItEUR::M Medicine::MB Medicine: general issues'] as const;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const seedNum = (seed: string) => (parseInt(sha(seed).slice(0, 6), 16) % 90000) + 10000;
export const handleOf = (seed: string, i: number) => `20.500.12657/${seedNum(seed)}${String(i).padStart(5, '0')}`;
export const doiOf = (seed: string, i: number) => `10.7777/oapen.${seed}.${i}`;
const isbn13 = (twelve: string) => { let s = 0; for (let k = 0; k < 12; k++) s += Number(twelve[k]) * (k % 2 ? 3 : 1); return twelve + String((10 - (s % 10)) % 10); };
export const isbnOf = (seed: string, i: number, alt = false) => isbn13(`${alt ? '979' : '978'}${String(seedNum(seed)).padStart(5, '0')}${String(i).padStart(4, '0')}`);

export const kindOf = (i: number) => i % 20;
export const deptIdx = (i: number) => (cloneSource(i) ?? i) % 3;
export const deptOf = (i: number): string => (kindOf(i) === 5 ? 'Computer / IT' : DEPARTMENTS[deptIdx(i)]);       // k = 5 is placed only by words: it SUGGESTS Computer / IT
export const yearOf = (i: number): number | null => { const k = kindOf(i); if (isRepeat(i)) return yearOf(cloneSource(i)!); return k === 2 ? 1995 : k === 3 ? null : k === 6 ? 2015 : k === 7 ? 2018 : k === 4 || k === 5 ? 2012 : 2000 + (i % 25); };
export const heldKind = (i: number): 'enriched' | 'conflicting' | 'unchanged' | 'licence-fill' | 'protected' | 'isbn' | 'title' | null => {
  if (kindOf(i) < 8 || isRepeat(i)) return null;
  return ([ 'enriched', 'conflicting', 'unchanged', 'licence-fill', 'protected', 'isbn', 'title' ] as const)[i % 12] ?? null;     // m = 7..11 → null: a new book
};
export const isRepeat = (i: number) => i % 100 === 58 || (i % 100 === 8 && i >= 108);
const eligibleSource = (j: number) => j >= 0 && kindOf(j) >= 8 && !isRepeat(j) && heldKind(j) === null;
export const cloneSource = (i: number): number | null => {
  if (!isRepeat(i)) return null;
  for (let j = i - (i % 100 === 8 ? 9 : 1); j >= Math.max(0, i - 40); j--) if (eligibleSource(j)) return j;
  return null;
};
/** The identifiers a record carries: its own, or its source's when it is a repeat. */
const idsOf = (seed: string, i: number) => { const s = cloneSource(i) ?? i; return { doi: doiOf(seed, s), isbn: isbnOf(seed, s), isbn2: s % 5 === 0 ? isbnOf(seed, s, true) : null }; };
export const fileOk = (i: number) => i % 7 !== 0;
export const licenceOf = (i: number): { uri: string; rights: string } | null => {
  const k = kindOf(i);
  if (k === 6) return null;
  if (k === 7) return { uri: 'https://creativecommons.org/licenses/by-nc/4.0/', rights: 'CC-BY-NC' };
  return i % 2 ? { uri: 'https://creativecommons.org/licenses/by-sa/4.0/', rights: 'CC-BY-SA' } : { uri: 'https://creativecommons.org/licenses/by/4.0/', rights: 'CC-BY' };
};
export const titleOf = (seed: string, i: number) => {
  const k = kindOf(i);
  if (k === 4) return `A miscellany of papers ${seed} ${i}`;
  if (k === 5) return `Notes and essays ${seed} ${i}`;
  const w = SUBJECT_WORDS[deptIdx(i)];
  return `${w[0].toUpperCase()}${w.slice(1)} handbook ${seed} ${i}`;
};
export const datestampOf = (i: number) => new Date(Date.UTC(2023, 0, 1, 0, 0, 0) + i * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
type Tree = { [k: string]: Tree | string[] };
const ser = (name: string, node: Tree | string[]): string => Array.isArray(node)
  ? `<element name="${name}">${node.map(v => `<field name="value">${esc(v)}</field>`).join('')}</element>`
  : `<element name="${name}">${Object.entries(node).map(([k, v]) => ser(k, v)).join('')}</element>`;
const leaf = (...values: string[]) => ({ none: values });

export type SampleOpts = { padBytes?: number };

export function recordXml(seed: string, i: number, o: SampleOpts = {}): string {
  const handle = handleOf(seed, i), k = kindOf(i);
  const header = (del: boolean) => `<header${del ? ' status="deleted"' : ''}><identifier>oai:library.oapen.org:${handle}</identifier><datestamp>${datestampOf(i)}</datestamp><setSpec>com_20.500.12657_5</setSpec><setSpec>col_20.500.12657_6</setSpec></header>`;
  if (k === 0) return `<record>${header(true)}</record>`;
  const ids = idsOf(seed, i), year = yearOf(i), lic = licenceOf(i), clear = k !== 4 && k !== 5;
  const dc: Tree = {
    contributor: { author: leaf(`Author${i}, Anna`, `Coauthor${i}, Ben`) },
    description: { abstract: leaf(`An abstract of sample book ${i}. ${'Lorem ipsum dolor sit amet. '.repeat(o.padBytes ? Math.ceil(o.padBytes / 28) : 2)}`) },
    language: { none: ['eng'] },
    identifier: { uri: leaf(`https://library.oapen.org/handle/${handle}`) },
    type: leaf('book'),
  };
  if (k !== 1) dc.title = leaf(titleOf(seed, i));
  if (year) dc.date = { issued: leaf(String(year)), accessioned: leaf('2024-01-01T00:00:00Z') };
  if (k === 5) dc.subject = { other: leaf('software') };                                              // words only: a plausible department, not a clear one
  else if (clear) dc.subject = { classification: leaf(CODES[deptIdx(i)]), other: leaf(SUBJECT_WORDS[deptIdx(i)], 'sample') };
  const oapen: Tree = { identifier: { doi: leaf(ids.doi) }, relation: { isbn: leaf(...[ids.isbn, ids.isbn2].filter(Boolean) as string[]) }, pages: leaf(String(100 + (i % 300))), imprint: leaf('Sample Open Press') };
  const url = `https://library.oapen.org/bitstream/${handle}/1/${fileOk(i) ? 'ok' : 'bad'}-${seedNum(seed)}-${i}.pdf`;
  const bundles = `<element name="bundles">`
    + `<element name="bundle"><field name="name">ORIGINAL</field><element name="bitstreams"><element name="bitstream"><field name="name">book-${i}.pdf</field><field name="format">application/pdf</field><field name="size">1000000</field><field name="url">${url}</field>${lic ? `<field name="rightsuri">${lic.uri}</field><field name="rights">${lic.rights}</field>` : ''}</element></element></element>`
    + `<element name="bundle"><field name="name">THUMBNAIL</field><element name="bitstreams"><element name="bitstream"><field name="name">book-${i}.jpg</field><field name="format">image/jpeg</field><field name="url">https://library.oapen.org/bitstream/${handle}/3/book-${i}.jpg</field></element></element></element></element>`;
  return `<record>${header(false)}<metadata><metadata xmlns="http://www.lyncode.com/xoai">\n${ser('dc', dc)}\n${ser('oapen', oapen)}\n${bundles}\n</metadata></metadata></record>`;
}

export type Corpus = { seed: string; total: number; opts?: SampleOpts };
export const makeCorpus = (seed: string, total: number, opts: SampleOpts = {}): Corpus => ({ seed, total, opts });

const SET = 'com_20.500.12657_5';
const envelope = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><responseDate>2026-10-26T09:20:12Z</responseDate>${inner}</OAI-PMH>`;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3]);

export type FakeControl = {
  /** The next N list requests answer with this status (and Retry-After seconds) instead of data. */
  fail: { n: number; status: number; retryAfter?: number } | null;
  /** The next N list requests throw (the network went away). */
  throwNext: number;
  /** Return a different page for the same request (tests the retry check). Called with the first index of the page and the indices it holds. */
  mutate: null | ((offset: number, indices: number[]) => number[]);
  badToken: boolean;
  delayMs: number;
  /** Every URL requested, in order. */
  log: string[];
  /** Pages (list requests) served. */
  pages: number;
  /** Records that have LEFT the list (as if OAPEN changed them after the job's closing time): not served any more, so every later record moves one place towards the front. */
  removed: Set<number>;
  /** Called at the start of every list request with its number (1, 2, …) — a test changes the feed between two requests here. */
  hook: null | ((n: number, url: string) => void);
};

/** The fake OAI-PMH server for one corpus. Install `transport` with __useFetchForTests. */
export function fakeOapen(corpus: Corpus, pageSize = 100) {
  const ctl: FakeControl = { fail: null, throwNext: 0, mutate: null, badToken: false, delayMs: 0, log: [], pages: 0, removed: new Set(), hook: null };
  let listRequests = 0;
  const transport = async (url: string): Promise<Response> => {
    ctl.log.push(url);
    if (ctl.delayMs) await new Promise(r => setTimeout(r, ctl.delayMs));
    const u = new URL(url);
    if (u.hostname === 'library.oapen.org' && u.pathname.startsWith('/bitstream/')) {
      if (/\/bad-/.test(u.pathname)) return new Response('<html>please verify you are human</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response(PDF, { status: 206, headers: { 'content-type': 'application/pdf' } });
    }
    if (u.hostname !== 'library.oapen.org' || u.pathname !== '/oai/request') return new Response('not found', { status: 404 });
    const verb = u.searchParams.get('verb');
    if (verb === 'Identify') return new Response(envelope('<Identify><repositoryName>OAPEN Library (fake)</repositoryName><granularity>YYYY-MM-DDThh:mm:ssZ</granularity></Identify>'), { status: 200 });
    if (verb !== 'ListRecords') return new Response(envelope('<error code="badVerb">no</error>'), { status: 200 });
    listRequests++; ctl.hook?.(listRequests, url);
    if (ctl.throwNext > 0) { ctl.throwNext--; throw new Error('socket hang up'); }
    if (ctl.fail && ctl.fail.n > 0) { ctl.fail.n--; return new Response('busy', { status: ctl.fail.status, headers: ctl.fail.retryAfter !== undefined ? { 'retry-after': String(ctl.fail.retryAfter) } : {} }); }
    let from = u.searchParams.get('from') || '', until = u.searchParams.get('until') || '', offset = 0;
    const tok = u.searchParams.get('resumptionToken');
    if (tok) {
      const m = /^xoai\/([^/]*)\/([^/]*)\/([^/]*)\/(\d+)$/.exec(tok);
      if (!m || ctl.badToken) return new Response(envelope('<error code="badResumptionToken">bad token</error>'), { status: 200 });
      from = m[1]; until = m[2]; offset = Number(m[4]);
    }
    const all: number[] = [];
    for (let i = 0; i < corpus.total; i++) { const d = datestampOf(i); if (!ctl.removed.has(i) && (!from || d >= from) && (!until || d <= until)) all.push(i); }
    if (!all.length && !tok) return new Response(envelope('<error code="noRecordsMatch">no records</error>'), { status: 200 });
    let slice = all.slice(offset, offset + pageSize);
    if (ctl.mutate) slice = ctl.mutate(offset, slice);
    ctl.pages++;
    const more = offset + pageSize < all.length;
    const tail = more ? `<resumptionToken completeListSize="${all.length}" cursor="${offset}">xoai/${from}/${until}/${SET}/${offset + pageSize}</resumptionToken>` : `<resumptionToken completeListSize="${all.length}" cursor="${offset}"/>`;
    return new Response(envelope(`<ListRecords>${slice.map(i => recordXml(corpus.seed, i, corpus.opts)).join('')}${tail}</ListRecords>`), { status: 200, headers: { 'content-type': 'text/xml' } });
  };
  return { transport: transport as unknown as (url: string, init?: any, connectTimeoutMs?: number) => Promise<Response>, ctl };
}
