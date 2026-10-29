/**
 * What the Content Library keeps in its address, and the one place that reads and writes it.
 *
 * Every "Browse", "View all" and department card, in every reader dashboard, builds its link here, and the library itself reads
 * the address back through `parseLibraryParams`. So a department, a content type and a collection cannot be lost on the way, and
 * a hand-edited or stale address can never put the page into a state the code did not expect: every value is checked, and what
 * is not understood is dropped rather than passed on to a request.
 *
 *   mode     new | archived    which collection (see COLLECTION_HELP — these are two shelves, not "recent" and "old")
 *   kind     articles | books  inside the new collection
 *   domain   a department name
 *   atype    a content type    (Periodicals, Theses, Magazines … ; Books and Periodicals also map to `kind`)
 *   pub      a publisher       (new collection only)
 *   lang     a language        (new collection only; only offered where the records carry one)
 *   year     a publication year
 *   avail    readable | external | metadata
 *   oa       1                 open access verified by a recorded open licence
 *   recent   1                 journals started in the last two years
 *   q, sort, page, jids, vol, iss, asub, atag   as before
 */

export const LIBRARY_PAGE_SIZE = 12;

export type LibraryMode = 'new' | 'archived';
export type LibraryKind = 'articles' | 'books';
export type LibrarySort = 'newest' | 'added' | 'oldest' | 'title';
export type Availability = '' | 'readable' | 'external' | 'metadata';

/** Kept equal to CONTENT_TYPES in src/constants.ts (a test checks it), so this file needs no imports and can run on the server too. */
export const CONTENT_TYPE_NAMES = ['Books', 'Periodicals', 'Magazines', 'Case Reports', 'Theses', 'Conference Proceedings', 'Educational Videos', 'Newsletters'] as const;

export const AVAILABILITY_VALUES = ['readable', 'external', 'metadata'] as const;
export const SORTS_NEW: readonly LibrarySort[] = ['newest', 'added', 'oldest', 'title'];
/** The archived shelf carries no reliable publication date, so it can only be ordered by title or by when it was added. */
export const SORTS_ARCHIVED: readonly LibrarySort[] = ['title', 'added'];

export type LibraryState = {
  mode: LibraryMode;
  kind: LibraryKind;
  domain: string;
  atype: string;
  publisher: string;
  language: string;
  year: string;
  avail: Availability;
  oa: boolean;
  recent: boolean;
  q: string;
  sort: LibrarySort;
  page: number;
  jids: string[];
  vol: string;
  iss: string;
  asub: string[];
  atag: string[];
};

export const DEFAULT_LIBRARY_STATE: LibraryState = {
  mode: 'new', kind: 'articles', domain: '', atype: '', publisher: '', language: '', year: '', avail: '', oa: false, recent: false,
  q: '', sort: 'newest', page: 1, jids: [], vol: '', iss: '', asub: [], atag: [],
};

/** What the two collections are, in the words shown beside the switch. Neither says anything about age or about whether you may read. */
export const COLLECTION_HELP: Record<LibraryMode, { label: string; short: string }> = {
  new: { label: 'New Collection', short: 'The structured catalogue: journals, articles and books, described down to the article.' },
  archived: { label: 'Archived', short: 'The original library: theses, magazines, case reports, proceedings and more. Open to your plan like the rest.' },
};

