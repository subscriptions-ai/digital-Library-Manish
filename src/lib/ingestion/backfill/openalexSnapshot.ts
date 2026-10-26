import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { BackfillError } from './types.js';
import { normaliseIssn } from '../../ingestionWorker.js';

/**
 * Reading a STAGED OpenAlex snapshot (see docs/openalex-snapshot-audit-2026-10.md). Nothing here downloads anything: an operator stages files (for example with
 * `aws s3 sync --no-sign-request`) under OPENALEX_SNAPSHOT_DIR and a job names a folder inside it.
 *
 *   layout     <root>/<folder>/data/jsonl/works/updated_date=YYYY-MM-DD/part_NNNN.gz   (+ manifest.json), also accepted: <folder>/works, <folder> itself, or one .gz/.jsonl file
 *   identity   a short hash of the manifest's release date and totals plus every staged part file's relative path and size. It changes if the release, the file set or any file changes.
 *   reader     streams gunzip → lines with a bounded buffer. A line longer than MAX_LINE_BYTES is counted and discarded, never held in memory.
 *   position   (file index, lines consumed): a gzip file cannot be entered in the middle, so a cold start decompresses and discards the lines already consumed; within one process the open
 *              reader is reused for the next page, so ordinary progress never re-skips.
 */

export const MAX_LINE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 20_000;
const FILE_RE = /\.(gz|jsonl|ndjson)$/i;

export const snapshotRoot = (): string | null => {
  const v = process.env.OPENALEX_SNAPSHOT_DIR;
  if (!v) return null;
  try { const r = fs.realpathSync(path.resolve(v)); return fs.statSync(r).isDirectory() ? r : null; } catch { return null; }
};

export type SnapFile = { rel: string; abs: string; size: number };
export type Snapshot = { root: string; dir: string; files: SnapFile[]; release: string | null; manifestRecords: number | null; bytes: number; identity: string; hasManifest: boolean };

function walk(dir: string, base: string, depth: number, out: SnapFile[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4) walk(abs, base, depth + 1, out); }
    else if (e.isFile() && FILE_RE.test(e.name) && !/deleted_ids|manifest/i.test(e.name)) {
      out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs, size: fs.statSync(abs).size });
      if (out.length > MAX_FILES) throw new BackfillError('SNAPSHOT_TOO_MANY_FILES', `More than ${MAX_FILES} files under that folder; name a narrower one.`);
    }
  }
}

