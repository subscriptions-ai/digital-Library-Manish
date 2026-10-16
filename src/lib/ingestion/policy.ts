/**
 * Every number the ingestion engine's safety behaviour depends on, in one place.
 *
 * Cooldowns, claim timeouts, page sizes and thresholds were scattered through the engine as
 * literals, so changing one meant finding all of them and hoping none was missed. They are
 * here, named, and the admin screen reads them from the server rather than repeating them.
 *
 * Nothing here is permanent: a cooldown is a time, not a verdict. Academic sources publish
 * new work later, so no journal is ever marked finished for good.
 */

export const INGESTION_POLICY = {
  /** How many articles one request asks a source for. */
  articles: {
    /**
     * The least one request asks for, even when a journal needs only a few more to reach its
     * limit. Asking for exactly the shortfall (1 or 2 records) meant a journal whose newest
     * records were already held cost one whole visit per record it had to walk past.
     */
    pageMin: 50,
    pageMax: 200,
  },

  /** How long a journal is left alone after a visit that did not give anything. */
  cooldown: {
    /** Minutes after the 1st, 2nd, 3rd... visit in a row that added nothing; the last value repeats, doubling. */
    noChangeSteps: [10, 60, 360, 720, 1440],
    noChangeMaxMinutes: 14 * 24 * 60,
    /** A journal that has been read to its end is looked at again after this many days, never sooner. */
    exhaustedDays: 7,
    /** Retry delay after a failed request, doubling each time. */
    failureBaseMinutes: 5,
    failureMaxMinutes: 6 * 60,
  },

  /** A claim older than this is treated as abandoned by a crashed worker and may be taken over. */
  claim: { staleAfterMinutes: 15 },

  /** One source failing repeatedly is left alone for a while; the rest of the engine carries on. */
  breaker: {
    /** Overridden by INGESTION_FAILURES_BEFORE_FALLBACK; see rotationConfig(). Three, so the engine moves on at the third failure, not the fourth. */
    failuresToOpen: 3,
    /** How long a source rests after its 3rd, 4th, 5th… failed request in a row; the last value repeats. A source that is down for days is tested a few times a day, not every hour. */
    pauseMinutes: [10, 30, 60, 120, 240, 360] as number[],
    /** A rate-limited source rests for what it asked (Retry-After) within these bounds; with no answer, this long. */
    rateLimitDefaultMinutes: 5, rateLimitMinMinutes: 1, rateLimitMaxMinutes: 60,
  },

  /** When the engine's status stops saying "running normally". */
  health: {
    /** Enabled, but no pass has finished without error for this long. */
    delayedAfterMinutes: 20,
    needsAttentionAfterFailures: 5,
    /** The timer's own rhythm; the next pass is expected about this long after the last. */
    tickSeconds: 60,
  },

  /** A journal checked this many times in a window with nothing added is worth a warning. */
  alert: { repeatedNoChangeVisits: 3, windowHours: 24 },

  /** How long a dry run stays valid for the write that follows it, and how large it may be. */
  preview: { ttlMinutes: 60, maxItems: 2000 },

  /**
   * Quick Import: a bounded batch brought in by hand when the continuous engine is slow, paused or rate limited.
   * Each source has its own default because the sources are not alike — a Crossref request is cheap, an NCBI archive
   * is a download. `QUICK_IMPORT_LIMIT_<SOURCE>` (e.g. QUICK_IMPORT_LIMIT_CROSSREF=150) changes a default, and is held
   * inside `ceiling` however it is set. NCBI is capped at 25 archives and is also bound by its daily limits.
   */
  quick: {
    defaults: { doaj: 100, road: 100, crossrefjournals: 100, openalexsources: 100, crossref: 250, openalex: 200, europepmc: 100, arxiv: 100, doab: 100, oapen: 100, otl: 100, ncbi: 25, nlm: 100, crossrefbooks: 100, pressbooks: 40 } as Record<string, number>,
    ceiling: { doaj: 500, road: 500, crossrefjournals: 500, openalexsources: 500, crossref: 1000, openalex: 1000, europepmc: 500, arxiv: 300, doab: 500, oapen: 500, otl: 500, ncbi: 25, nlm: 300, crossrefbooks: 500, pressbooks: 200 } as Record<string, number>,
    /** One run is also bounded in time and in how many journals it visits, so a quiet source cannot hold it open for ever. */
    maxJournalsPerRun: 40,
    runBudgetMs: 4 * 60_000,
  },

  /** Server-side limits for what an administrator may set. The screen mirrors these; the server decides. */
  settings: {
    yearsBack:          { min: 1, max: 50 },            // no longer used: see articleMinYear / bookMinYear
    /** The earliest publication year for a NEW article (yearPolicy.ts). */
    articleMinYear:     { min: 1990, max: new Date().getFullYear() },
    /** The earliest publication year for a NEW book to be published the normal way; older ones wait for review. */
    bookMinYear:        { min: 1900, max: new Date().getFullYear() },
    batchSize:          { min: 1, max: 200 },
    articlesPerJournal: { min: 1, max: 100 },
    discoverEvery:      { min: 1, max: 50 },
    journalsPerPass:    { min: 10, max: 500 },
    articlesPerPass:    { min: 10, max: 500 },
    booksPerPass:       { min: 10, max: 500 },
  },
} as const;

