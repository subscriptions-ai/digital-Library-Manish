/**
 * Read-only registration analytics for the Sales Workspace.
 *
 * Aggregate numbers (how many people registered, how many are verified, how many hold a subscription) are the same for every sales user and
 * identify nobody. Individual records are another matter: a sales user is shown only the members behind leads assigned to them, through the
 * one mapping the system has — `Lead.assignedToId` and `Lead.email` (every signup files a lead under the member's address). There is no
 * User → executive column, so nothing here invents one, and nothing here assigns anybody.
 *
 * Nothing in this file writes. The routes accept GET only.
 */
import express from 'express';
import { Prisma } from '@prisma/client';
import {
  conversion, growth, istDay, lastDaysWindow, previousWindow, resolveWindow, todayWindow, zeroFill,
  type Conversion, type DateWindow, type Growth,
} from '../lib/registrationWindows.js';
import { PENDING_DELETION, DELETED } from './accountRemoval.js';

type Db = any;

/** The roles that may read these screens. Separate from requireAdminOrManager on purpose: this grants no user management of any kind. */
export const REGISTRATION_ANALYTICS_ROLES = ['SalesExecutive', 'SalesManager', 'SuperAdmin'] as const;


/**
 * What counts as a registered customer: a member account — any role that is not staff, the rule the Members screens and the campaign board
 * already use — that is not a demo account, not on its way out (PENDING_DELETION / DELETED) and not anonymised. Unique by construction: it is
 * a filter over User, never a join. Test accounts are only identifiable by the `isDemoAccount` flag; there is no other marker to read.
 */
export const eligibleSql = (staffRoles: readonly string[], alias = 'u') => {
  const a = Prisma.raw(`"${alias}"`);
  return Prisma.sql`${a}."role" NOT IN (${Prisma.join([...staffRoles])}) AND ${a}."isDemoAccount" = false
    AND ${a}."status" NOT IN (${PENDING_DELETION}, ${DELETED}) AND ${a}."purgedAt" IS NULL`;
};

export type SubStatus = 'paid' | 'institution' | 'granted' | 'trial' | 'expired' | 'cancelled' | 'none';
export const SUB_STATUSES: SubStatus[] = ['paid', 'institution', 'granted', 'trial', 'expired', 'cancelled', 'none'];
/** The statuses that hold running access of some kind. Everything else is somebody a sales call could still convert. */
export const ACTIVE_STATUSES: SubStatus[] = ['paid', 'institution', 'granted'];
export const SUB_LABEL: Record<SubStatus, string> = {
  paid: 'Paid · Payment-linked', institution: 'Active · Via institution', granted: 'Active · No payment link',
  trial: 'Trial', expired: 'Expired', cancelled: 'Cancelled', none: 'No subscription',
};

/** Institutions whose managed seat count is over its limit — nobody there is trusted until an admin reconciles (see licensedSeats in server.ts). */
export async function overLimitInstitutionIds(db: Db, now: Date): Promise<string[]> {
  const subs: { institutionId: string; licensedUserLimit: number | null; status: string; endDate: Date }[] = await db.subscription.findMany({
    where: { institutionId: { not: null } },
    select: { institutionId: true, licensedUserLimit: true, status: true, endDate: true },
    orderBy: { endDate: 'desc' },
  });
  const byInst = new Map<string, typeof subs>();
  for (const s of subs) byInst.set(s.institutionId, [...(byInst.get(s.institutionId) || []), s]);
  const limits = new Map<string, number>();
  for (const [id, list] of byInst) {
    const withLimit = list.filter(s => s.licensedUserLimit != null);
    if (!withLimit.length) continue; // seats are not managed: no limit applies
    const activeWith = withLimit.filter(s => s.status === 'Active' && s.endDate > now);
    // A renewal that did not restate the limit carries the last one forward.
    limits.set(id, activeWith.length ? Math.max(...activeWith.map(s => s.licensedUserLimit!)) : withLimit[0].licensedUserLimit!);
  }
  if (!limits.size) return [];
  const assigned: { institutionId: string; n: number }[] = await db.$queryRaw`
    SELECT a."institutionId" AS "institutionId", count(*)::int AS n
    FROM "InstitutionMemberAccess" a JOIN "User" m ON m."id" = a."userId" AND m."institutionId" = a."institutionId"
    WHERE a."revokedAt" IS NULL AND m."isBlocked" = false GROUP BY a."institutionId"`;
  const used = new Map(assigned.map(r => [r.institutionId, r.n]));
  return [...limits].filter(([id, limit]) => (used.get(id) || 0) > limit).map(([id]) => id);
}

