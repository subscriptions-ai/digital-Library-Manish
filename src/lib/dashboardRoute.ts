/**
 * Where an account's own dashboard is. One answer, read by everything that sends someone there:
 * the sign-in redirect, the Dashboard link in the navbar and the profile menu, and every layout
 * that turns away someone who does not belong in it.
 *
 * The account's working role decides, before the kind of reader it also happens to be. A
 * salesperson is a "Subscriber"-shaped account too, but their dashboard is the Sales Workspace.
 *
 * Every destination listed here is a place that role is allowed into (each layout checks the
 * same roles), so sending someone to it can never bounce them straight back out.
 */

export type DashboardAccount = { role?: string | null; institutionId?: string | null } | null | undefined;

/** The roles that read the library on their own account, and so use /dashboard. */
const READER_ROLES = ['Subscriber', 'Student', 'College', 'University', 'Corporate', 'Normal User'];

export function getDashboardRoute(account: DashboardAccount): string {
  const role = account?.role;
  switch (role) {
    case 'SuperAdmin': return '/admin';
    case 'SubscriptionManager': return '/manager';
    case 'SalesExecutive':
    case 'SalesManager': return '/sales';
    case 'Publisher': return '/publisher';
    case 'ContentManager': return '/studio';
    case 'Institution': return '/institution';
  }
  // A college, university or company account that belongs to an institution is run from the
  // institution dashboard (see isInstitutionAdmin in AuthContext).
  if ((role === 'College' || role === 'University' || role === 'Corporate') && account?.institutionId) return '/institution';
  if (role && !READER_ROLES.includes(role)) {
    // A role this app does not know gets the reader dashboard, which grants nothing extra.
    console.warn(`getDashboardRoute: unrecognised role "${role}", using /dashboard`);
  }
  return '/dashboard';
}
