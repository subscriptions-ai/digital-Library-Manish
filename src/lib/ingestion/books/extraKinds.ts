import { findHeldBooks } from './dedupe.js';
import { normaliseCrossrefBook, fetchCrossrefBooksPage } from './crossrefBooks.js';
import { NLM_QUERIES, PAGE as NLM_PAGE, parseNlmToken, fetchNlmPage, normaliseNlmRecord } from './nlmCatalog.js';
import { fetchPressbooksPage, normalisePressbooksBook, checkPressbooksLicence, applyPressbooksLicence } from './pressbooks.js';
import { DumpReader, OPENLIBRARY_DUMP_URL, type DumpSource } from './openLibraryDump.js';
import type { NormalisedBook } from './normalise.js';
import type { Batch, BatchContext, OaiProviderConfig } from './oaiHarvest.js';

/**
 * One page of each of the metadata providers added after the OAI ones. Each returns the shape the shared harvest wants, and nothing else:
 * deduping, department classification, rights and writing are the harvest's, so a book from here is judged exactly like any other.
 * (Types only are imported from the harvest, so there is no cycle.)
 */

const failed = (r: { error?: string; status?: number | null }) => ({ failed: r.error || `HTTP ${r.status}` });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const PRESSBOOKS_LICENCE_CHECKS_PER_BATCH = () => { const n = Number(process.env.PRESSBOOKS_LICENCE_CHECKS); return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 20; };

// ── Open Library dump: where the file is ────────────────────────────────────
const DUMP_KEY = 'ingestion.olbulk.v1';
export async function loadDumpSource(db: any): Promise<DumpSource> {
  const env = process.env.OPENLIBRARY_DUMP_FILE;
  if (env) return { kind: 'file', location: env };
  const row = await db.appSetting.findUnique({ where: { key: DUMP_KEY } }).catch(() => null);
  const v = row?.value as any;
  if (v && (v.kind === 'file' || v.kind === 'url') && typeof v.location === 'string' && v.location) return { kind: v.kind, location: v.location };
  return { kind: 'url', location: OPENLIBRARY_DUMP_URL };
}
/** The open readers, one per file, so a run reads on from where its last batch stopped instead of re-reading the prefix. */
const readers = new Map<string, DumpReader>();
export function dumpReaderFor(src: DumpSource): DumpReader {
  const k = `${src.kind}:${src.location}`;
  let r = readers.get(k);
  if (!r) { r = new DumpReader(src); readers.set(k, r); }
  return r;
}
/** Close every open dump stream (end of a bulk run, or tests). */
export function closeDumpReaders() { for (const r of readers.values()) r.close(); readers.clear(); }

export async function saveDumpSource(db: any, src: DumpSource, by: string) {
  await db.appSetting.upsert({ where: { key: DUMP_KEY }, create: { key: DUMP_KEY, value: src as any, updatedBy: by }, update: { value: src as any, updatedBy: by } });
}

export async function extraBatch(cfg: OaiProviderConfig, token: string | null, from: string | null, ctx?: BatchContext): Promise<Batch | { failed: string } | null> {
  switch (cfg.kind) {
    case 'crossrefbooks': {
      const r = await fetchCrossrefBooksPage(token, from, 100);
      if (!r.ok) return failed(r);
      const items: any[] = r.json.message.items;
      const books: NormalisedBook[] = []; let unusable = 0;
      for (const it of items) { const b = normaliseCrossrefBook(cfg.provider, it); if (b) books.push(b); else unusable++; }
      // An empty page is the end of the walk. (Crossref hands back a cursor even then.)
      const next = items.length && typeof r.json.message['next-cursor'] === 'string' ? r.json.message['next-cursor'] : null;
      return { books, count: items.length, deleted: 0, unusable, next, total: Number(r.json.message['total-results']) || null, error: null };
    }
    case 'nlm': {
      const { q, start } = parseNlmToken(token);
      if (q >= NLM_QUERIES.length) return { books: [], count: 0, deleted: 0, unusable: 0, next: null, total: null, error: null };
      const r = await fetchNlmPage(q, start, NLM_PAGE, ms => ctx?.pauseMs === 0 ? Promise.resolve() : sleep(ctx?.pauseMs ?? ms));
      if (!r.ok) return failed(r.error);
      const books: NormalisedBook[] = [];
      for (const rec of r.records) { const b = normaliseNlmRecord(cfg.provider, rec); if (b) books.push(b); }
      const consumed = start + r.ids.length;
      // esearch cannot page past 9,999 results; a department's search ends there, and the next department starts.
      const more = r.ids.length >= NLM_PAGE && consumed < r.total && consumed < 9_900;
      const next = more ? `${q}|${consumed}` : q + 1 < NLM_QUERIES.length ? `${q + 1}|0` : null;
      return { books, count: r.ids.length, deleted: 0, unusable: r.ids.length - books.length, next, total: r.total, error: null };
    }
    case 'pressbooks': {
      const page = Math.max(1, Number(token) || 1);
      const r = await fetchPressbooksPage(page);
      if (!r.ok) return failed(r);
      const items: any[] = r.json.publications;
      if (!items.length) return { books: [], count: 0, deleted: 0, unusable: 0, next: null, total: Number(r.json?.metadata?.numberOfItems) || null, error: null };
      const books: NormalisedBook[] = []; let unusable = 0;
      for (const it of items) { const b = normalisePressbooksBook(cfg.provider, it); if (b) books.push(b); else unusable++; }
      // The licence is asked of each book's own site — only for books we do not already hold, a few per batch, politely.
      if (ctx) {
        const held = await findHeldBooks(books, ctx.db);
        let left = PRESSBOOKS_LICENCE_CHECKS_PER_BATCH();
        for (let i = 0; i < books.length && left > 0; i++) {
          if (held.get(i)) continue;
          left--;
          applyPressbooksLicence(books[i], await checkPressbooksLicence(books[i].landingUrl!));
          if (ctx.pauseMs !== 0) await sleep(ctx.pauseMs ?? 300);
        }
      }
      const hasNext = (Array.isArray(r.json.links) ? r.json.links : []).some((l: any) => l?.rel === 'next');
      return { books, count: items.length, deleted: 0, unusable, next: hasNext ? String(page + 1) : null, total: Number(r.json?.metadata?.numberOfItems) || null, error: null };
    }
    case 'olbulk': {
      let pos = { l: 0, i: null as string | null };
      try { if (token) { const t = JSON.parse(token); pos = { l: Math.max(0, Number(t.l) || 0), i: typeof t.i === 'string' ? t.i : null }; } } catch { /* a position we cannot read starts again */ }
      let src: DumpSource;
      try {
        src = await loadDumpSource(ctx!.db);
        const b = await dumpReaderFor(src).batch(pos.l, { identity: pos.i, maxCandidates: 300, maxLines: 100_000 });
        const filtered = b.read - b.candidates.length;
        return {
          books: b.candidates, count: b.read, deleted: 0, unusable: 0, filtered, filterReasons: b.rejects,
          next: b.next === null ? null : JSON.stringify({ l: b.next, i: b.identity }), total: null, error: null,
        };
      } catch (e: any) { return { failed: `Open Library dump could not be read: ${String(e?.message || e).slice(0, 160)}` }; }
    }
  }
  return null;
}