/**
 * One member's subscription state, as a SQL expression over a `"User"` row aliased `u`. The aggregate counts and the table of assigned
 * members both select this same expression, so the two cannot disagree.
 *
 *   paid         — holds a subscription of their own that is Active, unexpired, not a trial, and was bought through a Payment recorded Paid/Success
 *                  (Subscription.paymentId → Payment). The only link the schema has between money and access.
 *   institution  — covered by their institution's running subscription (and, where seats are managed, holding a seat), as getUserActiveSubscriptions does.
 *   granted      — holds a running subscription of their own with no recorded payment: an administrator's grant, a Pro approval, or an offline payment
 *                  that was never linked. It is access, but it is not counted as paid.
 *   trial / expired / cancelled / none — not holding running access. Trial is a subscription named "… Trial" (how demos are created).
 */
export const subStatusSql = (now: Date, overLimit: string[]) => Prisma.sql`(CASE
  WHEN EXISTS (SELECT 1 FROM "Subscription" s JOIN "Payment" p ON p."id" = s."paymentId"
               WHERE s."userId" = u."id" AND s."status" = 'Active' AND s."endDate" > ${now} AND s."planName" NOT ILIKE '%trial%'
                 AND p."status" IN ('Paid', 'Success')) THEN 'paid'
  WHEN u."institutionId" IS NOT NULL
       AND EXISTS (SELECT 1 FROM "Subscription" s WHERE s."institutionId" = u."institutionId" AND s."userId" IS DISTINCT FROM u."id"
                   AND s."status" = 'Active' AND s."endDate" > ${now} AND s."planName" NOT ILIKE '%trial%')
       AND (NOT EXISTS (SELECT 1 FROM "Subscription" m WHERE m."institutionId" = u."institutionId" AND m."licensedUserLimit" IS NOT NULL)
            OR (EXISTS (SELECT 1 FROM "InstitutionMemberAccess" a WHERE a."userId" = u."id" AND a."institutionId" = u."institutionId"
                        AND a."revokedAt" IS NULL AND u."isBlocked" = false)
                AND NOT (u."institutionId" = ANY(${overLimit}::text[])))) THEN 'institution'
  WHEN EXISTS (SELECT 1 FROM "Subscription" s WHERE s."userId" = u."id" AND s."status" = 'Active' AND s."endDate" > ${now}
               AND s."planName" NOT ILIKE '%trial%') THEN 'granted'
  WHEN EXISTS (SELECT 1 FROM "Subscription" s WHERE (s."userId" = u."id" OR (s."institutionId" IS NOT NULL AND s."institutionId" = u."institutionId"))
               AND s."status" = 'Active' AND s."endDate" > ${now} AND s."planName" ILIKE '%trial%') THEN 'trial'
  WHEN EXISTS (SELECT 1 FROM "Subscription" s WHERE s."userId" = u."id" AND s."status" IN ('Active', 'Expired') AND s."endDate" <= ${now}
               AND s."cancelledAt" IS NULL) THEN 'expired'
  WHEN EXISTS (SELECT 1 FROM "Subscription" s WHERE s."userId" = u."id" AND (s."status" = 'Cancelled' OR s."cancelledAt" IS NOT NULL)) THEN 'cancelled'
  ELSE 'none' END)`;

const n = (v: unknown) => Number(v) || 0;
const inWindow = (w: DateWindow) => Prisma.sql`u."createdAt" >= ${w.start} AND u."createdAt" < ${w.end}`;