const clean = (v: string | null | undefined, max: number) => (v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (v: string | null, max = 20, each = 160) => (v ? v.split('~').map(s => clean(s, each)).filter(Boolean).slice(0, max) : []);
const intIn = (v: string | null, lo: number, hi: number) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

const typeByLower = new Map<string, string>(CONTENT_TYPE_NAMES.map(t => [t.toLowerCase(), t]));
/** A content type exactly as the catalogue spells it, or '' when the text is not one. */
export const canonicalContentType = (v: string | null | undefined): string => typeByLower.get(clean(v, 60).toLowerCase()) ?? '';

/** Reads an address into a state that is safe to render and to send. Anything not understood is dropped, never guessed. */
export function parseLibraryParams(sp: URLSearchParams): LibraryState {
  const mode: LibraryMode = sp.get('mode') === 'archived' ? 'archived' : 'new';
  const sorts = mode === 'archived' ? SORTS_ARCHIVED : SORTS_NEW;
  const sortRaw = sp.get('sort') as LibrarySort | null;
  // The default depends on the shelf: newest-first exists only where publication years do.
  const sort: LibrarySort = sortRaw && sorts.includes(sortRaw) ? sortRaw : (mode === 'archived' ? 'title' : 'newest');
  const avail = (AVAILABILITY_VALUES as readonly string[]).includes(sp.get('avail') || '') ? (sp.get('avail') as Availability) : '';
  const year = intIn(sp.get('year'), 1000, 2100);
  return {
    mode,
    kind: sp.get('kind') === 'books' ? 'books' : 'articles',
    domain: clean(sp.get('domain'), 120),
    atype: canonicalContentType(sp.get('atype')),
    publisher: clean(sp.get('pub'), 200),
    language: clean(sp.get('lang'), 40),
    year: year === null ? '' : String(year),
    avail,
    oa: sp.get('oa') === '1',
    recent: sp.get('recent') === '1',
    q: clean(sp.get('q'), 200),
    sort,
    page: intIn(sp.get('page'), 1, 100000) ?? 1,
    jids: list(sp.get('jids'), 20, 64),
    vol: clean(sp.get('vol'), 40),
    iss: clean(sp.get('iss'), 40),
    asub: list(sp.get('asub')),
    atag: list(sp.get('atag')),
  };
}

/** The shortest address that says this state: defaults are left out, so two readers looking at the same thing share one URL. */
export function toSearchParams(s: LibraryState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.mode !== 'new') p.set('mode', s.mode);
  if (s.mode === 'new' && s.kind !== 'articles') p.set('kind', s.kind);
  if (s.domain) p.set('domain', s.domain);
  if (s.atype) p.set('atype', s.atype);
  if (s.publisher) p.set('pub', s.publisher);
  if (s.language) p.set('lang', s.language);
  if (s.year) p.set('year', s.year);
  if (s.avail) p.set('avail', s.avail);
  if (s.oa) p.set('oa', '1');
  if (s.recent) p.set('recent', '1');
  if (s.q) p.set('q', s.q);
  const dflt = s.mode === 'archived' ? 'title' : 'newest';
  if (s.sort !== dflt) p.set('sort', s.sort);
  if (s.jids.length) p.set('jids', s.jids.join('~'));
  if (s.vol) p.set('vol', s.vol);
  if (s.iss) p.set('iss', s.iss);
  if (s.asub.length) p.set('asub', s.asub.join('~'));
  if (s.atag.length) p.set('atag', s.atag.join('~'));
  if (s.page > 1) p.set('page', String(s.page));
  return p;
}

/**
 * The fields whose change makes the current page number meaningless. Page 20 of one result set is not a place to stay when the set changes,
 * so any of these changing (and `page` not being set in the same change) sends the reader back to page 1.
 */
const RESETS_PAGE: (keyof LibraryState)[] = ['mode', 'kind', 'domain', 'atype', 'publisher', 'language', 'year', 'avail', 'oa', 'recent', 'q', 'sort', 'jids', 'vol', 'iss', 'asub', 'atag'];

/** A state with `patch` applied, going back to page 1 when the patch changes what is being listed. Dependent filters are cleared with it. */
export function applyPatch(cur: LibraryState, patch: Partial<LibraryState>): LibraryState {
  const next: LibraryState = { ...cur, ...patch };
  const changed = (k: keyof LibraryState) => JSON.stringify(cur[k]) !== JSON.stringify(next[k]);
  if (changed('mode')) {
    // The two shelves share a department and a search, nothing else.
    next.kind = patch.kind ?? 'articles'; next.atype = patch.atype ?? ''; next.publisher = ''; next.language = ''; next.year = ''; next.avail = ''; next.oa = false; next.recent = false;
    next.jids = []; next.vol = ''; next.iss = ''; next.asub = []; next.atag = [];
    if (!(next.mode === 'archived' ? SORTS_ARCHIVED : SORTS_NEW).includes(next.sort)) next.sort = next.mode === 'archived' ? 'title' : 'newest';
  }
  if (changed('kind') && !changed('mode')) { next.jids = []; next.vol = ''; next.iss = ''; next.recent = false; next.atype = patch.atype ?? ''; next.publisher = ''; }
  if (changed('domain')) { next.publisher = ''; next.jids = []; next.vol = ''; next.iss = ''; next.asub = []; next.atag = []; }
  if (changed('atype') && !changed('mode') && !changed('kind')) { next.asub = []; next.atag = []; next.jids = []; next.vol = ''; next.iss = ''; }
  if (changed('year') && cur.jids.length) { next.vol = ''; next.iss = ''; }
  if (changed('vol')) next.iss = '';
  if (changed('asub')) next.atag = [];
  // What the caller named explicitly wins over what a change clears: `{ domain, publisher }` keeps its publisher.
  Object.assign(next, patch);
  if (!('page' in patch) && RESETS_PAGE.some(changed)) next.page = 1;
  return next;
}

