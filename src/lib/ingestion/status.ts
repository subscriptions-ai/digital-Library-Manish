import { ingestionDb as db } from './db.js';
import { INGESTION_POLICY, minutes } from './policy.js';
import { runConditions, PROVIDER_FAILURE_SQL, RUN_LEVEL, RUN_BY_DEPARTMENT } from './runFilter.js';
import { rotationStatus, type RotationStatus } from './rotation.js';
import { ensureProviders, rotationEnabled } from './engine.js';

/**
 * What the admin screen shows about the engine, computed from what is actually in the database.
 *
 * Nothing here is invented: "next pass" is the timer's real schedule, "last 24 hours" is a sum over the run
 * log, a warning exists only where the log shows the pattern it describes. Where a value is not known it is
 * null and the screen shows nothing rather than a guess.
 */

/**
 * The four things the engine can be said to be:
 *   running   it is working, or about to
 *   waiting   nothing can be asked right now — every source is resting, rate limited, over a quota, switched off or caught up — and it will resume by itself
 *   paused    an administrator switched it off
 *   attention a person has something to DO: the engine itself is failing, or has stopped doing anything with no source to blame
 * A source being down is never, on its own, "attention".
 */
export type Health = 'running' | 'waiting' | 'paused' | 'attention';

const SOURCE_FOR_PHASE: Record<string, string> = { Articles: 'OpenAlex', Journals: 'DOAJ', Books: 'DOAB' };

