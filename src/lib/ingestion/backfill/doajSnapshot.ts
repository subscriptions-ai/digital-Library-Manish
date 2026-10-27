import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { SNAPSHOT_NAME, issnOf, newFileIndex, type FileIndex } from '../doajEnrichment.js';
import { BackfillError, BackfillStop } from './types.js';

/**
 * The staged DOAJ CSV snapshot: where it is, what it is, and how to read a page of it. STAGED FILE ONLY — nothing here (or anywhere in the DOAJ enrichment job) contacts DOAJ; an
 * operator puts the official dated file (`doaj_journalcsv_YYYYMMDD_HHMM_utf8.csv`, the one https://doaj.org/csv redirects to) in the folder named by DOAJ_SNAPSHOT_DIR.
 *
 *   BACKFILL_DOAJ_ENABLED   must be "true"/"1" for the adapter to be available at all (deployment-time). Default off.
 *   DOAJ_SNAPSHOT_DIR       the folder the staged file is in. Default: none (the adapter is unavailable).
 *
 * Identity of a snapshot = its official file name (which carries DOAJ's date), its size and its sha-256. It is recorded on the job, put in every checkpoint, and re-checked on EVERY page
 * (the whole file is hashed again, STREAMED through one 1 MB buffer — nothing of the file is kept), so a file replaced or edited while a job is paused or running stops the job
 * (DOAJ_SNAPSHOT_CHANGED) instead of continuing on other data. Memory therefore does not depend on the size of the file: a page is read as a bounded WINDOW of bytes at a byte offset.
 *
 * Checkpoint (BackfillJob.cursor): {"v":2,"id":<identity>,"i":<row index>,"o":<BYTE offset of that row in the file>}. The file is immutable, so a position is exact and a page can
 * be read again bit for bit. (v1 held a character offset and needed the whole file decoded in memory; it is refused, not guessed at: the job stops and a new one is started.)
 */

export const doajBackfillEnabled = () => ['true', '1'].includes(String(process.env.BACKFILL_DOAJ_ENABLED ?? '').toLowerCase());
export const doajSnapshotDir = () => { const d = process.env.DOAJ_SNAPSHOT_DIR; return d ? path.resolve(d) : null; };
const MAX_BYTES = 64 * 1024 * 1024;           // today's file is ~26 MB; a file this large is refused rather than read

export function listSnapshots(): string[] {
  const dir = doajSnapshotDir(); if (!dir) return [];
  try { return fs.readdirSync(dir).filter(n => SNAPSHOT_NAME.test(n)).sort().reverse(); } catch { return []; }
}

/** The staged file this job reads: the one asked for, else the newest. Confined to the staged folder; a symlink out of it, a wrong name or an empty file is refused. */
export function locateSnapshot(file?: unknown): { abs: string; name: string; date: string } {
  const dir = doajSnapshotDir();
  if (!dir || !fs.existsSync(dir)) throw new BackfillError('SNAPSHOT_DIR_MISSING', 'No staged DOAJ snapshot folder is configured here (DOAJ_SNAPSHOT_DIR).');
  const asked = file == null || file === '' ? null : String(file);
  if (asked !== null && (asked.includes('/') || asked.includes('\\') || asked.includes('\0') || asked.includes('..'))) throw new BackfillError('BAD_SNAPSHOT_PATH', 'Name the staged file by its file name only.');
  const name = asked ?? listSnapshots()[0];
  if (!name) throw new BackfillError('SNAPSHOT_NOT_FOUND', 'No staged DOAJ file (doaj_journalcsv_YYYYMMDD_HHMM_utf8.csv) is in the staged folder.');
  const m = SNAPSHOT_NAME.exec(name);
  if (!m) throw new BackfillError('BAD_SNAPSHOT_NAME', 'The staged file must keep DOAJ\'s own name (doaj_journalcsv_YYYYMMDD_HHMM_utf8.csv): the date in the name is part of what the job records.');
  const abs = path.join(dir, name);
  let real: string; try { real = fs.realpathSync(abs); } catch { throw new BackfillError('SNAPSHOT_NOT_FOUND', `${name} is not in the staged folder.`); }
  const realDir = fs.realpathSync(dir);
  if (real !== path.join(realDir, name)) throw new BackfillError('BAD_SNAPSHOT_PATH', 'The staged file resolves outside the staged folder.');
  const st = fs.statSync(real);
  if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) throw new BackfillError('BAD_SNAPSHOT_FILE', `${name} is not a usable file (empty, too large, or not a regular file).`);
  return { abs: real, name, date: `${m[1]}-${m[2]}-${m[3]}` };
}

export type Loaded = { abs: string; identity: string; name: string; date: string; size: number; sha256: string };
const HASH_BUF = 1 << 20;
/**
 * The identity of the staged file: its name, its size and its sha-256, computed by STREAMING the file through a 1 MB buffer. Called on every page, so a changed file cannot be missed; it
 * keeps no part of the file, so it costs time (a few tens of milliseconds for 25 MB), not memory.
 */
export function loadSnapshot(abs: string): Loaded {
  const name = path.basename(abs); const m = SNAPSHOT_NAME.exec(name)!;
  const h = createHash('sha256'); const buf = Buffer.allocUnsafe(HASH_BUF); let size = 0;
  const fd = fs.openSync(abs, 'r');
  try { for (;;) { const n = fs.readSync(fd, buf, 0, HASH_BUF, null); if (!n) break; h.update(n === HASH_BUF ? buf : buf.subarray(0, n)); size += n; if (size > MAX_BYTES) throw new BackfillError('BAD_SNAPSHOT_FILE', `${name} is too large to use.`); } } finally { fs.closeSync(fd); }
  const sha256 = h.digest('hex');
  const identity = createHash('sha256').update(`doaj-csv|${name}|${size}|${sha256}`).digest('hex').slice(0, 24);
  return { abs, identity, name, date: `${m[1]}-${m[2]}-${m[3]}`, size, sha256 };
}

