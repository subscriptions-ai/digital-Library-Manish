import { ingestionDb as db } from './db.js';
import { INGESTION_POLICY, minutes } from './policy.js';

/**
 * What the admin screen shows about the engine, computed from what is actually in the database.
 *
 * Nothing here is invented: "next pass" is the timer's real schedule, "last 24 hours" is a sum over the run
 * log, a warning exists only where the log shows the pattern it describes. Where a value is not known it is
 * null and the screen shows nothing rather than a guess.
 */

export type Health = 'running' | 'paused' | 'delayed' | 'attention';

const SOURCE_FOR_PHASE: Record<string, string> = { Articles: 'OpenAlex', Journals: 'DOAJ', Books: 'DOAB' };

export async function engineStatus(state: any, timer: { nextTickAt: number | null; lastTickAt: number | null; busy: boolean }) {
  const now = Date.now();
  const policy = INGESTION_POLICY.health;

  const [sources, staleClaims, cooling, claimed] = await Promise.all([
    db.ingestionSourceHealth.findMany(),
    db.journal.count({ where: { claimedAt: { lt: new Date(now - minutes(INGESTION_POLICY.claim.staleAfterMinutes)) } } }),
    db.journal.aggregate({ where: { nextEligibleAt: { gt: new Date(now) } }, _count: { _all: true }, _min: { nextEligibleAt: true } }),
    db.journal.findMany({ where: { claimedAt: { gt: new Date(now - minutes(INGESTION_POLICY.claim.staleAfterMinutes)) } }, select: { title: true, claimedAt: true }, take: 3 }),
  ]);

  const pausedSources = sources.filter((s: any) => s.pausedUntil && s.pausedUntil.getTime() > now);
  const reasons: string[] = [];
  let health: Health;
  if (!state.enabled) {
    health = 'paused';
  } else if ((state.consecutiveFailures || 0) >= policy.needsAttentionAfterFailures || pausedSources.length) {
    health = 'attention';
    if ((state.consecutiveFailures || 0) >= policy.needsAttentionAfterFailures) reasons.push(`${state.consecutiveFailures} passes in a row failed`);
    for (const s of pausedSources) reasons.push(`${s.source} is paused after repeated failures and will be tried again by itself`);
  } else if (staleClaims > 0) {
    health = 'attention'; reasons.push(`${staleClaims} journal claim${staleClaims === 1 ? '' : 's'} abandoned by a worker that stopped`);
  } else if (state.lastSuccessAt && now - new Date(state.lastSuccessAt).getTime() > minutes(policy.delayedAfterMinutes)) {
    health = 'delayed'; reasons.push(`no pass has finished without error for ${Math.round((now - new Date(state.lastSuccessAt).getTime()) / 60000)} minutes`);
  } else {
    health = 'running';
    if (!state.lastSuccessAt) reasons.push('waiting for the first pass');
  }

  const label = { running: 'Running normally', paused: 'Paused', delayed: 'Delayed', attention: 'Needs attention' }[health];
  const coolingCount = cooling._count._all as number;

  return {
    health, label, reasons,
    mode: state.focus || 'auto',
    currentSource: SOURCE_FOR_PHASE[state.phase] || null,
    currentlyProcessing: claimed[0]?.title || (state.currentJournal || null),
    lastPassAt: state.lastRunAt ?? null,
    // The timer's real rhythm. Known only while the engine is on and the server has ticked since it started.
    nextPassAt: state.enabled && timer.nextTickAt ? new Date(timer.nextTickAt).toISOString() : null,
    passRunning: timer.busy,
    coolingDown: { journals: coolingCount, nextDueAt: coolingCount ? (cooling._min.nextEligibleAt as Date).toISOString() : null },
    sources: sources.map((s: any) => ({
      source: s.source, healthy: !(s.pausedUntil && s.pausedUntil.getTime() > now) && (s.consecutiveFailures || 0) === 0,
      status: s.pausedUntil && s.pausedUntil.getTime() > now ? 'delayed' : (s.consecutiveFailures || 0) > 0 ? 'failing' : 'ok',
      pausedUntil: s.pausedUntil ?? null, lastError: s.lastError ?? null, lastOkAt: s.lastOkAt ?? null,
    })),
  };
}

/** What the engine did in the last 24 hours, from the run log. */
export async function last24Hours() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const a = await db.ingestionRun.aggregate({
    where: { at: { gte: since } },
    _sum: { added: true, skippedHeld: true, skippedFailed: true, needsReview: true, skippedRejected: true },
    _count: { _all: true },
  });
  const errors = await db.ingestionRun.count({ where: { at: { gte: since }, error: { not: null } } });
  return {
    passes: a._count._all, added: a._sum.added || 0, held: a._sum.skippedHeld || 0,
    failed: (a._sum.skippedFailed || 0), errors, rejected: a._sum.skippedRejected || 0, needsReview: a._sum.needsReview || 0,
  };
}

