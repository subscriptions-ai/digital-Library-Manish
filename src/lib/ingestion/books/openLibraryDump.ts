import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { isbn13s } from './identifiers.js';
import { lccFromOpenLibrary } from './openLibrary.js';
import { fetchRaw } from '../sourceHealth.js';
import type { NormalisedBook } from './normalise.js';

/**
 * Open Library's monthly data dump — the bulk source. The Web API is NOT used for volume.
 *
 *   ol_dump_editions_YYYY-MM-DD.txt.gz     one edition per line:  type \t key \t revision \t last_modified \t {json}
 *
 * The pipeline for a dump is: STREAM the file (never held in memory; a line at a time through gunzip) → FILTER toward academic books →
 * normalise identifiers → hand each batch to the shared harvest (dedupe, department classification, rights) → catalogue. This module is
 * the first two steps. A dump is ~10 GB compressed and tens of millions of lines, most of them trade books, children's books and fiction,
 * so the filter is deliberately strict and EVERY line it rejects is counted under a reason: a line is read, then it is either a candidate or
 * skipped for a stated cause, and the run's arithmetic still balances (accounting.ts).
 *
 * What a candidate must have: a title, an ISBN (without one it cannot be told from another edition or matched later), and academic evidence —
 * a Library of Congress class in an academic range, OR a Dewey class in the sciences/technology/social sciences, OR an academic publisher,
 * OR a subject that names an academic field — and none of the marks of fiction, children's books or non-books. It then goes through the same
 * Department classifier as every book: a code AND the title or subject wording must agree before anything is catalogued.
 *
 * Rights: the dump says nothing about who may read a book. Licence is never set; every record is Metadata Only, linked to Open Library's page.
 *
 * Resuming: the position is the number of the next line to read. A gzip stream cannot be entered mid-way, so resuming reads (and does not
 * parse) the lines before it — fast, and exactly correct; a restart repeats nothing because the position only moves after the batch it
 * follows was written. The position belongs to ONE file: it is stored with the file's identity (size and name), and a different dump starts
 * from the top rather than trusting a number that means something else.
 */

export const OPENLIBRARY_DUMP_URL = 'https://openlibrary.org/data/ol_dump_editions_latest.txt.gz';
export const OPENLIBRARY_DUMP_PROVIDER = 'OpenLibraryDump';

