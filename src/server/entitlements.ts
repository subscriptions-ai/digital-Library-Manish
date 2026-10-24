import { canonicalDepartmentName, CANONICAL_NAMES, entitlementCovers } from '../lib/departmentRegistry.js';

/**
 * Which departments an account may open. The ONE answer, read by the dashboards, the library, search, the department filters and the
 * full-text gate — nothing else decides it, and nothing infers it.
 *
 *   staff (SuperAdmin / Admin / ContentManager)     every department
 *   a subscription that names departments           those departments
 *   a subscription that names none (a Pro approval)  the departments the account selected — it lifts the reading clock and
 *                                                   narrows nothing, widens nothing. It does NOT mean "everything".
 *   a subscription that explicitly says "All Domains"   every department (the only way a plan grants everything)
 *   no subscription                                 the departments the account chose when it registered (the free preview)
 *   an institution member                           the institution's departments: what it has subscribed to, else what its
 *                                                   administrator chose at registration — never more
 *   nothing at all                                  NO department. A missing or empty list is "none", never "all".
 *
 * Departments are canonical official names (departmentRegistry), so "Biotechnology" and "Bio Technology" are one department.
 */

export type EntitlementSource = 'staff' | 'subscription' | 'institution-subscription' | 'selected' | 'institution-selected' | 'none';

export type Entitlement = {
  /** True only for staff and for a subscription that explicitly grants the whole catalogue. */
  all: boolean;
  /** Canonical department names the account may open. Empty when `all` (the list would be a lie) or when there is no access. */
  departments: string[];
  source: EntitlementSource;
  /** What the account itself chose at registration. Informational: it is an entitlement only on the free preview. */
  selected: string[];
  /** The institution's departments, for an institution member; null for an individual. A member can never exceed this. */
  institutionCeiling: { all: boolean; departments: string[] } | null;
};

export type SubscriptionLike = { domains?: unknown; domainName?: string | null; userId?: string | null; institutionId?: string | null };

export const STAFF_FULL_ACCESS_ROLES = ['SuperAdmin', 'Admin', 'ContentManager'];

const ALL_DOMAINS_NAME = /^all domains?$/i;
const KNOWN = new Set(CANONICAL_NAMES);

const toList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } }
  return [];
};

/** The departments an account chose itself, kept to the ones the library holds, as canonical names. */
export function selectedDepartments(value: unknown): string[] {
  return [...new Set(toList(value).map((d) => canonicalDepartmentName(d)).filter((d): d is string => !!d && KNOWN.has(d)))];
}

/**
 * What a set of subscriptions covers. A subscription grants every department only when it says so ("All Domains" with no list, which is
 * what a converted whole-library quotation writes). An empty list with no such name grants NOTHING — it used to grant everything.
 */
export function subscriptionDepartments(subs: SubscriptionLike[]): { all: boolean; departments: string[]; unlisted: boolean } {
  const out = new Set<string>();
  let all = false, unlisted = false;
  for (const s of subs) {
    const list = toList(s.domains).filter(Boolean);
    const name = String(s.domainName || '').trim();
    if (!list.length && ALL_DOMAINS_NAME.test(name)) { all = true; continue; }
    if (!list.length && !name) { unlisted = true; continue; }
    for (const d of list) out.add(canonicalDepartmentName(d) ?? d);
    if (name && !ALL_DOMAINS_NAME.test(name)) out.add(canonicalDepartmentName(name) ?? name);
  }
  return { all, departments: [...out].sort(), unlisted };
}

/** Whether a subscription names no departments at all (so it applies to the account's selected departments). */
export const subscriptionIsUnlisted = (s: SubscriptionLike) => subscriptionDepartments([s]).unlisted;

export type EntitlementInput = {
  role: string;
  institutionId: string | null;
  /** The account's own `interestedDomains`. */
  selected: unknown;
  /** Active subscriptions held by the account itself. */
  ownSubs: SubscriptionLike[];
  /** Active subscriptions held by the account's institution, seat or no seat. */
  institutionSubs: SubscriptionLike[];
  /** What the institution's administrator(s) chose at registration, for an institution with no subscription yet. */
  institutionSelected: unknown[];
};

const sortedUnique = (xs: string[]) => [...new Set(xs)].sort();

/** An institution's departments: what it has bought; before it has bought anything, what its administrator chose at registration. */
export function institutionCeiling(institutionSubs: SubscriptionLike[], institutionSelected: unknown[]): { all: boolean; departments: string[] } {
  const chosen = sortedUnique(institutionSelected.flatMap(selectedDepartments));
  if (!institutionSubs.length) return { all: false, departments: chosen };
  const d = subscriptionDepartments(institutionSubs);
  // A plan that lists no departments covers the ones the institution's administrator chose.
  return { all: d.all, departments: d.unlisted ? sortedUnique([...d.departments, ...chosen]) : d.departments };
}