export interface RegistrationSummary {
  generatedAt: string;
  range: { key: string; fromDay: string; toDay: string; days: number };
  previous: { fromDay: string; toDay: string };
  /** All-members scope, fixed windows — they do not follow the range filter. */
  cards: { total: number; today: number; last7: number; last30: number; verified: number; unverified: number };
  /**
   * Whether registered members ever opened something in the reader — `User.lastReadAt`, the field the Admin Users screen counts as "Have read something".
   * It is set only when a signed-in member's open of an item is granted (see markRead in server.ts); signing in, searching or viewing a record page does not set it.
   */
  engagement: { haveRead: number; neverOpened: number };
  /**
   * How "Total Registered Users" is reached from every row of the User table, which is what the Admin Users screen lists. Each account is in exactly
   * one bucket, in this order, so the parts always add up: all = staff + demo + removed + anonymised + registered.
   */
  reconciliation: {
    allAccounts: number; staff: number; demo: number; removed: number; anonymised: number; registered: number;
    /** Admin Users' own verified / have-read figures over all accounts, so each can be set beside the matching figure here. */
    allAccountsVerified: number; allAccountsHaveRead: number;
    /** Part of `registered`, not a deduction: accounts an institution added or that belong to one. */
    institutionMembers: number;
  };
  /** Follows the range filter. */
  selected: { registrations: number; previousRegistrations: number; growth: Growth; verified: number; unverified: number };
  series: { day: string; count: number }[];
  /** All members, today's state. */
  subscriptions: Record<SubStatus, number> & { withoutActive: number; activePaid: number };
  conversion: Conversion;
}