const BOM = 0xfeff;
/** Read `n` bytes at `at` (fewer at the end of the file). */
function readAt(abs: string, at: number, n: number): Buffer {
  const fd = fs.openSync(abs, 'r');
  try { const b = Buffer.allocUnsafe(n); const got = fs.readSync(fd, b, 0, n, at); return got === n ? b : b.subarray(0, got); } finally { fs.closeSync(fd); }
}

/** The header (field names) of the staged file: read from its first bytes only. */
export function headerOf(abs: string): string[] {
  const text = readAt(abs, 0, 1 << 18).toString('utf8').replace(/^﻿/, '');
  const r = Papa.parse<string[]>(text, { header: false, preview: 1 });
  return (r.data[0] ?? []).map(String);
}

/**
 * `limit` rows starting at BYTE offset `offset` (0 = the first data row), keyed by the header. `next` is the byte offset of the following row, or null when the file ends. Only a WINDOW of the
 * file is read and decoded (a page of 250 rows is ~300 KB; the window starts at 1 MB and doubles if a row is cut off by its end), so a page costs memory in proportion to the page, not
 * to the file. A quoted field with a line break inside it does not disturb the position (the position is always the start of a row), and a multi-byte character cut by the end of the
 * window sits after the last row taken, so it is never part of one.
 */
export function readRows(abs: string, size: number, offset: number, limit: number, fields: string[]): { rows: Record<string, string>[]; next: number | null; bytes: number } {
  const first = offset === 0;
  let win = Math.max(1 << 20, limit * 8192);
  for (;;) {
    const buf = readAt(abs, offset, win); const atEnd = offset + buf.length >= size;
    let text = buf.toString('utf8'); let skip = 0;
    if (text.charCodeAt(0) === BOM) { text = text.slice(1); skip = 3; }
    const r = Papa.parse<any>(text, { header: first, preview: limit, skipEmptyLines: true });
    const rows: Record<string, string>[] = first ? (r.data as Record<string, string>[]) : (r.data as string[][]).map(a => Object.fromEntries(fields.map((f, i) => [f, a[i] ?? ''])));
    const cursor = r.meta.cursor ?? 0;
    // complete: a full page that ended before the window did, or the window reached the end of the file
    if (!((rows.length >= limit && cursor < text.length) || atEnd)) { win *= 2; continue; }
    const used = skip + Buffer.byteLength(text.slice(0, cursor), 'utf8'); const consumed = offset + used;
    const end = rows.length < limit || text.slice(cursor, cursor + 64).trim() === '' && atEnd || consumed >= size;
    return { rows, next: end ? null : consumed, bytes: used };
  }
}

type Cached = { id: string; idx: FileIndex; timer: NodeJS.Timeout };
let cached: Cached | null = null;
const KEEP_MS = 120_000;
/**
 * Which rows of the whole file carry each ISSN (the file-wide fact that an ISSN is shared, or that one held journal is touched by two rows). Built once per snapshot per process by reading
 * the file in bounded pages and keeping nothing but the index (a few MB); the index is dropped after two idle minutes, so a server with no DOAJ job holds nothing.
 */
export async function fileIndexOf(l: Loaded): Promise<FileIndex> {
  if (cached?.id === l.identity) { cached.timer.refresh(); return cached.idx; }
  const idx = newFileIndex(); const fields = headerOf(l.abs); let i = 0, off = 0;
  for (;;) {
    const { rows, next } = readRows(l.abs, l.size, off, 1000, fields);
    for (const row of rows) { const issns = [issnOf(row['Journal ISSN (print version)']), issnOf(row['Journal EISSN (online version)'])].filter(Boolean) as string[]; idx.rows++; for (const k of issns) { const a = idx.rowsByIssn.get(k); a ? a.push(i) : idx.rowsByIssn.set(k, [i]); } i++; }
    if (next === null) break; off = next;
    await new Promise<void>(r => setImmediate(r));          // let the event loop breathe between pages
  }
  if (cached) clearTimeout(cached.timer);
  const timer = setTimeout(() => { if (cached?.id === l.identity) cached = null; }, KEEP_MS); timer.unref();
  cached = { id: l.identity, idx, timer };
  return idx;
}
/** The index already built for this snapshot in this process (the page that was just read built it), or null. */
export const cachedIndex = (identity: string | null): FileIndex | null => (cached && identity && cached.id === identity ? cached.idx : null);
export const __clearSnapshotCache = () => { if (cached) clearTimeout(cached.timer); cached = null; };

export type Cursor = { v: 2; id: string; i: number; o: number };
export const cursorOf = (c: Cursor) => JSON.stringify(c);
export function parseCursor(s: string): Cursor {
  try { const c = JSON.parse(s); if (c?.v === 2 && typeof c.id === 'string' && Number.isInteger(c.i) && c.i >= 0 && Number.isInteger(c.o) && c.o >= 0) return c; } catch { /* below */ }
  throw new BackfillStop('DOAJ_BAD_CURSOR', 'The saved checkpoint is not a DOAJ snapshot checkpoint of this version. Start a new job (with a new preview).');
}