export function resolveEntitlement(i: EntitlementInput): Entitlement {
  const selected = selectedDepartments(i.selected);
  if (STAFF_FULL_ACCESS_ROLES.includes(i.role)) {
    return { all: true, departments: [], source: 'staff', selected, institutionCeiling: null };
  }

  const own = subscriptionDepartments(i.ownSubs);

  if (!i.institutionId) {
    if (i.ownSubs.length) {
      // A plan that lists no departments applies to the ones the account selected: it lifts the clock, it does not open the catalogue.
      const departments = own.unlisted ? sortedUnique([...own.departments, ...selected]) : own.departments;
      return { all: own.all, departments: own.all ? [] : departments, source: 'subscription', selected, institutionCeiling: null };
    }
    return { all: false, departments: sortedUnique(selected), source: selected.length ? 'selected' : 'none', selected, institutionCeiling: null };
  }

  const ceilingFromSubs = i.institutionSubs.length > 0;
  const ceiling = institutionCeiling(i.institutionSubs, i.institutionSelected);

  // A member's own purchase (a personal plan) adds to the institution's departments; the institution's never exceed the ceiling.
  const all = ceiling.all || own.all;
  const ownDepartments = own.unlisted ? [...own.departments, ...selected] : own.departments;
  const departments = all ? [] : sortedUnique([...ceiling.departments, ...ownDepartments]);
  const source: EntitlementSource = !departments.length && !all ? 'none' : ceilingFromSubs ? 'institution-subscription' : (ceiling.departments.length ? 'institution-selected' : 'subscription');
  return { all, departments, source, selected, institutionCeiling: ceiling };
}

/** Whether an item filed under `department` may be opened. Unclassified content (no department) is never open to a scoped account. */
export function entitlementAllows(e: Entitlement, department: string | null | undefined): boolean {
  if (e.all) return true;
  return entitlementCovers(e.departments, department);
}

/** The scope the catalogue queries take: undefined = whole catalogue, otherwise exactly these departments (possibly none). */
export const scopeOf = (e: Entitlement): string[] | undefined => (e.all ? undefined : e.departments);

/**
 * A requested department narrowed to what the account may open: the request itself when it is allowed, otherwise null (refuse).
 * No request means "everything I may open".
 */
export function narrowToEntitlement(e: Entitlement, requested: string | string[] | null | undefined): string[] | null | undefined {
  const asked = (Array.isArray(requested) ? requested : requested ? [requested] : []).map((d) => String(d).trim()).filter(Boolean);
  if (!asked.length) return scopeOf(e);
  const canon = asked.map((d) => canonicalDepartmentName(d) ?? d);
  if (e.all) return canon;
  const allowed = canon.filter((d) => entitlementCovers(e.departments, d));
  return allowed.length ? allowed : null;
}

/** Where an account's departments come from, in the words the Super Admin's screen uses. */
export type DepartmentSource = 'registration' | 'subscription' | 'institution' | 'all-domains-plan' | 'staff' | 'none';

export function departmentSourceOf(e: Entitlement): DepartmentSource {
  if (e.source === 'staff') return 'staff';
  if (e.all) return 'all-domains-plan';
  if (e.source === 'subscription') return 'subscription';
  if (e.source === 'selected') return 'registration';
  if (e.source === 'institution-subscription' || e.source === 'institution-selected') return 'institution';
  return 'none';
}

/** Whether an account belongs to an institution without being its administrator: its departments are the institution's, not its own pick. */
export const isInstitutionMember = (role: string, institutionId: string | null | undefined) => !!institutionId && role !== 'Institution';

type Db = {
  user: { findUnique: (a: any) => Promise<any>; findMany: (a: any) => Promise<any[]> };
  subscription: { findMany: (a: any) => Promise<any[]> };
};

/** Reads what the resolver needs and resolves it. Two small queries (three for an institution member); nothing is cached across requests. */
export async function loadEntitlement(db: Db, user: { uid: string; role: string; institutionId?: string | null }): Promise<Entitlement> {
  if (STAFF_FULL_ACCESS_ROLES.includes(user.role)) {
    return resolveEntitlement({ role: user.role, institutionId: null, selected: [], ownSubs: [], institutionSubs: [], institutionSelected: [] });
  }
  const me = await db.user.findUnique({ where: { id: user.uid }, select: { institutionId: true, interestedDomains: true } });
  // From the database, never the token: a token issued before the person was removed from their institution still names it.
  const institutionId: string | null = me ? me.institutionId : (user.institutionId ?? null);
  const now = new Date();
  const or: any[] = [{ userId: user.uid }];
  if (institutionId) or.push({ institutionId });
  const subs = await db.subscription.findMany({
    where: { OR: or, status: 'Active', endDate: { gt: now } },
    select: { domains: true, domainName: true, userId: true, institutionId: true },
  });
  const ownSubs = subs.filter((s) => s.userId === user.uid);
  const institutionSubs = institutionId ? subs.filter((s) => s.institutionId === institutionId) : [];
  let institutionSelected: unknown[] = [];
  if (institutionId && (!institutionSubs.length || institutionSubs.some(subscriptionIsUnlisted))) {
    const owners = await db.user.findMany({ where: { institutionId, role: 'Institution' }, select: { interestedDomains: true } });
    institutionSelected = owners.map((o) => o.interestedDomains);
  }
  return resolveEntitlement({ role: user.role, institutionId, selected: me?.interestedDomains ?? [], ownSubs, institutionSubs, institutionSelected });
}

/** The departments an institution as a whole may open — what its dashboard counts. Shares every rule with `loadEntitlement`. */
export async function loadInstitutionDepartments(db: Db, institutionId: string): Promise<{ all: boolean; departments: string[]; source: EntitlementSource }> {
  const subs = await db.subscription.findMany({
    where: { institutionId, status: 'Active', endDate: { gt: new Date() } },
    select: { domains: true, domainName: true },
  });
  let selected: unknown[] = [];
  if (!subs.length || subs.some(subscriptionIsUnlisted)) {
    selected = (await db.user.findMany({ where: { institutionId, role: 'Institution' }, select: { interestedDomains: true } })).map((o) => o.interestedDomains);
  }
  const c = institutionCeiling(subs, selected);
  return { all: c.all, departments: c.all ? [] : c.departments, source: subs.length ? 'institution-subscription' : c.departments.length ? 'institution-selected' : 'none' };
}