/** Everything the dashboard section shows. Six aggregate queries; no member is read into memory. */
export async function registrationSummary(db: Db, staffRoles: readonly string[], win: DateWindow, rangeKey: string, now: Date = new Date()): Promise<RegistrationSummary> {
  const eligible = eligibleSql(staffRoles);
  const today = todayWindow(now), d7 = lastDaysWindow(7, now), d30 = lastDaysWindow(30, now), prev = previousWindow(win);
  const overLimit = await overLimitInstitutionIds(db, now);

  const [[c], series, subRows, [conv], [rec]] = await Promise.all([
    db.$queryRaw`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL)::int AS verified,
        count(*) FILTER (WHERE u."emailVerifiedAt" IS NULL)::int AS unverified,
        count(*) FILTER (WHERE u."lastReadAt" IS NOT NULL)::int AS "haveRead",
        count(*) FILTER (WHERE u."institutionId" IS NOT NULL)::int AS "institutionMembers",
        count(*) FILTER (WHERE ${inWindow(today)})::int AS today,
        count(*) FILTER (WHERE ${inWindow(d7)})::int AS last7,
        count(*) FILTER (WHERE ${inWindow(d30)})::int AS last30,
        count(*) FILTER (WHERE ${inWindow(win)})::int AS selected,
        count(*) FILTER (WHERE ${inWindow(win)} AND u."emailVerifiedAt" IS NOT NULL)::int AS "selectedVerified",
        count(*) FILTER (WHERE ${inWindow(win)} AND u."emailVerifiedAt" IS NULL)::int AS "selectedUnverified",
        count(*) FILTER (WHERE ${inWindow(prev)})::int AS previous
      FROM "User" u WHERE ${eligible}`,
    db.$queryRaw`SELECT to_char((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "User" u WHERE ${eligible} AND ${inWindow(win)} GROUP BY 1`,
    db.$queryRaw`SELECT st AS status, count(*)::int AS count FROM (SELECT ${subStatusSql(now, overLimit)} AS st FROM "User" u WHERE ${eligible}) x GROUP BY st`,
    // The cohort registered in the window; of them, the ones with a payment-backed subscription activated by the end of it.
    // Subscription.createdAt is written in the same transaction that marks the Payment Paid, so it is the moment they became a paid subscriber.
    db.$queryRaw`SELECT count(*)::int AS cohort,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Subscription" s JOIN "Payment" p ON p."id" = s."paymentId"
          WHERE s."userId" = u."id" AND s."planName" NOT ILIKE '%trial%' AND p."status" IN ('Paid', 'Success')
            AND s."createdAt" >= u."createdAt" AND s."createdAt" < ${win.end}))::int AS converted
      FROM "User" u WHERE ${eligible} AND ${inWindow(win)}`,
    // Every account, bucketed in a fixed order so the buckets are exclusive. The same rule as eligibleSql, taken apart.
    db.$queryRaw`SELECT count(*)::int AS "allAccounts",
        count(*) FILTER (WHERE u."role" IN (${Prisma.join([...staffRoles])}))::int AS staff,
        count(*) FILTER (WHERE u."role" NOT IN (${Prisma.join([...staffRoles])}) AND u."isDemoAccount" = true)::int AS demo,
        count(*) FILTER (WHERE u."role" NOT IN (${Prisma.join([...staffRoles])}) AND u."isDemoAccount" = false
                           AND u."status" IN (${PENDING_DELETION}, ${DELETED}))::int AS removed,
        count(*) FILTER (WHERE u."role" NOT IN (${Prisma.join([...staffRoles])}) AND u."isDemoAccount" = false
                           AND u."status" NOT IN (${PENDING_DELETION}, ${DELETED}) AND u."purgedAt" IS NOT NULL)::int AS anonymised,
        count(*) FILTER (WHERE ${eligible})::int AS registered,
        count(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL)::int AS "allAccountsVerified",
        count(*) FILTER (WHERE u."lastReadAt" IS NOT NULL)::int AS "allAccountsHaveRead"
      FROM "User" u`,
  ]);

  const by = Object.fromEntries(SUB_STATUSES.map(s => [s, 0])) as Record<SubStatus, number>;
  for (const r of subRows as { status: SubStatus; count: number }[]) by[r.status] = n(r.count);
  const withoutActive = SUB_STATUSES.filter(s => !ACTIVE_STATUSES.includes(s)).reduce((a, s) => a + by[s], 0);

  return {
    generatedAt: now.toISOString(),
    range: { key: rangeKey, fromDay: win.fromDay, toDay: win.toDay, days: win.days },
    previous: { fromDay: prev.fromDay, toDay: prev.toDay },
    cards: { total: n(c.total), today: n(c.today), last7: n(c.last7), last30: n(c.last30), verified: n(c.verified), unverified: n(c.unverified) },
    engagement: { haveRead: n(c.haveRead), neverOpened: n(c.total) - n(c.haveRead) },
    reconciliation: {
      allAccounts: n(rec.allAccounts), staff: n(rec.staff), demo: n(rec.demo), removed: n(rec.removed), anonymised: n(rec.anonymised), registered: n(rec.registered),
      allAccountsVerified: n(rec.allAccountsVerified), allAccountsHaveRead: n(rec.allAccountsHaveRead), institutionMembers: n(c.institutionMembers),
    },
    selected: { registrations: n(c.selected), previousRegistrations: n(c.previous), growth: growth(n(c.selected), n(c.previous)), verified: n(c.selectedVerified), unverified: n(c.selectedUnverified) },
    series: zeroFill((series as { day: string; count: number }[]).map(r => ({ day: r.day, count: n(r.count) })), win),
    subscriptions: { ...by, withoutActive, activePaid: by.paid },
    conversion: conversion(n(conv.cohort), n(conv.converted)),
  };
}

// ── Assigned members ────────────────────────────────────────────────────────

/**
 * Members behind leads assigned to this executive. EXISTS, so one member behind two leads is one row.
 *
 * Ownership is only ever decided by the lead's email, and an address can sit on leads of more than one executive (a signup, then an
 * enquiry, each assigned separately). Whose member that is, is then not knowable, so such a member is listed for nobody: `ambiguousSql`
 * finds them, they are counted for the caller without being named, and nothing about them is returned. Unassigned leads do not count.
 */
const mineSql = (me: string) => Prisma.sql`EXISTS (SELECT 1 FROM "Lead" l WHERE l."assignedToId" = ${me} AND lower(l."email") = lower(u."email"))`;
const otherSql = (me: string) => Prisma.sql`EXISTS (SELECT 1 FROM "Lead" o WHERE o."assignedToId" IS NOT NULL AND o."assignedToId" <> ${me} AND lower(o."email") = lower(u."email"))`;
const assignedSql = (me: string) => Prisma.sql`${mineSql(me)} AND NOT ${otherSql(me)}`;