/** LCC classes that are not scholarly books: literature and fiction (PQ–PZ), music scores (M), fine-arts picture books are kept (N). */
const LCC_REJECT = /^(PQ|PR|PS|PT|PZ|M[LT]?)$/;
/** LCC classes that are academic enough to count as evidence on their own: sciences, medicine, agriculture, technology, law, social sciences, education, architecture. */
const LCC_ACADEMIC = /^(Q[A-Z]?|R[A-Z]?|S[A-Z]?|T[A-Z]?|U[A-Z]?|V[A-Z]?|K[A-Z]*|H[A-Z]?|J[A-Z]?|L[A-Z]?|NA|BF|GE|GB|GC|BC|Z[A-Z]?)$/;
const ACADEMIC_PUBLISHER = /\b(springer|elsevier|wiley|cambridge university press|oxford university press|routledge|taylor\s*&\s*francis|crc press|mcgraw[- ]hill|pearson|academic press|sage publications|de gruyter|mit press|ieee|acm press|cengage|prentice[- ]hall|addison[- ]wesley|world scientific|iop publishing|royal society of chemistry|american chemical society|lippincott|saunders|mosby|thieme|wolters kluwer|f\.?\s?a\.? davis|jones\s*&\s*bartlett|edward elgar|palgrave|emerald|woodhead|artech house|morgan kaufmann|o'reilly|apress|packt|university press|institute of|national academies)\b/i;
const ACADEMIC_SUBJECT = /\b(engineering|mathematics|physics|chemistry|biology|medicine|medical|nursing|pharmac|dentistry|anatomy|physiology|computer science|computing|algorithm|software|electronics|thermodynamics|mechanics|materials science|nanotechnology|biotechnology|genetics|neuroscience|statistics|econometrics|accounting|finance|management|marketing|law|jurisprudence|education|pedagogy|sociology|psychology|architecture|civil engineering|agriculture|agronomy|ecology|geology|textbook|handbook)\b/i;
const NOT_A_BOOK = /\b(fiction|novel|novels|stories|short stories|poetry|poems|juvenile|children'?s|picture books?|fairy tales?|romance|mystery|fantasy|comics?|graphic novels?|cookbooks?|coloring|colouring|crosswords?|puzzles?|horoscope|erotica|bible stud|sheet music|spanish language materials|large type)\b/i;

export type OlReject = 'not-an-edition' | 'unreadable' | 'no-title' | 'no-isbn' | 'fiction-or-children' | 'not-academic' | 'deleted';
export type OlLine = { candidate: NormalisedBook | null; reject: OlReject | null };

const asList = (v: any): string[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map(x => String(x?.name ?? x).trim()).filter(Boolean);
const ddcClass = (d: string) => /^\s*(\d{3})/.exec(d)?.[1] ?? null;

/** One dump line → a candidate, or the reason it is not one. Pure. */
export function parseEditionLine(provider: string, line: string): OlLine {
  const tab = line.split('\t');
  if (tab.length < 5) return { candidate: null, reject: 'unreadable' };
  if (tab[0] !== '/type/edition') return { candidate: null, reject: tab[0] === '/type/delete' ? 'deleted' : 'not-an-edition' };
  let j: any;
  try { j = JSON.parse(tab[4]); } catch { return { candidate: null, reject: 'unreadable' }; }
  const title = [j.title, j.subtitle].map((x: any) => String(x || '').trim()).filter(Boolean).join(': ').replace(/\s+/g, ' ');
  if (!title) return { candidate: null, reject: 'no-title' };
  const isbns = isbn13s([...asList(j.isbn_13), ...asList(j.isbn_10)]).slice(0, 8);
  if (!isbns.length) return { candidate: null, reject: 'no-isbn' };

  const subjects = asList(j.subjects).slice(0, 25);
  const lcc = [...new Set(asList(j.lc_classifications).map(lccFromOpenLibrary).filter(Boolean) as string[])].slice(0, 6);
  const ddc = asList(j.dewey_decimal_class).slice(0, 4);
  const publisher = asList(j.publishers)[0] ?? null;
  const genre = asList(j.genres).join(' ');
  const lccClasses = lcc.map(c => /^[A-Z]+/.exec(c)?.[0] ?? '');

  if (lccClasses.some(c => LCC_REJECT.test(c)) || NOT_A_BOOK.test(`${subjects.join(' ; ')} ${genre} ${title}`)) return { candidate: null, reject: 'fiction-or-children' };
  const ddcOk = ddc.map(ddcClass).some(c => c !== null && Number(c) >= 300 && Number(c) < 800);       // social sciences, language, science, technology, arts (not literature 800s, history/geography 900s)
  const evidence = lccClasses.some(c => LCC_ACADEMIC.test(c)) || ddcOk || (!!publisher && ACADEMIC_PUBLISHER.test(publisher)) || ACADEMIC_SUBJECT.test(subjects.join(' ; '));
  if (!evidence) return { candidate: null, reject: 'not-academic' };

  const key = String(tab[1] || '');
  const id = key.replace(/^\/books\//, '');
  const year = /(\d{4})/.exec(String(j.publish_date || ''))?.[1];
  const works = asList(j.works)[0];
  const authors = typeof j.by_statement === 'string' ? j.by_statement.replace(/^by\s+/i, '').replace(/[./]+\s*$/, '').trim() : '';
  // Authors are keys into a separate dump; the edition's own "by" statement is the name when it has one. A record with neither contributor nor publisher cannot be identified.
  if (!authors && !publisher) return { candidate: null, reject: 'not-academic' };
  const landing = `https://openlibrary.org${key}`;
  return {
    reject: null,
    candidate: {
      provider, sourceRecordId: id, title, authors: authors || null, editors: null, publisherName: publisher,
      year: year ? Number(year) : null, doi: null, isbns,
      language: asList(j.languages)[0]?.replace(/^\/languages\//, '') ?? null,
      description: null, subjects, classifications: [], pages: j.number_of_pages ? String(j.number_of_pages) : null, lcc,
      edition: j.edition_name ? String(j.edition_name) : null, country: null,
      coverUrl: Array.isArray(j.covers) && j.covers[0] > 0 ? `https://covers.openlibrary.org/b/id/${j.covers[0]}-M.jpg` : null,
      landingUrl: landing, externalUrl: landing, fileUrl: null,
      licence: null, licenceBasis: 'none', modified: tab[3] || null, deleted: false,
      extra: { ddc, workKey: works ?? null },
    },
  };
}

// ── Reading the dump ────────────────────────────────────────────────────────

export type DumpSource = { kind: 'file' | 'url'; location: string };

/** A line stream over a local file or a URL, gunzipped when it ends in .gz. Closing the iterator closes the file or the connection. */
async function openLines(src: DumpSource): Promise<{ lines: AsyncIterable<string>; identity: string; close: () => void }> {
  let input: Readable; let identity: string; let close = () => {};
  if (src.kind === 'file') {
    const st = await stat(src.location);
    identity = `file:${src.location}:${st.size}`;
    input = createReadStream(src.location); close = () => input.destroy();
  } else {
    const ac = new AbortController();
    const res = await fetchRaw(src.location, { headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` }, signal: ac.signal });
    if (!res.ok || !res.body) throw Object.assign(new Error(`Open Library dump answered HTTP ${res.status}`), { status: res.status });
    identity = `url:${src.location}:${res.headers.get('content-length') ?? res.headers.get('etag') ?? res.headers.get('last-modified') ?? ''}`;
    input = Readable.fromWeb(res.body as any); close = () => { ac.abort(); input.destroy(); };
  }
  const text = /\.gz($|\?)/i.test(src.location) ? input.pipe(createGunzip()) : input;
  if (text !== input) input.on('error', e => text.destroy(e));
  return { lines: createInterface({ input: text, crlfDelay: Infinity }), identity, close };
}

export type DumpBatch = {
  /** Lines read this batch (every one is accounted: a candidate or a counted rejection). */
  read: number;
  candidates: NormalisedBook[];
  rejects: Record<string, number>;
  /** The number of the next line to read; null when the dump has been read to its end. */
  next: number | null;
  identity: string;
  /** The position given belonged to a different file, so this batch began at the top. */
  restarted: boolean;
};

/**
 * A reader that stays open between batches. Re-opening a gzip stream and skipping to the saved line for every batch would read the whole
 * prefix again each time (quadratic over a 10 GB file), so within a run the stream is kept and simply continued: a batch that starts exactly
 * where the last one stopped reads on. A batch that starts anywhere else (a resume after a restart, another file) opens afresh and skips to its
 * line without parsing. The stream is consumed by hand (`next()`), never with `for await … break`, which would close it between batches.
 * Idle for two minutes, it closes itself.
 */
export class DumpReader {
  private it: AsyncIterator<string> | null = null;
  private closeFn: (() => void) | null = null;
  private idle: NodeJS.Timeout | null = null;
  identity = '';
  /** Lines consumed so far from the open stream (the number of the next line to read). */
  pos = 0;
  constructor(public readonly src: DumpSource, private readonly idleMs = 120_000) {}

  get isOpen() { return !!this.it; }

  close() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    try { this.closeFn?.(); } catch { /* already closed */ }
    this.it = null; this.closeFn = null; this.pos = 0;
  }

  private async open() {
    this.close();
    const { lines, identity, close } = await openLines(this.src);
    this.it = lines[Symbol.asyncIterator](); this.closeFn = close; this.identity = identity; this.pos = 0;
  }

  /**
   * Read from `startLine`, stopping at `maxCandidates` academic candidates or `maxLines` lines read, whichever comes first.
   * `identity` is the file the position was taken from; a different file starts at the top.
   */
  async batch(startLine: number, opts: { maxCandidates?: number; maxLines?: number; provider?: string; identity?: string | null } = {}): Promise<DumpBatch> {
    const maxCandidates = opts.maxCandidates ?? 300, maxLines = opts.maxLines ?? 100_000, provider = opts.provider ?? OPENLIBRARY_DUMP_PROVIDER;
    if (this.idle) clearTimeout(this.idle);
    let restarted = false;
    try {
      if (!this.it || startLine !== this.pos) {
        await this.open();
        // A position is only meaningful for the file it was taken from. A different dump (next month's, or another path) starts at the top.
        if (opts.identity && opts.identity !== this.identity && startLine > 0) { startLine = 0; restarted = true; }
        while (this.pos < startLine) {                                   // already done: skipped, not parsed
          const r = await this.it!.next();
          if (r.done) { this.close(); return { read: 0, candidates: [], rejects: {}, next: null, identity: this.identity, restarted }; }
          this.pos++;
        }
      } else if (opts.identity && opts.identity !== this.identity) {
        // The stream we hold is not the file this position came from.
        await this.open(); startLine = 0; restarted = true;
      }
      const out: DumpBatch = { read: 0, candidates: [], rejects: {}, next: null, identity: this.identity, restarted };
      let ended = false;
      for (;;) {
        const r = await this.it!.next();
        if (r.done) { ended = true; break; }
        this.pos++; out.read++;
        const p = parseEditionLine(provider, r.value);
        if (p.candidate) out.candidates.push(p.candidate); else out.rejects[p.reject!] = (out.rejects[p.reject!] || 0) + 1;
        if (out.candidates.length >= maxCandidates || out.read >= maxLines) break;
      }
      out.next = ended ? null : this.pos;
      if (ended) this.close(); else this.idle = setTimeout(() => this.close(), this.idleMs).unref();
      return out;
    } catch (e) { this.close(); throw e; }
  }
}

/** One-shot: open, read one batch, close. For tests and for a caller that wants no state; the harvest uses a kept-open DumpReader. */
export async function readDumpBatch(src: DumpSource, startLine: number, opts: { maxCandidates?: number; maxLines?: number; provider?: string; identity?: string | null } = {}): Promise<DumpBatch> {
  const r = new DumpReader(src);
  try { return await r.batch(startLine, opts); } finally { r.close(); }
}