const GROUP_FOR_PHASE: Record<string, 'Journals' | 'Articles' | 'Books'> = { Journals: 'Journals', Articles: 'Articles', Books: 'Books' };
const clock = (d: Date | string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();

export async function engineStatus(state: any, timer: { nextTickAt: number | null; lastTickAt: number | null; busy: boolean }) {
  const now = Date.now();
  const policy = INGESTION_POLICY.health;
  const rotating = rotationEnabled();
  let rot: RotationStatus | null = null;
  if (rotating) { ensureProviders(); rot = await rotationStatus({ state }).catch(() => null); }

  const [sources, staleClaims, cooling, claimed] = await Promise.all([
    db.ingestionSourceHealth.findMany(),
    db.journal.count({ where: { claimedAt: { lt: new Date(now - minutes(INGESTION_POLICY.claim.staleAfterMinutes)) } } }),
    db.journal.aggregate({ where: { nextEligibleAt: { gt: new Date(now) } }, _count: { _all: true }, _min: { nextEligibleAt: true } }),
    db.journal.findMany({ where: { claimedAt: { gt: new Date(now - minutes(INGESTION_POLICY.claim.staleAfterMinutes)) } }, select: { title: true, claimedAt: true }, take: 3 }),
  ]);

  const pausedSources = sources.filter((s: any) => s.pausedUntil && s.pausedUntil.getTime() > now);
  // What a person can act on: a source that cannot be asked for a reason that is a problem (not a daily quota, not a Quick Import on it,
  // not a source that is simply not connected). The engine has NOT stopped when there are some — the others carry on, and the screen says so.
  const problems = (rot?.providers || []).filter(p => p.availability.state === 'unavailable' && ['rate_limited', 'cooling', 'unavailable'].includes(p.availability.kind || ''))
    .map(p => ({ id: p.id, label: p.label, group: p.group, kind: p.availability.kind as string, until: p.availability.until, text: `${p.label} — ${p.availability.kind === 'rate_limited' ? `rate limited until ${p.availability.until ? clock(p.availability.until) : 'later'}` : p.availability.kind === 'unavailable' ? `unavailable${p.availability.until ? `, retry ${clock(p.availability.until)}` : ', retry scheduled'}` : `cooling down${p.availability.until ? ` until ${clock(p.availability.until)}` : ''}`}${(rot?.providers.find(x => x.id === p.id)?.health.reason) ? ` (${rot!.providers.find(x => x.id === p.id)!.health.reason})` : ''}` }));
  const reasons: string[] = [];
  const GROUPS3 = ['Journals', 'Articles', 'Books'] as const;
  const groupsWaiting = rot ? GROUPS3.filter(g => rot!.groups[g].waiting) : [];
  const allWaiting = !!(rot && state.enabled && groupsWaiting.length === GROUPS3.length);
  // The engine decided, on its last look, that nothing can be asked until a known time (or at all, until something changes).
  const asleep = !!(rot && state.enabled && rot.idle);
  const engineFailing = (state.consecutiveFailures || 0) >= policy.needsAttentionAfterFailures;
  const silentFor = state.lastSuccessAt ? now - new Date(state.lastSuccessAt).getTime() : 0;
  let health: Health;
  if (!state.enabled) {
    health = 'paused';
  } else if (engineFailing) {
    health = 'attention'; reasons.push(`${state.consecutiveFailures} passes in a row failed`);
  } else if (staleClaims > 0) {
    health = 'attention'; reasons.push(`${staleClaims} journal claim${staleClaims === 1 ? '' : 's'} abandoned by a worker that stopped`);
  } else if (rotating ? asleep : pausedSources.length > 0) {
    // Waiting means the engine looked and found NOTHING to do — no source of any type, no coverage work, no local backlog. Every content type
    // resting is not enough: the engine then works through its backlog, and is running. (`allWaiting` is kept for the reasons below.)
    // Every source resting is the sources' state, not a fault of the engine: it resumes by itself, and says when it will try again.
    health = 'waiting';
    if (!rotating) for (const s of pausedSources) reasons.push(`${s.source} is paused after repeated failures and will be tried again by itself`);
  } else if (state.lastSuccessAt && silentFor > minutes(policy.delayedAfterMinutes) && !problems.length && !groupsWaiting.length) {
    // Quiet for a long time with no source to blame: the one slow case that is the engine's own.
    health = 'attention'; reasons.push(`no pass has finished without error for ${Math.round(silentFor / 60000)} minutes, and no source is resting to explain it`);
  } else {
    health = 'running';
    if (!state.lastSuccessAt) reasons.push('waiting for the first pass');
  }
  if (rot && state.enabled) {
    for (const p of problems) reasons.push(p.text);
    for (const g of groupsWaiting) reasons.push(`${g}: waiting for source recovery${rot.groups[g].retryAt ? ` (next try ${clock(rot.groups[g].retryAt!)})` : ''}`);
    if (rot.idle?.cause === 'caught-up' && health === 'waiting') reasons.push('Every source is up to date; the engine looks again when the first one is due.');
    if (allWaiting && health === 'running' && rot.currentJob?.kind !== 'source') reasons.push('Every external source is resting; the engine is working through its local backlog meanwhile.');
    if (problems.length || groupsWaiting.length) reasons.push(health === 'waiting' ? 'The engine will pick up each source as it recovers.' : 'Healthy providers continue running automatically.');
  }
  // When it will look again, and at whom: from the engine's own record while it sleeps, else worked out now.
  const upNext = rot?.idle?.next ?? rot?.next ?? null;
  const next = upNext ? { group: upNext.group, provider: upNext.provider, label: upNext.label, at: upNext.at, text: `${upNext.group} — ${clock(upNext.at)}` } : null;

  const label = { running: 'Running', waiting: 'Waiting for source recovery', paused: 'Paused', attention: 'Needs attention' }[health];
  const coolingCount = cooling._count._all as number;

  // The source working RIGHT NOW, or the one that last worked for what the engine was last doing — never a fixed guess from the phase.
  const group = GROUP_FOR_PHASE[state.phase];
  // The job working now (a source, a coverage engine or a backlog job), else the one the engine last chose — never blank while work runs.
  const currentSource = rot
    ? (rot.currentJob?.label ?? rot.running?.label ?? rot.lastDecision?.label ?? (group ? rot.groups[group].current : null))
    : (SOURCE_FOR_PHASE[state.phase] || null);
  const activity = rot?.currentJob
    ? `${rot.currentJob.kind === 'local' ? 'Backlog' : rot.currentJob.group} · ${rot.currentJob.label}`
    : rot?.lastDecision && health === 'running' ? `${rot.lastDecision.kind === 'local' ? 'Backlog' : rot.lastDecision.group} · ${rot.lastDecision.label}` : null;

  return {
    health, label, reasons,
    /** While waiting: the source that comes back first and when the engine will look at it. Null when nothing has a time (a source is held by something with no end). */
    waiting: health === 'waiting' ? { since: rot?.idle?.since ?? null, cause: rot?.idle?.cause ?? 'recovery', next, nextAttemptAt: rot?.idle?.nextAt ?? upNext?.at ?? null } : null,
    next,
    mode: state.focus || 'auto',
    currentSource,
    /** "Books · Crossref Books", "Backlog · Held candidate review": what the engine is doing now, or last chose to do. */
    activity,
    nextJobs: rot?.nextJobs ?? [],
    lastDecision: rot?.lastDecision ?? null,
    backlog: rot?.backlog ?? [],
    weights: rot?.weights ?? null,
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
      lastErrorKind: s.lastErrorKind ?? null, consecutiveFailures: s.consecutiveFailures ?? 0, lifetimeFailures: s.lifetimeFailures ?? 0,
    })),
    rotation: rot ? { enabled: true, ...rot, problems } : { enabled: false },
  };
}

