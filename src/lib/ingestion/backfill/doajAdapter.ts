import { ingestionDb as db } from '../db.js';
import { audit } from '../audit.js';
import { canonicalDepartmentName } from '../../departmentRegistry.js';
import * as E from '../doajEnrichment.js';
import { crashPoint } from './testHooks.js';
import { cachedIndex, doajBackfillEnabled, doajSnapshotDir, fileIndexOf, headerOf, listSnapshots, loadSnapshot, locateSnapshot, parseCursor, readRows, cursorOf } from './doajSnapshot.js';
import { BackfillError, BackfillStop, type BackfillAdapter, type JobView, type Judged, type WriteResult } from './types.js';

/**
 * DOAJ JOURNAL ENRICHMENT & VERIFICATION, as a backfill adapter. It reads the staged, dated DOAJ CSV snapshot and COMPLETES journals the catalogue already holds. It never creates a journal
 * (a row that is not held is refused, and counted), never changes status, licence, access, department or the e-ISSN, never overwrites a held value, and never touches a protected journal.
 * The rules are src/lib/ingestion/doajEnrichment.ts, the same ones the read-only audit uses; this file only judges a page against the catalogue as it is NOW and writes what it may.
 *
 * Every record is a CSV row, and ends as one of:
 *   duplicate/enriched     the held journal has EMPTY descriptive fields DOAJ completes (homepage, country, publisher, language, subject, subjects)
 *   duplicate/conflicting  a held value disagrees with DOAJ (or the ISSNs disagree, or the title casts the match in doubt): counted, nothing written for that record
 *   duplicate/unchanged    nothing to complete, or protected (ours, Rejected, decided by a person, linked to a publisher), or outside the selected departments
 *   refused                not held (never created), same title under other ISSNs, IDENTITY_CONFLICT, or ambiguous (shared ISSN, two journals, two rows)
 * Per-record facts that do not fit those counters (which fields would be filled, which conflict, why protected) are tags and reach the job's sourceStats as `t.<tag>`.
 *
 * Writing is bounded and safe to repeat: each journal is re-read, its identity re-checked, and each field is filled by ONE guarded UPDATE that says "still empty, same ISSN, not
 * protected" in the statement itself — so a field filled by someone else in the meantime, or by an earlier attempt of this very chunk, is simply skipped. One audit entry per chunk.
 */

type Raw = { i: number; raw: Record<string, string> };
type Item = { row: E.Row };
type Extra = { heldId: string; issn: string | null; fields: Partial<Record<E.Field, string | string[]>>; row: E.Row };

const COLUMN: Record<string, { col: string; json?: boolean }> = {
  homepage: { col: 'homepage' }, country: { col: 'country' }, publisherName: { col: 'publisherName' }, language: { col: 'language' }, subject: { col: 'subject' }, subjects: { col: 'subjects', json: true },
};
const HELD_COLS = `id, issn, eissn, title, "publisherName", "publisherId", country, homepage, language, subject, subjects::text as subjects, domain, status, licence, "licenceIsNC", "rightsBasis", "rightsVerifiedBy", "articleCount"`;
const clip = (v: unknown, n = 90) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

async function heldByIssns(issns: string[]): Promise<E.Held[]> {
  const out = new Map<string, E.Held>();
  for (let i = 0; i < issns.length; i += 400) {
    const rows: any[] = await db.$queryRawUnsafe(`select ${HELD_COLS} from "Journal" where issn = any($1::text[]) or eissn = any($1::text[])`, issns.slice(i, i + 400));
    for (const r of rows) out.set(r.id, E.toHeld(r));
  }
  return [...out.values()];
}
/**
 * Only when a row matched no ISSN: who holds this title? (id, ISSNs, title, publisher: nothing else is read.) The whole-table read is made ONCE PER JOB and kept for two idle minutes,
 * not once per chunk: a title-only match is only ever REPORTED (the record is refused, never written), so a map a few minutes old can change a count's label, never a write.
 */
