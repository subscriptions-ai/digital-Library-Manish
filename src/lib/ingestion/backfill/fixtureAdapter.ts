import { classifyCandidates, writeClassified, type Candidate, type Classified } from '../importService.js';
import { judgeDuplicates, applyEnrichment } from '../duplicates.js';
import { CANONICAL_NAMES } from '../../departmentRegistry.js';
import { fixtureAllowed } from './config.js';
import { crashPoint } from './testHooks.js';
import type { BackfillAdapter, Judged, JobView, WriteResult } from './types.js';

/**
 * A stand-in provider for proving the backfill framework: a deterministic, in-memory source of a few hundred ARTICLE-shaped records. It exists only where
 * BACKFILL_FIXTURE=1 and never when NODE_ENV=production, so the production screen cannot offer it. It speaks to no network.
 *
 * It writes through the REAL article judge and writer (the same code the continuous engine and Quick Import use), so what the tests prove about duplicates,
 * rights and idempotency is about the real catalogue, not a mock. Its records are marked source "BackfillFixture" and every row it writes carries
 * createdBy "Backfill:<job id>".
 *
 * Shape of record i (the same for every seed, so two runs can be compared exactly):
 *   i % 20 = 0  published long ago (2015)         → refused by the year policy
 *   i % 20 = 1  no publication year               → review (waits for a person)
 *   i % 20 = 2  no title                          → unreadable (failed)
 *   otherwise   2021–2025, with an open licence unless i % 4 = 0 (no licence stated → review under "OA first", published as a link under "metadata only allowed")
 *   volume is filled when i % 3 = 0 (so a held duplicate with an empty volume is enrichable); licence "CC BY-NC" when i % 30 = 15 (conflicts with a held "CC BY")
 * adapter parameters (config.adapter): seed (default "a"), total (default 300), delayMs (a slow page, for the heartbeat test).
 */

export type FixtureRaw = { id: string; i: number; title: string | null; doi: string; year: number | null; licence: string | null; volume: string | null; authors: string };

/** Test hooks: change what a page returns (to prove a retry notices), or slow a page down. */
export const fixtureHooks: { mutate: null | ((records: FixtureRaw[], offset: number) => FixtureRaw[]); } = { mutate: null };

export const fixtureId = (seed: string, i: number) => `fx:${seed}:${i}`;
export const fixtureDoi = (seed: string, i: number) => `10.9999/bf.${seed}.${i}`;
export const fixtureRecord = (seed: string, i: number): FixtureRaw => {
  const k = i % 20;
  return {
    id: fixtureId(seed, i), i, doi: fixtureDoi(seed, i), authors: `Author ${i}`,
    title: k === 2 ? null : `Fixture article ${seed} ${i}`,
    year: k === 0 ? 2015 : k === 1 ? null : 2021 + (i % 5),
    licence: i % 30 === 15 ? 'CC BY-NC' : i % 4 === 0 ? null : 'cc by',
    volume: i % 3 === 0 ? '7' : null,
  };
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const SLICE = 10;

export const fixtureAdapter: BackfillAdapter<FixtureRaw, { candidate: Candidate; raw: FixtureRaw }> = {
  id: 'fixture', label: 'Fixture (test data)', contentTypes: ['ARTICLE'], fixture: true, lock: 'BackfillFixture',
  available: () => (fixtureAllowed() ? true : 'the test fixture is not enabled here'),
  stableId: r => r.id,

  async fetchPage(job, cursor, limit) {
    const seed = String(job.adapter.seed ?? 'a'), total = Number(job.adapter.total ?? 300);
    if (job.adapter.delayMs) await sleep(Number(job.adapter.delayMs));
    const offset = Number(cursor || 0), end = Math.min(total, offset + limit);
    let records = Array.from({ length: Math.max(0, end - offset) }, (_, k) => fixtureRecord(seed, offset + k));
    if (fixtureHooks.mutate) records = fixtureHooks.mutate(records, offset);
    return { records, nextCursor: end >= total ? null : String(end), bytes: records.reduce((n, r) => n + JSON.stringify(r).length, 0) };
  },

  normalize(raw, job) {
    if (!raw.title) return { error: 'no title' };
    const department = job.departments.length ? job.departments[raw.i % job.departments.length] : CANONICAL_NAMES[0];
    const candidate: Candidate = {
      source: 'BackfillFixture', sourceRecordId: raw.id, title: raw.title, authors: raw.authors, doi: raw.doi, year: raw.year, licence: raw.licence,
      volume: raw.volume, openAccess: true, department,
    };
    return { candidate, raw };
  },

  async judge(items, job: JobView) {
    const cl = await classifyCandidates(items.map(i => i.item.candidate));
    const heldPairs = cl.map((c, k) => ({ c, k })).filter(({ c }) => c.outcome === 'HELD' && c.heldId)
      .map(({ c }) => ({ heldId: c.heldId!, incoming: { authors: c.authors, volume: c.volume, issue: c.issue, subject: c.subject, publisherName: c.publisherName, journalName: c.journalName, issn: c.issn, licence: c.licence, doi: c.doi } }));
    const dups = await judgeDuplicates(heldPairs);
    return items.map(({ id, item }, k): Judged => {
      const c: Classified = cl[k];
      if (c.outcome === 'HELD') { const d = c.heldId ? dups.get(c.heldId) : null; return { id, item, outcome: 'duplicate', dup: d?.kind ?? 'unchanged', reason: d?.kind === 'conflicting' ? 'licence or DOI disagrees with the held record' : null, extra: { heldId: c.heldId, patch: d?.patch } }; }
      if (c.outcome === 'REJECTED') return { id, item, outcome: 'refused', reason: c.reasons.join('; ') };
      if (c.outcome === 'NEEDS_REVIEW') return { id, item, outcome: 'review', reason: c.reasons.join('; '), extra: { classified: c } };
      // Would be added. "OA first": without a verifiable open licence it goes to a person instead of being catalogued as a link. (Stricter than the engine, never looser.)
      if (job.accessPreference === 'OAFirst' && c.licenceVerdict !== 'allows-commercial') return { id, item, outcome: 'review', reason: 'no verifiable open licence (open access first)', extra: { classified: { ...c, outcome: 'NEEDS_REVIEW', status: 'Draft', access: 'LinkOnly', forceReview: true } } };
      return { id, item, outcome: 'publish', extra: { classified: c } };
    });
  },

  async apply(write, enrich, job) {
    const out = new Map<string, WriteResult>();
    let n = 0;
    for (let s = 0; s < write.length; s += SLICE) {
      const slice = write.slice(s, s + SLICE);
      const classified: Classified[] = slice.map(j => j.extra.classified);
      await writeClassified(classified, { email: `Backfill:${job.id}` }, { writeReview: true });
      slice.forEach((j, k) => { const r = classified[k].result; out.set(j.id, r === 'added' || r === 'review' ? 'written' : r === 'held' ? 'present' : 'failed'); });
      n += slice.length;
      crashPoint('mid-apply', n);
    }
    for (const j of enrich) if (j.extra?.heldId && j.extra?.patch) await applyEnrichment(j.extra.heldId, j.extra.patch);
    return out;
  },
};
