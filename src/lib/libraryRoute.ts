import { getDashboardRoute, type DashboardAccount } from './dashboardRoute';

/**
 * Where a signed-in account reads the library, from any page that offers it.
 *
 * It is `getDashboardRoute` carried one step further, not a second opinion about who someone is: the account's dashboard decides
 * which shell they belong to, and this says where that shell keeps the content library, its document viewer and its membership page.
 * A reader and a student read in the reader dashboard; an institution account reads in the institution's; a staff account (an
 * administrator, a publisher, sales) has no reading shell of its own, so "browse" leads to its own workspace and the filters are dropped
 * rather than sent somewhere that would bounce it straight back.
 */

export type LibraryPaths = { browse: string; viewer: string; membership: string; reads: boolean };

export function getLibraryPaths(account: DashboardAccount): LibraryPaths {
  const home = getDashboardRoute(account);
  if (home === '/dashboard') return { browse: '/dashboard/library', viewer: '/dashboard/viewer', membership: '/dashboard/pro', reads: true };
  if (home === '/institution') return { browse: '/institution/explore', viewer: '/institution/viewer', membership: '/institution/membership', reads: true };
  return { browse: home, viewer: '/dashboard/viewer', membership: home, reads: false };
}

/** What the content library understands in its address (see StructuredLibrary): department, kind, shelf and archived type. */
export type LibraryFilter = { domain?: string; kind?: 'articles' | 'books'; mode?: 'archived'; atype?: string; sort?: string };

/** The library, already narrowed — one address for every "Browse", "View all" and "See everything" on a signed-in page. */
export function libraryUrl(account: DashboardAccount, filter: LibraryFilter = {}): string {
  const p = getLibraryPaths(account);
  if (!p.reads) return p.browse;
  const q = new URLSearchParams();
  if (filter.mode) q.set('mode', filter.mode);
  if (filter.kind) q.set('kind', filter.kind);
  if (filter.domain) q.set('domain', filter.domain);
  if (filter.atype) q.set('atype', filter.atype);
  if (filter.sort) q.set('sort', filter.sort);
  const s = q.toString();
  return s ? `${p.browse}?${s}` : p.browse;
}