/** Escape LIKE wildcards so a search for "100%" matches the text and not everything. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;

export interface AssignedQuery {
  page: number; pageSize: number; q?: string;
  verified?: 'yes' | 'no';
  subscription?: SubStatus | 'active' | 'inactive';
  /** The follow-up list: verified members with no running subscription. */
  followUp?: boolean;
}

export async function assignedMembers(db: Db, staffRoles: readonly string[], me: string, query: AssignedQuery, now: Date = new Date()) {
  const overLimit = await overLimitInstitutionIds(db, now);
  const conds: Prisma.Sql[] = [eligibleSql(staffRoles), assignedSql(me)];
  if (query.q) { const p = likePattern(query.q); conds.push(Prisma.sql`(u."displayName" ILIKE ${p} OR u."email" ILIKE ${p} OR u."organization" ILIKE ${p})`); }
  if (query.verified === 'yes' || query.followUp) conds.push(Prisma.sql`u."emailVerifiedAt" IS NOT NULL`);
  if (query.verified === 'no') conds.push(Prisma.sql`u."emailVerifiedAt" IS NULL`);
  const where = Prisma.join(conds, ' AND ');

  const outer: Prisma.Sql[] = [];
  if (query.followUp || query.subscription === 'inactive') outer.push(Prisma.sql`x."subStatus" NOT IN ('paid', 'institution', 'granted')`);
  else if (query.subscription === 'active') outer.push(Prisma.sql`x."subStatus" IN ('paid', 'institution', 'granted')`);
  else if (query.subscription) outer.push(Prisma.sql`x."subStatus" = ${query.subscription}`);
  const outerWhere = outer.length ? Prisma.sql`WHERE ${Prisma.join(outer, ' AND ')}` : Prisma.empty;

  const base = Prisma.sql`SELECT u."displayName" AS name, u."email", u."organization", u."createdAt", (u."emailVerifiedAt" IS NOT NULL) AS verified,
      ${subStatusSql(now, overLimit)} AS "subStatus",
      (SELECT l."id" FROM "Lead" l WHERE l."assignedToId" = ${me} AND lower(l."email") = lower(u."email") ORDER BY l."assignedAt" DESC NULLS LAST LIMIT 1) AS "leadId",
      u."id" AS "_id"
    FROM "User" u WHERE ${where}`;

  const offset = (query.page - 1) * query.pageSize;
  const filteredNow = !!(query.q || query.verified || query.subscription || query.followUp);
  const [rows, [t], [amb], assignedAll] = await Promise.all([
    db.$queryRaw`SELECT x."name", x."email", x."organization", x."createdAt", x."verified", x."subStatus", x."leadId"
      FROM (${base}) x ${outerWhere} ORDER BY x."createdAt" DESC, x."_id" LIMIT ${query.pageSize} OFFSET ${offset}`,
    db.$queryRaw`SELECT count(*)::int AS total FROM (${base}) x ${outerWhere}`,
    db.$queryRaw`SELECT count(*)::int AS n FROM "User" u WHERE ${eligibleSql(staffRoles)} AND ${mineSql(me)} AND ${otherSql(me)}`,
    // Everyone assigned to the caller, whatever the filters: the figure the table's own count is read against.
    filteredNow ? db.$queryRaw`SELECT count(*)::int AS total FROM "User" u WHERE ${eligibleSql(staffRoles)} AND ${assignedSql(me)}` : Promise.resolve(null),
  ]);
  const total = n(t.total);
  return {
    total, assignedTotal: assignedAll ? n((assignedAll as any[])[0].total) : total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)),
    /** Members matching your leads and another executive's too: not listed, because whose they are cannot be told. */
    ambiguous: n(amb.n),
    members: (rows as any[]).map(r => ({
      name: r.name, email: r.email, organization: r.organization, registeredAt: r.createdAt,
      verified: !!r.verified, subscription: r.subStatus as SubStatus, subscriptionLabel: SUB_LABEL[r.subStatus as SubStatus], leadId: r.leadId,
    })),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

interface Deps {
  db: Db;
  authenticateJWT: express.RequestHandler;
  staffRoles: readonly string[];
}

/** Set only on a localhost run against a seeded test database, so the screens say so. Never set in production. */
const isDemo = () => process.env.REGISTRATION_DEMO_DATA === '1';

