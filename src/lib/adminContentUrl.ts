import { NO_DEPARTMENT, type Collection, type ContentSort } from './adminContent';

/**
 * What an admin content table keeps in its address, read and written in one place: collection, search, status, public-only, department, sort
 * and page. A refresh, a pasted link and the browser's Back button all land on the same table, and a value the page does not understand is
 * dropped instead of being sent to the server.
 *
 *   collection  new | archived   (absent = the reader has not chosen; the page then opens the New collection and never switches on its own)
 *   q           search text
 *   status      Published | Draft | Rejected
 *   visibility  public           (absent = every record)
 *   domain      a department name, or "__none" for Unassigned
 *   sort        added | oldest | title
 *   page        1, 2, …
 */

export type AdminListState = {
  collection: Collection | '';
  q: string;
  status: '' | 'Published' | 'Draft' | 'Rejected';
  visibility: '' | 'public';
  domain: string;
  sort: ContentSort;
  page: number;
};

export const DEFAULT_ADMIN_LIST: AdminListState = { collection: '', q: '', status: '', visibility: '', domain: '', sort: 'added', page: 1 };

const clean = (v: string | null, max: number) => (v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseAdminList(sp: URLSearchParams): AdminListState {
  const c = sp.get('collection');
  const st = sp.get('status');
  const sort = sp.get('sort');
  const page = Number(sp.get('page'));
  return {
    collection: c === 'archived' || c === 'new' ? c : '',
    q: clean(sp.get('q'), 200),
    status: st === 'Published' || st === 'Draft' || st === 'Rejected' ? st : '',
    visibility: sp.get('visibility') === 'public' ? 'public' : '',
    domain: sp.get('domain') === NO_DEPARTMENT ? NO_DEPARTMENT : clean(sp.get('domain'), 120),
    sort: sort === 'oldest' || sort === 'title' ? sort : 'added',
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
  };
}

export function toAdminParams(s: AdminListState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.collection) p.set('collection', s.collection);
  if (s.q) p.set('q', s.q);
  if (s.status) p.set('status', s.status);
  if (s.visibility) p.set('visibility', s.visibility);
  if (s.domain) p.set('domain', s.domain);
  if (s.sort !== 'added') p.set('sort', s.sort);
  if (s.page > 1) p.set('page', String(s.page));
  return p;
}

const RESETS_PAGE: (keyof AdminListState)[] = ['collection', 'q', 'status', 'visibility', 'domain', 'sort'];

/** A state with `patch` applied. Anything that changes what is listed returns to page 1; "public only" and a status do not coexist. */
export function applyAdminPatch(cur: AdminListState, patch: Partial<AdminListState>): AdminListState {
  const next: AdminListState = { ...cur, ...patch };
  if (patch.visibility === 'public' && !('status' in patch)) next.status = '';
  if (patch.status && !('visibility' in patch)) next.visibility = '';
  // The statuses differ by collection: Rejected exists only in the New one.
  if (next.collection === 'archived' && next.status === 'Rejected') next.status = '';
  if (!('page' in patch) && RESETS_PAGE.some(k => cur[k] !== next[k])) next.page = 1;
  return next;
}

/** Filters that narrow the table (the collection and the sort are not narrowing). */
export const isNarrowed = (s: AdminListState) => !!(s.q || s.status || s.visibility || s.domain);