/**
 * Journals checked repeatedly with nothing added. A visit to the same journal, at least three times in a day,
 * with nothing added each time, is worth saying out loud — and what the engine has done about it.
 */
export async function repeatedNoChangeAlerts() {
  const hours = INGESTION_POLICY.alert.windowHours; const min = INGESTION_POLICY.alert.repeatedNoChangeVisits;
  const rows: any[] = await db.$queryRawUnsafe(
    `select r."journalId" id, max(r."journalTitle") title, count(*)::int visits, sum(r."skippedHeld")::int held
       from "IngestionRun" r
      where r.phase = 'Articles' and r."journalId" is not null and r."at" > now() - ($1 || ' hours')::interval
      group by r."journalId"
     having sum(r.added) = 0 and count(*) >= $2
      order by count(*) desc limit 10`, String(hours), min);
  if (!rows.length) return [];
  const js: any[] = await db.journal.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { id: true, nextEligibleAt: true, noChangeCount: true } });
  const by = new Map(js.map(j => [j.id, j]));
  return rows.map(r => {
    const j = by.get(r.id); const cooling = !!j?.nextEligibleAt && j.nextEligibleAt.getTime() > Date.now();
    return {
      journalId: r.id, title: r.title, visits: r.visits, held: r.held, cooldownApplied: cooling,
      message: cooling
        ? `Repeated no-change checks detected for ${r.title}. The engine has applied a cooldown.`
        : `Repeated no-change checks detected for ${r.title} (${r.visits} in ${hours} h). A cooldown applies from its next visit.`,
    };
  });
}

// ── Metrics by period ─────────────────────────────────────────────────────

export type Period = 'lifetime' | '7d' | '24h';

/** The six headline numbers. Lifetime is the engine's own running totals, untouched; shorter periods sum the run log. */
export async function metrics(state: any, period: Period) {
  if (period === 'lifetime') {
    return {
      period, journalsSeen: state.journalsSeen, accepted: state.journalsAccepted, refused: state.journalsRejected,
      articlesAdded: state.articlesAdded, booksAdded: state.booksAdded, alreadyHeld: (state.articlesSkipped || 0) + (state.booksSkipped || 0),
    };
  }
  const since = new Date(Date.now() - (period === '24h' ? 24 : 24 * 7) * 3600_000);
  const rows: any[] = await db.$queryRawUnsafe(
    `select coalesce(sum("journalsSeen"),0)::int js, coalesce(sum("journalsAccepted"),0)::int ja, coalesce(sum("journalsRefused"),0)::int jr,
            coalesce(sum(added) filter (where phase='Articles'),0)::int aa, coalesce(sum(added) filter (where phase='Books'),0)::int ba,
            coalesce(sum("skippedHeld") + sum("skippedFailed"),0)::int held
       from "IngestionRun" where "at" >= $1`, since);
  const r = rows[0];
  return { period, journalsSeen: r.js, accepted: r.ja, refused: r.jr, articlesAdded: r.aa, booksAdded: r.ba, alreadyHeld: r.held };
}

// ── The run log, filtered and paged on the server ──────────────────────────

export type HistoryQuery = { result?: string; phase?: string; limit?: number; before?: string };

export async function runHistory(q: HistoryQuery) {
  const take = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const where: any = {};
  const and: any[] = [];

  const phases: Record<string, string> = { articles: 'Articles', books: 'Books', journals: 'Journals' };
  if (q.phase && phases[q.phase.toLowerCase()]) and.push({ phase: phases[q.phase.toLowerCase()] });

  switch ((q.result || 'all').toLowerCase()) {
    case 'added':   and.push({ OR: [{ added: { gt: 0 } }, { journalsAccepted: { gt: 0 } }] }); break;
    case 'held':    and.push({ skippedHeld: { gt: 0 } }); break;
    case 'failed':  and.push({ OR: [{ skippedFailed: { gt: 0 } }, { error: { not: null } }, { phase: 'Error' }] }); break;
    // Skipped: the pass wrote nothing and nothing failed — a rule refused records, they await review, or there was nothing to do.
    case 'skipped': and.push({ added: 0, skippedHeld: 0, skippedFailed: 0, journalsAccepted: 0, error: null },
                              { OR: [{ skippedRejected: { gt: 0 } }, { needsReview: { gt: 0 } }, { phase: 'Idle' }, { note: { not: null } }] }); break;
  }
  if (q.before) { const d = new Date(q.before); if (!isNaN(d.getTime())) and.push({ at: { lt: d } }); }
  if (and.length) where.AND = and;

  const rows: any[] = await db.ingestionRun.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: take + 1 });
  const more = rows.length > take;
  const runs = more ? rows.slice(0, take) : rows;
  return { runs, hasMore: more, nextBefore: more ? runs[runs.length - 1].at.toISOString() : null };
}