let titleCache: { jobId: string; map: Map<string, E.Held[]>; timer: NodeJS.Timeout } | null = null;
async function heldByTitle(jobId: string): Promise<Map<string, E.Held[]>> {
  if (titleCache?.jobId === jobId) { titleCache.timer.refresh(); return titleCache.map; }
  const rows: any[] = await db.$queryRawUnsafe(`select id, issn, eissn, title, "publisherName" from "Journal"`);
  const m = new Map<string, E.Held[]>();
  for (const r of rows) { const k = E.fold(r.title); if (k) (m.get(k) ?? m.set(k, []).get(k)!).push({ ...r, subjects: [] } as E.Held); }
  if (titleCache) clearTimeout(titleCache.timer);
  const timer = setTimeout(() => { if (titleCache?.jobId === jobId) titleCache = null; }, 120_000); timer.unref();
  titleCache = { jobId, map: m, timer };
  return m;
}
export const __clearTitleCache = () => { if (titleCache) clearTimeout(titleCache.timer); titleCache = null; };

export const doajAdapter: BackfillAdapter<Raw, Item> = {
  id: 'doaj', label: 'DOAJ journal enrichment (staged CSV snapshot)', contentTypes: ['JOURNAL'], enrichOnly: true,
  lock: 'DOAJ',                      // the continuous DOAJ sweep's and the one-off import's own lock: they never run at the same time
  previewCaps: { samples: 100, issues: 100, perOutcome: 25, perIssueKind: 25 },
  gapSeconds: 1,                     // reads a local file and the database only: no provider to be polite to (the worker still waits as long as a chunk took)
  params: [{ key: 'file', label: 'Staged snapshot file (optional)', type: 'text', placeholder: 'doaj_journalcsv_YYYYMMDD_HHMM_utf8.csv', help: 'A file in the staged folder, by its official name. Blank: the newest one. Nothing is downloaded by the app.' }],
  available: () => (!doajBackfillEnabled() ? 'DOAJ enrichment is not enabled on this server (BACKFILL_DOAJ_ENABLED is not set)' : !doajSnapshotDir() ? 'no staged DOAJ snapshot folder is configured (DOAJ_SNAPSHOT_DIR)' : listSnapshots().length ? true : 'no staged DOAJ snapshot file is in the staged folder'),
  stableId: r => `r${r.i}:${[r.raw['Journal ISSN (print version)'], r.raw['Journal EISSN (online version)']].filter(Boolean).join('/')}`,

  async sourceIdentity(a) { return loadSnapshot(locateSnapshot(a?.file).abs).identity; },
  async describe(a) {
    const s = locateSnapshot(a?.file); const l = loadSnapshot(s.abs); const idx = await fileIndexOf(l);
    return { summary: `Snapshot ${l.date} (${l.name}) · ${idx.rows.toLocaleString('en-US')} journals · ${(l.size / 1048576).toFixed(1)} MB · sha-256 ${l.sha256.slice(0, 12)}…`, details: { file: l.name, date: l.date, rows: idx.rows, size: l.size, sha256: l.sha256, identity: l.identity } };
  },

  async fetchPage(job: JobView, cursor, limit) {
    // The staged file is read and hashed again on EVERY page: if it is not the file this job was created against, the job stops, its checkpoint kept.
    let l; try { l = loadSnapshot(locateSnapshot(job.adapter.file).abs); } catch (e: any) { if (e instanceof BackfillError) throw new BackfillStop('DOAJ_SNAPSHOT_CHANGED', `The staged snapshot can no longer be used as it was: ${e.message} The checkpoint was kept.`); throw e; }
    if (job.identity && job.identity !== l.identity) throw new BackfillStop('DOAJ_SNAPSHOT_CHANGED', `The staged snapshot is not the one this job was created against (was ${job.identity}, now ${l.identity}: ${l.name}). The checkpoint was kept; start a new job (with a new preview) against the new file.`);
    const cur = cursor ? parseCursor(cursor) : { v: 2 as const, id: l.identity, i: 0, o: 0 };
    if (cur.id !== l.identity) throw new BackfillStop('DOAJ_SNAPSHOT_CHANGED', 'The staged snapshot changed while this job was paused. The checkpoint was kept; start a new job (with a new preview).');
    await fileIndexOf(l);
    const { rows, next, bytes } = readRows(l.abs, l.size, cur.o, limit, headerOf(l.abs));
    const from = job.windowStart ? job.windowStart.toISOString().slice(0, 10) : null, to = job.windowEnd ? job.windowEnd.toISOString().slice(0, 10) : null;
    const meta = { scanned: rows.length, outsideWindow: 0, noDate: 0 }; const records: Raw[] = [];
    rows.forEach((raw, k) => {
      if (from || to) {
        const d = (raw['Added on Date'] || '').slice(0, 10);
        if (!d) { meta.noDate++; return; }
        if ((from && d < from) || (to && d > to)) { meta.outsideWindow++; return; }
      }
      records.push({ i: cur.i + k, raw });
    });
    return { records, nextCursor: next === null ? null : cursorOf({ v: 2, id: l.identity, i: cur.i + rows.length, o: next }), bytes, meta };
  },

  normalize(r) {
    const row = E.readRow(r.raw, r.i);
    return !row.title || !row.issns.length ? { error: 'no title or no valid ISSN' } : { row };
  },

  async judge(items, job): Promise<Judged<Item>[]> {
    const fileIdx = cachedIndex(job.identity) ?? await fileIndexOf(loadSnapshot(locateSnapshot(job.adapter.file).abs));
    const held = await heldByIssns([...new Set(items.flatMap(i => i.item.row.issns))]);
    const heldIdx = E.indexHeld(held);
    let titles: Map<string, E.Held[]> | null = null;
    const wanted = job.departments.length ? new Set(job.departments.map(d => canonicalDepartmentName(d) ?? d)) : null;
    const out: Judged<Item>[] = [];
    for (const { id, item } of items) {
      const r = item.row;
      if (!r.issns.some(k => heldIdx.byIssn.has(k)) && !titles) titles = await heldByTitle(job.id);
      const v = E.matchRow(r, { byIssn: heldIdx.byIssn, byTitle: titles ?? heldIdx.byTitle }, fileIdx);
      switch (v.kind) {
        case 'unusable': out.push({ id, item, outcome: 'refused', reason: 'no title or no valid ISSN', tags: ['unusable'] }); break;
        case 'unmatched': out.push({ id, item, outcome: 'refused', reason: 'not in the catalogue — enrichment never creates a journal', tags: ['notInCatalogue'], quiet: true }); break;
        case 'titleOnly': out.push({ id, item, outcome: 'refused', reason: `same title as ${v.held.length} held journal(s) under other ISSNs — needs a person`, tags: ['titleOnly'], group: 'same title' }); break;
        case 'identityConflict': out.push({ id, item, outcome: 'refused', reason: 'IDENTITY_CONFLICT: same title and publisher as a held journal, but different ISSNs', tags: ['identityConflict'], group: 'identity conflict' }); break;
        case 'ambiguous': out.push({ id, item, outcome: 'refused', reason: v.reason === 'sharedIssnInFile' ? 'an ISSN of this row is shared by another DOAJ row' : v.reason === 'splitAcrossHeld' ? 'this row touches two held journals' : 'the held journal is touched by several DOAJ rows', tags: ['ambiguous', `ambiguous.${v.reason}`], group: 'ambiguous' }); break;
        case 'issnDisagreement': out.push({ id, item, outcome: 'duplicate', dup: 'conflicting', reason: `ISSN disagreement: held ${[v.j.issn, v.j.eissn].filter(Boolean).join('/')} vs DOAJ ${r.issns.join('/')}`, tags: ['matched', 'conflict', 'conflict.issn'], group: 'conflict' }); break;
        case 'matched': {
          const j = v.j; const why = E.protectedReasons(j); const tags = ['matched', `relation.${v.relation}`, ...(v.crossField ? ['crossField'] : [])];
          if (why.length) { out.push({ id, item, outcome: 'duplicate', dup: 'unchanged', reason: `protected: ${why.join(', ')}`, tags: [...tags, 'protected', ...why.map(w => `protected.${w}`)], quiet: true }); break; }
          if (wanted && !wanted.has(canonicalDepartmentName(j.domain) ?? j.domain ?? '')) { out.push({ id, item, outcome: 'duplicate', dup: 'unchanged', reason: 'outside the selected departments', tags: [...tags, 'outsideDepartments'], quiet: true }); break; }
          const ev = E.evaluate(j, r); const fill = E.fillable(ev); const hard = E.hardConflicts(ev); const names = Object.keys(fill) as E.Field[];
          for (const c of ev.conflicts) tags.push(`conflict.${c.key}`);
          if (hard.length) tags.push('conflict');
          if (ev.gain.eissn) tags.push('review.eissn');
          if (ev.eissnNotStorable) tags.push('eissnNotStorable');
          if (ev.drift) tags.push(`drift.${ev.drift}`);
          if (ev.rightsEvidenceHeldLicenceEmpty) tags.push('rightsEvidence.heldLicenceEmpty');
          if (ev.conflicts.some(c => c.key === 'title') && Object.keys(ev.gain).some(f => E.AUTO_FIELDS.includes(f as E.Field))) tags.push('blockedByTitle');
          const detail = hard[0] ? `${hard[0].key}: held "${clip(hard[0].held)}" vs DOAJ "${clip(hard[0].doaj)}"` : '';
          if (names.length) out.push({ id, item, outcome: 'duplicate', dup: 'enriched', reason: `fills ${names.join(', ')}${hard.length ? ` · also differs — ${detail}` : ''}`, tags: [...tags, 'enrichable', ...names.map(n => `fill.${n}`)], ...(hard.length ? { group: 'conflict' } : {}), extra: { heldId: j.id, issn: j.issn, fields: fill, row: r } satisfies Extra });
          else if (hard.length) out.push({ id, item, outcome: 'duplicate', dup: 'conflicting', reason: detail, tags, group: 'conflict' });
          else out.push({ id, item, outcome: 'duplicate', dup: 'unchanged', tags: [...tags, 'unchanged'], quiet: true });
        }
      }
    }
    return out;
  },

  /** The only write. `write` is always empty (a journal is never created here); `enrich` are the journals a page may complete. */
  async apply(_write, enrich, job): Promise<Map<string, WriteResult>> {
    const out = new Map<string, WriteResult>(); const byField: Record<string, number> = {}; const issns: string[] = []; let written = 0, skipped = 0, n = 0;
    for (const j of enrich) {
      const x = j.extra as Extra | undefined; if (!x) continue;
      // 1. re-read the journal as it is now, and prove it is still the same, unprotected journal
      const cur: any = (await db.$queryRawUnsafe(`select ${HELD_COLS} from "Journal" where id = $1`, x.heldId))[0];
      const held = cur ? E.toHeld(cur) : null;
      const H = held ? new Set([held.issn, held.eissn].filter(Boolean) as string[]) : new Set<string>(); const C = new Set(x.row.issns);
      const sameIdentity = !!held && [...C].some(k => H.has(k)) && !([...H].some(k => !C.has(k)) && [...C].some(k => !H.has(k)));
      if (!held || !sameIdentity || E.protectedReasons(held).length) { skipped++; out.set(j.id, 'present'); continue; }
      // 2. what DOAJ's staged row would still complete, now; only fields the judge planned and that are STILL empty
      const now = E.fillable(E.evaluate(held, x.row));
      let did = 0;
      for (const f of Object.keys(now) as E.Field[]) {
        if (!(f in x.fields) || !COLUMN[f]) continue;
        const { col, json } = COLUMN[f]; const v = now[f]!;
        // 3. ONE statement that says "still empty, same ISSN, not protected, not Rejected" in itself: a field filled meanwhile (or by an earlier attempt of this chunk) updates nothing
        const empty = json ? `("${col}" is null or "${col}"::text in ('[]','null'))` : `coalesce(btrim("${col}"), '') = ''`;
        const changed = await db.$executeRawUnsafe(
          `update "Journal" set "${col}" = ${json ? '$1::jsonb' : '$1'}, "updatedAt" = now() where id = $2 and ${empty} and coalesce(issn, '') = coalesce($3, '') and status <> 'Rejected' and coalesce("rightsBasis", '') <> 'our own' and "publisherId" is null and ("rightsVerifiedBy" is null or "rightsVerifiedBy" = 'ingestion')`,
          json ? JSON.stringify(v) : String(v), held.id, held.issn);
        if (changed === 1) { did++; byField[f] = (byField[f] ?? 0) + 1; }
      }
      if (did) { written++; if (issns.length < 50 && held.issn) issns.push(held.issn); out.set(j.id, 'written'); } else { skipped++; out.set(j.id, 'present'); }
      n++; crashPoint('mid-apply', n);
    }
    if (written) await audit(null, 'DOAJ_ENRICHMENT_APPLIED', { jobId: job.id, provider: job.provider, journalsWritten: written, skippedBecauseChangedOrFilled: skipped, fields: byField, issns });
    return out;
  },
};
