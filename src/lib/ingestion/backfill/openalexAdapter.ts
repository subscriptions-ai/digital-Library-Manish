import { ingestionDb as db } from '../db.js';
import { normaliseDoi } from '../dedup.js';
import type { Candidate } from '../importService.js';
import { judgeArticles, applyArticles, type ArticleItem } from './articleCommon.js';
import { acquireReader, releaseReader, closeReaders, locate, projectWork, snapshotRoot, type OaWork } from './openalexSnapshot.js';
import { BackfillError, BackfillStop, type BackfillAdapter, type JobView, type Judged } from './types.js';

/**
 * OpenAlex historical metadata from a STAGED snapshot, as a backfill adapter for ARTICLES (the one path whose catalogue model is proven). Read docs/openalex-snapshot-audit-2026-10.md.
 *
 * Being in OpenAlex is never a reason to publish. A Work is relevant only if it is a journal article that is open access, inside the job's window, in a journal WE ALREADY HOLD as Accepted
 * with a DOAJ rights declaration (the continuous engine's rule for articles; a backfill never creates a journal). It then goes through the same normalisation, duplicate detection,
 * rights/licence judge, department (its journal's), publish/review gate and writer as every other article. A licence is taken only from best_oa_location.license.
 *
 * Checkpoint (BackfillJob.cursor): {"v":1,"id":<snapshot identity>,"f":<file index>,"n":<lines consumed in that file>}. It is the job's own; the continuous OpenAlex checkpoint
 * (Journal.fetchCursor) is never read or written. If the staged snapshot is not the one the cursor names, the job stops (OPENALEX_SNAPSHOT_CHANGED) and keeps its cursor.
 */

type Cursor = { v: 1; id: string; f: number; n: number };
const cursorOf = (c: Cursor) => JSON.stringify(c);
function parseCursor(s: string): Cursor {
  try { const c = JSON.parse(s); if (c?.v === 1 && typeof c.id === 'string' && Number.isInteger(c.f) && Number.isInteger(c.n) && c.f >= 0 && c.n >= 0) return c; } catch { /* below */ }
  throw new BackfillStop('OPENALEX_BAD_CURSOR', 'The saved checkpoint is not an OpenAlex snapshot checkpoint.');
}

type JMap = Map<string, NonNullable<OaWork['journal']>>;
let jcache: { key: string; at: number; map: JMap } | null = null;
/** The journals a backfill may add articles to: Accepted, DOAJ-declared, and in existence when the job was created (so a page does not depend on what was added later). */
async function acceptedJournals(createdAt: Date): Promise<JMap> {
  const key = createdAt.toISOString();
  if (jcache && jcache.key === key && Date.now() - jcache.at < 60_000) return jcache.map;
  const rows: any[] = await db.journal.findMany({
    where: { status: 'Accepted', rightsBasis: 'DOAJ declaration', issn: { not: null }, createdAt: { lte: createdAt } },
    select: { id: true, issn: true, eissn: true, title: true, publisherName: true, domain: true },
  });
  const map: JMap = new Map();
  for (const r of rows) { const j = { id: r.id, issn: r.issn, title: r.title, publisherName: r.publisherName ?? null, domain: r.domain ?? null }; for (const k of [r.issn, r.eissn]) if (k) map.set(String(k).replace(/[^0-9Xx]/g, '').toUpperCase(), j); }
  jcache = { key, at: Date.now(), map };
  return map;
}
export const __clearJournalCache = () => { jcache = null; };
const issnKey = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase();

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const inWindow = (w: OaWork, from: string | null, to: string | null) => {
  if (!from && !to) return true;
  const d = w.date ?? (w.year ? `${w.year}-06-30` : null);          // no date at all: it cannot be placed in a window
  if (!d) return false;
  return (!from || d >= from) && (!to || d <= to);
};

