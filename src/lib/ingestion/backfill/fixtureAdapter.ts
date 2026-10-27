import type { Candidate } from '../importService.js';
import { judgeArticles, applyArticles, type ArticleItem } from './articleCommon.js';
import { CANONICAL_NAMES } from '../../departmentRegistry.js';
import { fixtureAllowed } from './config.js';
import type { BackfillAdapter, JobView } from './types.js';

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

export const fixtureAdapter: BackfillAdapter<FixtureRaw, ArticleItem> = {
  id: 'fixture', label: 'Fixture (test data)', contentTypes: ['ARTICLE'], fixture: true, lock: 'BackfillFixture',
  params: [
    { key: 'seed', label: 'Fixture seed', type: 'text', default: 'screen', help: 'Names the fixture records (a different seed is a different set).' },
    { key: 'total', label: 'Fixture records', type: 'number', default: 300, min: 1, max: 2000 },
  ],
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

  judge: (items, job: JobView) => judgeArticles(items, job),
  apply: (write, enrich, job) => applyArticles(write, enrich, job),
};