const SUMMARY_TTL_MS = 60_000;
/** A refresh may recompute at most this often, so the button cannot be used to hammer the database. */
const REFRESH_MIN_AGE_MS = 10_000;

const intIn = (v: unknown, def: number, min: number, max: number) => {
  const x = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
};

export function registrationAnalyticsRouter({ db, authenticateJWT, staffRoles }: Deps): express.Router {
  const r = express.Router();
  const cache = new Map<string, { at: number; body: RegistrationSummary }>();

  r.use(authenticateJWT);
  r.use((req: any, res, next) => {
    if (!(REGISTRATION_ANALYTICS_ROLES as readonly string[]).includes(req.user?.role)) {
      return res.status(403).json({ error: 'Access denied. Registration analytics are for the sales team.' });
    }
    next();
  });
  // Read-only, whatever the caller tries: nothing under this path writes, exports or changes a member.
  r.use((req, res, next) => {
    if (req.method === 'GET') return next();
    res.set('Allow', 'GET').status(405).json({ error: 'Registration analytics are read-only.' });
  });

  r.get('/summary', async (req: any, res) => {
    try {
      const now = new Date();
      const resolved = resolveWindow(String(req.query.range || '30d'), req.query.from as string | undefined, req.query.to as string | undefined, now);
      if (resolved.ok === false) return res.status(400).json({ error: resolved.error });
      const key = `${istDay(now)}|${resolved.key}|${resolved.window.fromDay}|${resolved.window.toDay}`;
      const hit = cache.get(key);
      const refresh = req.query.refresh === '1';
      if (hit && now.getTime() - hit.at < (refresh ? REFRESH_MIN_AGE_MS : SUMMARY_TTL_MS)) {
        res.set('Cache-Control', 'no-store');
        return res.json({ ...hit.body, demo: isDemo() });
      }
      const body = await registrationSummary(db, staffRoles, resolved.window, resolved.key, now);
      if (cache.size > 200) cache.clear();
      cache.set(key, { at: now.getTime(), body });
      res.set('Cache-Control', 'no-store');
      res.json({ ...body, demo: isDemo() });
    } catch (e: any) {
      console.error('registration summary:', e?.message);
      res.status(500).json({ error: 'Could not load registration analytics.' });
    }
  });

  r.get('/users', async (req: any, res) => {
    try {
      const sub = String(req.query.subscription || '');
      const subscription = ([...SUB_STATUSES, 'active', 'inactive'] as string[]).includes(sub) ? (sub as AssignedQuery['subscription']) : undefined;
      const verified = req.query.verified === 'yes' || req.query.verified === 'no' ? (req.query.verified as 'yes' | 'no') : undefined;
      const out = await assignedMembers(db, staffRoles, req.user.uid, {
        page: intIn(req.query.page, 1, 1, 100_000), pageSize: intIn(req.query.pageSize, 25, 1, 50),
        q: String(req.query.q || '').trim().slice(0, 80) || undefined, verified, subscription,
        followUp: req.query.view === 'verified-unsubscribed',
      });
      res.set('Cache-Control', 'no-store');
      res.json({ ...out, demo: isDemo() });
    } catch (e: any) {
      console.error('registration users:', e?.message);
      res.status(500).json({ error: 'Could not load your registered members.' });
    }
  });

  // Follow-ups: the assigned members worth a call, and how many enquiries are waiting (the enquiry workflow itself is untouched).
  r.get('/follow-ups', async (req: any, res) => {
    try {
      const [list, pendingEnquiries] = await Promise.all([
        assignedMembers(db, staffRoles, req.user.uid, { page: 1, pageSize: 8, followUp: true }),
        db.subscriptionRequest.count({ where: { planType: 'Pro', status: 'Pending' } }),
      ]);
      res.set('Cache-Control', 'no-store');
      res.json({ verifiedUnsubscribed: { total: list.total, members: list.members }, pendingEnquiries, demo: isDemo() });
    } catch (e: any) {
      console.error('registration follow-ups:', e?.message);
      res.status(500).json({ error: 'Could not load follow-ups.' });
    }
  });

  // Anything else under this path — an export, a record by id — does not exist.
  r.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  return r;
}