export const openalexAdapter: BackfillAdapter<OaWork, ArticleItem & { work: OaWork }> = {
  id: 'openalex', label: 'OpenAlex snapshot (staged)', contentTypes: ['ARTICLE'],
  lock: 'OpenAlex',                      // the continuous engine's own lock for OpenAlex: the two never work the provider at the same moment
  params: [
    { key: 'path', label: 'Snapshot folder', type: 'text', placeholder: 'e.g. openalex-2026-10-14', help: 'A folder inside the staged snapshot folder on the server. Nothing is downloaded by the app.' },
    { key: 'verifyFiles', label: 'Check that a free full-text file really opens before offering it', type: 'boolean', default: true, help: 'The engine\'s own check. When off, nothing is offered as a file: records are catalogued as links only.' },
  ],
  available: () => (snapshotRoot() ? true : 'no staged OpenAlex snapshot is available here (OPENALEX_SNAPSHOT_DIR is not set)'),
  stableId: w => w.id,

  async sourceIdentity(a) { return locate(a?.path).identity; },
  async describe(a) {
    const s = locate(a?.path);
    return {
      summary: `${s.release ? `Release ${s.release}` : 'No manifest (release unknown)'} · ${s.files.length} part file${s.files.length === 1 ? '' : 's'} · ${s.manifestRecords != null ? `${s.manifestRecords.toLocaleString('en-US')} works` : 'works not counted'} · ${(s.bytes / 1048576).toFixed(1)} MB`,
      details: { release: s.release ?? 'none', files: s.files.length, bytes: s.bytes, identity: s.identity, manifest: s.hasManifest ? 'present' : 'absent' },
    };
  },

  async fetchPage(job: JobView, cursor, limit) {
    // The path was validated when the job was created, so a failure to read the snapshot now means it has changed or been removed since: stop, do not retry.
    let snap; try { snap = locate(job.adapter.path); } catch (e: any) { if (e instanceof BackfillError) throw new BackfillStop('OPENALEX_SNAPSHOT_CHANGED', `The staged snapshot can no longer be used as it was: ${e.message} The checkpoint was kept.`); throw e; }
    if (!cursor && job.identity && job.identity !== snap.identity) throw new BackfillStop('OPENALEX_SNAPSHOT_CHANGED', `The staged snapshot is not the one this job was created against (was ${job.identity}, now ${snap.identity}).`);
    const cur: Cursor = cursor ? parseCursor(cursor) : { v: 1, id: snap.identity, f: 0, n: 0 };
    if (cur.id !== snap.identity) throw new BackfillStop('OPENALEX_SNAPSHOT_CHANGED', `The staged snapshot changed while this job was paused (checkpoint was taken on ${cur.id}, the staged one is ${snap.identity}). The checkpoint was kept; start a new job (with a new preview) against the new snapshot.`);
    if (cur.f > snap.files.length) throw new BackfillStop('OPENALEX_BAD_CURSOR', 'The saved checkpoint points past the last file.');

    const journals = await acceptedJournals(job.createdAt);
    const from = day(job.windowStart), to = day(job.windowEnd);
    const scope = job.departments.length ? new Set(job.departments) : null;
    const records: OaWork[] = []; const meta = { scanned: 0, notRelevant: 0, tooLong: 0, unparseable: 0 };
    let bytes = 0, f = cur.f, n = cur.n;

    while (records.length < limit && f < snap.files.length) {
      const reader = await acquireReader(snap.files[f].abs, n);
      let eof = false;
      while (records.length < limit) {
        const line = await reader.next();
        if (!line) { eof = true; break; }
        n = reader.line; meta.scanned++; bytes += line.bytes;
        if (line.text === null) { meta.tooLong++; continue; }
        if (!line.text.trim()) continue;
        let w: any; try { w = JSON.parse(line.text); } catch { meta.unparseable++; continue; }
        const p = projectWork(w);
        if (!p || p.type !== 'article' || p.paratext || p.sourceType !== 'journal' || !p.isOa || !p.title || !inWindow(p, from, to)) { meta.notRelevant++; continue; }
        const j = p.issns.map(i => journals.get(issnKey(i))).find(Boolean);
        if (!j || (scope && !scope.has(j.domain ?? ''))) { meta.notRelevant++; continue; }
        p.journal = j; records.push(p);
      }
      if (eof) { reader.close(); f++; n = 0; }
      else releaseReader(reader);
    }
    if (f >= snap.files.length) closeReaders();
    return { records, nextCursor: f >= snap.files.length ? null : cursorOf({ v: 1, id: snap.identity, f, n }), bytes, meta };
  },

  normalize(w) {
    if (!w.id || !w.title || !w.journal) return { error: 'no title or journal' };
    const candidate: Candidate = {
      source: 'OpenAlex', sourceRecordId: w.id, title: w.title, authors: w.authors, doi: normaliseDoi(w.doi), pdfUrl: w.pdfUrl,
      journalName: w.journal.title, issn: w.journal.issn, publisherName: w.journal.publisherName ?? w.hostOrg, volume: w.volume, issue: w.issue, year: w.year,
      subject: w.subject, openAccess: true, licence: w.licence, department: w.journal.domain ?? '',
    };
    return { candidate, work: w };
  },

  async judge(items, job) {
    // A retracted work is relevant but is never catalogued: refused, with the reason.
    const keep = items.filter(i => !i.item.work.retracted);
    const judged = keep.length ? await judgeArticles(keep, job, { verifyFiles: job.adapter.verifyFiles !== false }) : [];
    const byId = new Map(judged.map(j => [j.id, j]));
    return items.map((i): Judged<any> => (i.item.work.retracted ? { id: i.id, item: i.item, outcome: 'refused', reason: 'retracted work' } : byId.get(i.id)!));
  },

  apply: (write, enrich, job) => applyArticles(write, enrich, job),
};