/** What an account can open, as far as the library's own switches are concerned. Unknown (not yet loaded) is `null`: nothing is decided early. */
export type LibraryCaps = { hasArchive: boolean; hasArticles: boolean; hasBooks: boolean; departments: string[] | null };

export type ResolveNotice = 'archive-unavailable' | 'books-unavailable' | null;

/**
 * Makes a requested state agree with what the account can actually open, WITHOUT changing what was asked for without saying so.
 *
 * The archived shelf is only offered where the account holds something on it. An address that asks for it anyway (a Books card from a
 * dashboard whose books live in the new collection, an old bookmark) is carried across to where those items are — Books to the Books
 * shelf, Periodicals to Articles — instead of being dropped onto Articles with the Books label still showing, which is what put a
 * "Books" chip over 1,218 articles. A type that exists only on the archived shelf cannot be carried anywhere, and is reported.
 */
export function resolveForAccess(s: LibraryState, caps: LibraryCaps): { state: LibraryState; notice: ResolveNotice } {
  let state = { ...s };
  let notice: ResolveNotice = null;
  if (state.mode === 'archived' && !caps.hasArchive) {
    if (state.atype === 'Books') { state = { ...state, mode: 'new', kind: 'books', atype: '', asub: [], atag: [] }; }
    else if (state.atype === 'Periodicals' || state.atype === '') { state = { ...state, mode: 'new', kind: 'articles', atype: '', asub: [], atag: [] }; }
    else { state = { ...state, mode: 'new', kind: 'articles', asub: [], atag: [] }; notice = 'archive-unavailable'; }
    state.sort = (SORTS_NEW as readonly string[]).includes(state.sort) ? state.sort : 'newest';
  }
  if (state.mode === 'new' && state.kind === 'books' && !caps.hasBooks && caps.hasArticles) { state = { ...state, kind: 'articles' }; notice = 'books-unavailable'; }
  if (state.mode === 'new' && state.kind === 'articles' && state.atype === 'Books') { state = { ...state, kind: 'books', atype: '' }; }
  if (state.mode === 'new' && state.kind === 'books') state = { ...state, atype: '', jids: [], vol: '', iss: '', recent: false };
  return { state, notice };
}

/** One row of the access overview: a content type inside a department, with how many of its items sit on each shelf. */
export type AccessModule = { contentType: string; legacyCount?: number; newCount?: number };

/**
 * Where "Browse" for one content type in one department leads. Counts say where the items are: items in the new collection are on the
 * new shelf (Books under `kind=books`, other types under their own content type), the rest are on the archived shelf. When both hold
 * some, the new collection leads — the archived items are one switch away and the screen offers it.
 */
export function browseStateFor(mod: AccessModule, domain: string): Partial<LibraryState> {
  const base: Partial<LibraryState> = { domain };
  const inNew = (mod.newCount ?? 0) > 0;
  const inArchive = (mod.legacyCount ?? 0) > 0;
  if (inNew || !inArchive) {
    if (mod.contentType === 'Books') return { ...base, mode: 'new', kind: 'books' };
    if (mod.contentType === 'Periodicals') return { ...base, mode: 'new', kind: 'articles' };
    return { ...base, mode: 'new', kind: 'articles', atype: canonicalContentType(mod.contentType) };
  }
  return { ...base, mode: 'archived', atype: canonicalContentType(mod.contentType) };
}

/** `base` + the shortest address for a state, e.g. `/institution/explore?domain=Applied+Sciences&kind=books`. */
export function libraryHref(base: string, patch: Partial<LibraryState> = {}): string {
  const s = toSearchParams(applyPatch(DEFAULT_LIBRARY_STATE, patch)).toString();
  return s ? `${base}?${s}` : base;
}
