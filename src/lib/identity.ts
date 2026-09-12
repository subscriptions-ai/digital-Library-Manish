/**
 * What to call a member's dashboard, and how to introduce them on it.
 *
 * The dashboard is named after the role they chose when registering — a
 * Librarian's says Librarian, a working professional's says Working
 * Professional. It costs nothing and it does two things: it tells them the
 * place knows who they are, and it puts the word they chose in front of them
 * often enough that a wrong choice gets noticed and corrected.
 *
 * Everything here degrades to something sensible. Members who registered before
 * any of this have no designation at all, and they must not be greeted by a
 * blank.
 */

export type Identity = {
  displayName?: string | null;
  designation?: string | null;
  organization?: string | null;
  registrantType?: string | null;
  role?: string | null;
};

/** "Librarian Dashboard", or just "Dashboard" if we were never told. */
export function dashboardTitle(p?: Identity | null): string {
  const role = (p?.designation || '').trim();
  return role ? `${role} Dashboard` : 'Dashboard';
}

/**
 * The one line under their name: what they are, and where.
 *
 * Joined with a middle dot and with the empty parts dropped, so a member who
 * gave only one of the two still reads as a sentence rather than as a dangling
 * separator.
 */
export function affiliation(p?: Identity | null): string {
  return [p?.designation, p?.organization].map(x => (x || '').trim()).filter(Boolean).join(' · ');
}
