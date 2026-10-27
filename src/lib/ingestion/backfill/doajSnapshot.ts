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
 * (the file is read and hashed again), so a file replaced or edited while a job is paused or running stops the job (DOAJ_SNAPSHOT_CHANGED) instead of continuing on other data.
 *
 * Checkpoint (BackfillJob.cursor): {"v":1,"id":<identity>,"i":<row index>,"o":<character offset of that row in the file>}. The file is immutable, so a position is exact and a page can
 * be read again bit for bit; a page is parsed from its offset only, so memory does not grow with the file.
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

export type Loaded = { identity: string; name: string; date: string; size: number; sha256: string; text: string };
/** Read the whole staged file, hash it, and give its identity. Read again on every page, so a changed file cannot be missed. */
export function loadSnapshot(abs: string): Loaded {
  const buf = fs.readFileSync(abs); const name = path.basename(abs); const m = SNAPSHOT_NAME.exec(name)!;
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const identity = createHash('sha256').update(`doaj-csv|${name}|${buf.length}|${sha256}`).digest('hex').slice(0, 24);
  return { identity, name, date: `${m[1]}-${m[2]}-${m[3]}`, size: buf.length, sha256, text: buf.toString('utf8') };
}

/** The header (field names) of a CSV text. */
export function headerOf(text: string): string[] {
  const r = Papa.parse<string[]>(text, { header: false, preview: 1 });
  return (r.data[0] ?? []).map(String);
}

/**
 * `limit` rows starting at character `offset` (0 = the first data row). Rows come back keyed by the header. `next` is the offset of the following row, or null when the file ends.
 * Parsed from the offset only; a quoted field with a line break inside it does not disturb the position (the position is always the start of a row).
 */
export function readRows(text: string, offset: number, limit: number, fields: string[]): { rows: Record<string, string>[]; next: number | null; chars: number } {
  const first = offset === 0;
  // The parser is handed a WINDOW of the text, not the rest of the file (a page of 250 rows is ~300 KB; the window starts at 1 MB and doubles if a row is cut off by its end), so a page costs
  // memory in proportion to the page, not to the file.
  let size = Math.max(1 << 20, limit * 8192);
  for (;;) {
    const atEnd = offset + size >= text.length;
    const win = text.slice(offset, offset + size);
    const r = Papa.parse<any>(win, { header: first, preview: limit, skipEmptyLines: true });
    const rows: Record<string, string>[] = first ? (r.data as Record<string, string>[]) : (r.data as string[][]).map(a => Object.fromEntries(fields.map((f, i) => [f, a[i] ?? ''])));
    const cursor = r.meta.cursor ?? 0;
    // complete: a full page that ended before the window did, or the window reached the end of the file
    if (!((rows.length >= limit && cursor < win.length) || atEnd)) { size *= 2; continue; }
    const consumed = offset + cursor;
    const end = rows.length < limit || text.slice(consumed, consumed + 64).trim() === '';
    return { rows, next: end ? null : consumed, chars: consumed - offset };
  }
}

let cached: { id: string; idx: FileIndex } | null = null;
/**
 * Which rows of the whole file carry each ISSN (the file-wide fact that an ISSN is shared, or that one held journal is touched by two rows). Built once per snapshot per process by one
 * streaming pass that keeps nothing but the index.
 */
export function fileIndexOf(l: Loaded): FileIndex {
  if (cached?.id === l.identity) return cached.idx;
  const idx = newFileIndex(); let i = 0;
  Papa.parse<Record<string, string>>(l.text, {
    header: true, skipEmptyLines: true,
    step: (res: any) => {
      const row = res.data as Record<string, string>; const issns = [issnOf(row['Journal ISSN (print version)']), issnOf(row['Journal EISSN (online version)'])].filter(Boolean) as string[];
      idx.rows++; for (const k of issns) { const a = idx.rowsByIssn.get(k); a ? a.push(i) : idx.rowsByIssn.set(k, [i]); } i++;
    },
  } as any);
  cached = { id: l.identity, idx };
  return idx;
}
/** The index already built for this snapshot in this process (the page that was just read built it), or null. */
export const cachedIndex = (identity: string | null): FileIndex | null => (cached && identity && cached.id === identity ? cached.idx : null);
export const __clearSnapshotCache = () => { cached = null; };

export type Cursor = { v: 1; id: string; i: number; o: number };
export const cursorOf = (c: Cursor) => JSON.stringify(c);
export function parseCursor(s: string): Cursor {
  try { const c = JSON.parse(s); if (c?.v === 1 && typeof c.id === 'string' && Number.isInteger(c.i) && c.i >= 0 && Number.isInteger(c.o) && c.o >= 0) return c; } catch { /* below */ }
  throw new BackfillStop('DOAJ_BAD_CURSOR', 'The saved checkpoint is not a DOAJ snapshot checkpoint.');
}