const envInt = (key: string, fallback: number, min: number, max: number) => {
  const raw = process.env[key];
  const v = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
};

/**
 * The rotation engine's server-side settings. Read from the environment each time, so a test (or an operator restarting
 * with a new value) never has to rebuild anything, and never exposed to the browser.
 *
 *   INGESTION_BATCH_SIZE                         candidates CHECKED per provider turn (not records inserted). Default 100.
 *   INGESTION_FAILURES_BEFORE_FALLBACK           consecutive failed requests before a source rests and the next one takes over. Default 3.
 *   INGESTION_ZERO_YIELD_BATCHES_BEFORE_ROTATION consecutive batches with nothing useful before a healthy source is set aside for now. Default 3.
 */
export function rotationConfig() {
  return {
    batchSize: envInt('INGESTION_BATCH_SIZE', 100, 1, 1000),
    failuresBeforeFallback: envInt('INGESTION_FAILURES_BEFORE_FALLBACK', INGESTION_POLICY.breaker.failuresToOpen, 1, 20),
    zeroYieldBatches: envInt('INGESTION_ZERO_YIELD_BATCHES_BEFORE_ROTATION', 3, 1, 50),
    /** How long a source that gave nothing useful for the set number of batches is left out of the rotation. A time, not a verdict. */
    exhaustedHours: envInt('INGESTION_EXHAUSTED_HOURS', 6, 1, 24 * 14),
    /** A failed request is retried by the same source on its next turn, but not before this long (seconds), doubling. */
    softBackoffSeconds: ((process.env.INGESTION_SOFT_BACKOFF_SECONDS || '').split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x >= 0).length
      ? (process.env.INGESTION_SOFT_BACKOFF_SECONDS || '').split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x >= 0)
      : [30, 90]) as number[],
  };
}

/**
 * INGESTION_SCHEDULER_V2: cooldowns, atomic claims, fixed page size, failure-safe cursors.
 *
 * On unless set to "0". Switching it off puts the engine back to choosing the journal refreshed
 * longest ago with no claim and no cooldown — the previous behaviour — without touching any data,
 * because the columns it adds are simply ignored. That is the rollback.
 */
export const schedulerV2 = () => process.env.INGESTION_SCHEDULER_V2 !== '0';

/** Minutes to leave a journal alone after its nth consecutive visit that added nothing. */
export function noChangeCooldownMinutes(consecutive: number): number {
  const steps = INGESTION_POLICY.cooldown.noChangeSteps;
  const n = Math.max(1, consecutive);
  if (n <= steps.length) return steps[n - 1];
  const doublings = n - steps.length;
  return Math.min(INGESTION_POLICY.cooldown.noChangeMaxMinutes, steps[steps.length - 1] * 2 ** doublings);
}

/** Minutes before retrying after the nth consecutive failed request. */
export function failureBackoffMinutes(consecutive: number): number {
  const c = INGESTION_POLICY.cooldown;
  return Math.min(c.failureMaxMinutes, c.failureBaseMinutes * 2 ** Math.max(0, consecutive - 1));
}

export const minutes = (n: number) => n * 60_000;
export const days = (n: number) => n * 86_400_000;