/** Find the staged snapshot a job names and work out its identity. Throws BackfillError for anything that cannot be used safely; reads file sizes and the manifest only. */
export function locate(adapterPath: unknown): Snapshot {
  const root = snapshotRoot();
  if (!root) throw new BackfillError('NO_SNAPSHOT_ROOT', 'No staged OpenAlex snapshot is available here (OPENALEX_SNAPSHOT_DIR is not set).');
  const rel = String(adapterPath ?? '').trim();
  if (rel.includes('\0') || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new BackfillError('BAD_SNAPSHOT_PATH', 'The snapshot folder must be inside the staged folder (no absolute paths, no "..").');
  let target: string;
  try { target = fs.realpathSync(path.resolve(root, rel)); } catch { throw new BackfillError('SNAPSHOT_NOT_FOUND', 'That snapshot folder does not exist in the staged folder.'); }
  if (target !== root && !target.startsWith(root + path.sep)) throw new BackfillError('BAD_SNAPSHOT_PATH', 'The snapshot folder resolves outside the staged folder.');

  const st = fs.statSync(target);
  let dir = st.isDirectory() ? target : path.dirname(target);
  let files: SnapFile[] = [];
  if (st.isFile()) {
    if (!FILE_RE.test(target)) throw new BackfillError('BAD_SNAPSHOT_PATH', 'That file is not a .gz / .jsonl file.');
    files = [{ rel: path.basename(target), abs: target, size: st.size }];
  } else {
    for (const c of ['data/jsonl/works', 'jsonl/works', 'works']) { const d = path.join(target, c); if (fs.existsSync(d) && fs.statSync(d).isDirectory()) { dir = d; break; } }
    walk(dir, dir, 0, files);
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  if (!files.length) throw new BackfillError('SNAPSHOT_EMPTY', 'No .gz / .jsonl part files were found in that folder.');

  // The manifest, when there is one: the release date, and a size for every file it lists. A staged file whose size is not the manifest's is a partial or damaged copy.
  let release: string | null = null, manifestRecords: number | null = null, manifestBytes: number | null = null;
  const mf = path.join(dir, 'manifest.json'); const hasManifest = fs.existsSync(mf);
  if (hasManifest) {
    if (fs.statSync(mf).size > 50 * 1024 * 1024) throw new BackfillError('BAD_MANIFEST', 'The manifest is unexpectedly large.');
    let m: any; try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { throw new BackfillError('BAD_MANIFEST', 'manifest.json could not be read.'); }
    release = typeof m?.date === 'string' ? m.date : null; manifestRecords = Number.isFinite(m?.record_count) ? m.record_count : null; manifestBytes = Number.isFinite(m?.content_length) ? m.content_length : null;
    const bySuffix = new Map<string, any>();
    for (const e of Array.isArray(m?.files) ? m.files : []) { const mm = /(updated_date=[^/]+\/[^/]+)$/.exec(String(e?.url ?? '')); if (mm) bySuffix.set(mm[1], e.meta); }
    for (const f of files) {
      const mm = /(updated_date=[^/]+\/[^/]+)$/.exec(f.rel); const meta = mm ? bySuffix.get(mm[1]) : null;
      if (meta && Number.isFinite(meta.content_length) && meta.content_length !== f.size) throw new BackfillError('SNAPSHOT_INCOMPLETE', `${f.rel} is ${f.size} bytes but the manifest says ${meta.content_length}: a partial or damaged copy.`);
    }
    if (files.some(f => !/updated_date=[^/]+\/[^/]+$/.test(f.rel) ? false : !bySuffix.has(/(updated_date=[^/]+\/[^/]+)$/.exec(f.rel)![1]))) throw new BackfillError('SNAPSHOT_FILE_NOT_IN_MANIFEST', 'A staged part file is not listed in manifest.json (a different release is mixed in).');
  }
  const h = createHash('sha256').update(`${release ?? 'nomanifest'}|${manifestRecords ?? ''}|${manifestBytes ?? ''}\n`);
  for (const f of files) h.update(`${f.rel}\t${f.size}\n`);
  return { root, dir, files, release, manifestRecords, bytes: files.reduce((n, f) => n + f.size, 0), identity: h.digest('hex').slice(0, 24), hasManifest };
}

// ── The reader ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type Line = { text: string | null; bytes: number };       // text null: the line was longer than MAX_LINE_BYTES and was discarded

async function* linesOf(readable: AsyncIterable<Buffer>): AsyncGenerator<Line> {
  let parts: Buffer[] = []; let len = 0; let dropping = false; let dropped = 0;
  for await (const chunk of readable) {
    let start = 0;
    for (;;) {
      const nl = chunk.indexOf(0x0a, start);
      const end = nl < 0 ? chunk.length : nl;
      const seg = chunk.subarray(start, end);
      if (dropping) dropped += seg.length;
      else if (len + seg.length > MAX_LINE_BYTES) { dropping = true; dropped = len + seg.length; parts = []; len = 0; }
      else if (seg.length) { parts.push(seg); len += seg.length; }
      if (nl < 0) break;
      if (dropping) { yield { text: null, bytes: dropped + 1 }; dropping = false; dropped = 0; }
      else { const b = parts.length === 1 ? parts[0] : Buffer.concat(parts, len); yield { text: b.toString('utf8').replace(/\r$/, ''), bytes: len + 1 }; parts = []; len = 0; }
      start = nl + 1;
    }
  }
  if (dropping) yield { text: null, bytes: dropped };
  else if (len) yield { text: Buffer.concat(parts, len).toString('utf8').replace(/\r$/, ''), bytes: len };
}

export class SnapshotReader {
  line = 0;                                     // lines consumed so far in this file
  private it: AsyncGenerator<Line>; private src: fs.ReadStream; private gz: zlib.Gunzip | null;
  constructor(public readonly abs: string) {
    this.src = fs.createReadStream(abs, { highWaterMark: 256 * 1024 });
    this.gz = /\.gz$/i.test(abs) ? zlib.createGunzip() : null;
    const readable: any = this.gz ? this.src.pipe(this.gz) : this.src;
    this.src.on('error', e => readable.destroy(e));
    this.it = linesOf(readable);
  }
  async next(): Promise<Line | null> { const r = await this.it.next(); if (r.done) return null; this.line++; return r.value; }
  async skip(n: number) { while (this.line < n) { if (!(await this.next())) return; } }
  close() { try { this.it.return(undefined as any); } catch { /* closing */ } this.gz?.destroy(); this.src.destroy(); }
}

let cache: { r: SnapshotReader; timer: NodeJS.Timeout } | null = null;
export function closeReaders() { if (cache) { clearTimeout(cache.timer); cache.r.close(); cache = null; } }

/** The reader for `abs` positioned after `line` lines: the open one if it is already there, else a fresh one that skips. At most one stays open, and only briefly. */
export async function acquireReader(abs: string, line: number): Promise<SnapshotReader> {
  if (cache && cache.r.abs === abs && cache.r.line === line) { clearTimeout(cache.timer); const r = cache.r; cache = null; return r; }
  closeReaders();
  const r = new SnapshotReader(abs);
  await r.skip(line);
  return r;
}
export function releaseReader(r: SnapshotReader) {
  closeReaders();
  const timer = setTimeout(() => { if (cache?.r === r) closeReaders(); }, 20_000); timer.unref?.();
  cache = { r, timer };
}

// ── What a Work becomes ─────────────────────────────────────────────────────────────────────────────────────────────

export type OaWork = {
  id: string; doi: string | null; title: string | null; year: number | null; date: string | null; type: string | null;
  retracted: boolean; paratext: boolean; isOa: boolean; licence: string | null; pdfUrl: string | null;
  volume: string | null; issue: string | null; authors: string | null; subject: string | null; sourceType: string | null; issns: string[]; hostOrg: string | null; updated: string | null;
  /** Filled in by the adapter: the journal we hold that this work belongs to. */
  journal?: { id: string; issn: string; title: string; publisherName: string | null; domain: string | null };
};

/** Only what the pipeline needs, so a page of 100 works stays small whatever the size of the original lines (abstracts, reference lists). */
export function projectWork(w: any): OaWork | null {
  if (!w || typeof w.id !== 'string') return null;
  const loc = w.primary_location ?? {}, src = loc.source ?? {}, best = w.best_oa_location ?? {};
  const issns = [...new Set([src.issn_l, ...(Array.isArray(src.issn) ? src.issn : [])].map((x: any) => normaliseIssn(x)).filter(Boolean) as string[])];
  const names: string[] = (Array.isArray(w.authorships) ? w.authorships : []).map((a: any) => a?.author?.display_name).filter(Boolean);
  const num = (v: any) => (Number.isInteger(v) ? v : null);
  return {
    id: w.id, doi: typeof w.doi === 'string' ? w.doi : null, title: String(w.title ?? w.display_name ?? '').trim() || null, year: num(w.publication_year),
    date: typeof w.publication_date === 'string' ? w.publication_date : null, type: typeof w.type === 'string' ? w.type : null,
    retracted: w.is_retracted === true, paratext: w.is_paratext === true, isOa: w.open_access?.is_oa === true,
    licence: typeof best.license === 'string' && best.license ? best.license : null,
    pdfUrl: (typeof best.pdf_url === 'string' && best.pdf_url) || (typeof w.open_access?.oa_url === 'string' && w.open_access.oa_url) || null,
    volume: w.biblio?.volume != null ? String(w.biblio.volume) : null, issue: w.biblio?.issue != null ? String(w.biblio.issue) : null,
    authors: names.length ? names.slice(0, 30).join(', ') + (names.length > 30 ? ' et al.' : '') : null,
    subject: w.primary_topic?.field?.display_name || (Array.isArray(w.concepts) ? w.concepts[0]?.display_name : null) || null,
    sourceType: typeof src.type === 'string' ? src.type : null, issns, hostOrg: typeof src.host_organization_name === 'string' ? src.host_organization_name : null,
    updated: typeof w.updated_date === 'string' ? w.updated_date : null,
  };
}
