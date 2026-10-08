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
  breaker: { failuresToOpen: 5, pauseMinutes: [10, 30, 60] as number[] },

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

  /** Server-side limits for what an administrator may set. The screen mirrors these; the server decides. */
  settings: {
    yearsBack:          { min: 1, max: 50 },
    batchSize:          { min: 1, max: 200 },
    articlesPerJournal: { min: 0, max: 10000 },
    discoverEvery:      { min: 1, max: 50 },
  },
} as const;

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
