import { getDashboardRoute, type DashboardAccount } from './dashboardRoute';
import { libraryHref, type LibraryState } from './libraryParams';

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

/**
 * What the content library understands in its address — the same parameters it reads back (src/lib/libraryParams.ts), so a link built here and
 * the page it opens cannot disagree about a department, a content type or the shelf.
 */
export type LibraryFilter = Partial<Pick<LibraryState, 'domain' | 'kind' | 'mode' | 'atype' | 'sort' | 'avail' | 'publisher' | 'language' | 'year' | 'oa' | 'q'>>;

/** The library, already narrowed — one address for every "Browse", "View all" and "See everything" on a signed-in page. */
export function libraryUrl(account: DashboardAccount, filter: LibraryFilter = {}): string {
  const p = getLibraryPaths(account);
  if (!p.reads) return p.browse;
  return libraryHref(p.browse, filter);
}