/**
 * What the engine did in the last 24 hours, from the run log.
 *
 * `failed` and `errors` are CATALOGUE failures — records that could not be written, runs that broke inside the engine. A request to a
 * source that did not answer is `providerFailures`, counted apart: one outage, retried and switched away from, used to read as hundreds
 * of failures because every row with an error text was counted the same way.
 */
export async function last24Hours() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [r]: any[] = await db.$queryRawUnsafe(
    `select count(*)::int passes, coalesce(sum(r.added), 0)::int added, coalesce(sum(r."skippedHeld"), 0)::int held,
            coalesce(sum(r."skippedFailed"), 0)::int failed, coalesce(sum(r."skippedRejected"), 0)::int rejected, coalesce(sum(r."needsReview"), 0)::int "needsReview",
            coalesce(sum(r.enriched), 0)::int enriched, coalesce(sum(r.promoted), 0)::int promoted,
            (count(*) filter (where ${PROVIDER_FAILURE_SQL}))::int "providerFailures",
            (count(*) filter (where r.error is not null and not ${PROVIDER_FAILURE_SQL}))::int errors
       from "IngestionRun" r where r."at" >= ((($1)::text)::timestamptz at time zone 'UTC')`, since);
  return { passes: r.passes, added: r.added, held: r.held, failed: r.failed, errors: r.errors, providerFailures: r.providerFailures, rejected: r.rejected, needsReview: r.needsReview, enriched: r.enriched, promoted: r.promoted };
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

export type HistoryQuery = { result?: string; phase?: string; department?: string; source?: string; start?: Date | null; end?: Date | null; limit?: number; before?: string };

/**
 * Filtered and paged on the server. Every filter — department, kind, source, result, date range — is one condition from
 * runConditions, the same function the department summary uses, so the rows and the figures above them are the same runs.
 */
export async function runHistory(q: HistoryQuery) {
  const take = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const params: any[] = [];
  const where = runConditions({ result: q.result, phase: q.phase, department: q.department, source: q.source, start: q.start, end: q.end, before: q.before }, params);
  params.push(take + 1);
  const rows: any[] = await db.$queryRawUnsafe(
    // With a department chosen the rows are that department's: a run that spans departments shows what it did FOR it.
    `select r.* from ${q.department ? RUN_BY_DEPARTMENT : RUN_LEVEL} ${where.length ? `where ${where.join(' and ')}` : ''}
      order by r."at" desc, r.id desc limit $${params.length}`, ...params);
  const more = rows.length > take;
  const runs = more ? rows.slice(0, take) : rows;
  return { runs, hasMore: more, nextBefore: more ? `${runs[runs.length - 1].at.toISOString()}|${runs[runs.length - 1].id}` : null };
}

/** The sources the run log has seen, for the Source filter. A short list, held for a minute. */
let sourcesCache: { at: number; list: string[] } | null = null;
export async function runSources(): Promise<string[]> {
  if (sourcesCache && Date.now() - sourcesCache.at < 60_000) return sourcesCache.list;
  const rows: any[] = await db.$queryRawUnsafe(`select distinct source from "IngestionRun" where source is not null order by 1`);
  sourcesCache = { at: Date.now(), list: rows.map(r => r.source) };
  return sourcesCache.list;
}
