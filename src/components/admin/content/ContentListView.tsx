import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, EyeOff, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import Papa from 'papaparse';

import { NO_DEPARTMENT, SECTION_LABELS, isSection, type AdminSection, type Collection } from '../../../lib/adminContent';
import { applyAdminPatch, isNarrowed, parseAdminList, toAdminParams, type AdminListState } from '../../../lib/adminContentUrl';
import { useMinWidth } from '../../../lib/useModalFocus';
import { DEPARTMENT_PANEL_MIN_WIDTH, DepartmentDrawer, DepartmentPanel, SectionSummary, useSectionOverview } from './ContentOverview';

interface ContentListViewProps {
  contentType: string;
}

const LIMIT = 15;
const PANEL_KEY = 'admin-dept-panel-open';

/**
 * One admin content section: the same list for Books, Periodicals, Magazines, Case Reports, Theses, Conference Proceedings, Educational Videos and
 * Newsletters. What one record IS differs by section and collection (src/lib/adminContent.ts) and the page says so; the department counts, the
 * table and the Export all use one filter on the server, so they cannot disagree.
 *
 * The ADDRESS is the state (collection, search, status, public-only, department, sort, page): a refresh, a pasted link and Back all return to
 * the same table. A change of filter writes a new address, so Back steps through them; typing in the search replaces the entry.
 */
export function ContentListView({ contentType }: ContentListViewProps) {
  const navigate = useNavigate();
  const section: AdminSection = isSection(contentType) ? contentType : 'Periodicals';
  const L = SECTION_LABELS[section];
  const slug = contentType.toLowerCase().replace(/\s+/g, '-');
  const kind = section === 'Books' ? 'book' : 'article';

  const [sp, setSp] = useSearchParams();
  const spKey = sp.toString();
  const s: AdminListState = useMemo(() => parseAdminList(new URLSearchParams(spKey)), [spKey]);
  // Never switched on the reader's behalf: an explicitly chosen collection stays, empty or not.
  const collection: Collection = s.collection || 'new';
  const update = useCallback((patch: Partial<AdminListState>, o: { replace?: boolean } = {}) => {
    setSp(toAdminParams(applyAdminPatch({ ...s, collection }, patch)), { replace: !!o.replace, preventScrollReset: true });
  }, [s, collection, setSp]);
  // An address in an odd form (an unknown status, a page of 0) is rewritten to its canonical form.
  const canonical = toAdminParams(s).toString();
  useEffect(() => { if (canonical !== spKey) setSp(new URLSearchParams(canonical), { replace: true, preventScrollReset: true }); }, [canonical, spKey, setSp]);

  const [items, setItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // ── search: its own text while typing, the address after a pause ──
  const [search, setSearch] = useState(s.q);
  useEffect(() => { setSearch(s.q); }, [s.q]);
  useEffect(() => {
    if (search === s.q) return;
    const t = setTimeout(() => update({ q: search }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [search, s.q, update]);

  // The department counts follow search and status, not the department chosen (so choosing one never empties the others).
  const overview = useSectionOverview(section, collection, s.q, s.status);
  const other: Collection = collection === 'new' ? 'archived' : 'new';
  const counts = overview.data?.collections;
  const otherTotal = counts ? counts[other]?.total : undefined;
  const archivedVisible = !counts || counts.archived !== null;

  // ── the department panel (wide) or drawer (narrower) ──
  const wide = useMinWidth(DEPARTMENT_PANEL_MIN_WIDTH);
  const [panelOpen, setPanelOpen] = useState(() => { try { return localStorage.getItem(PANEL_KEY) !== '0'; } catch { return true; } });
  const togglePanel = () => setPanelOpen(o => { const v = !o; try { localStorage.setItem(PANEL_KEY, v ? '1' : '0'); } catch { /* a stored preference is a convenience */ } return v; });
  const deptLabel = s.domain === NO_DEPARTMENT ? 'Unassigned' : s.domain || 'All';
  const facetProps = { state: overview, domain: s.domain, onPick: (d: string) => update({ domain: d }), visibility: s.visibility, section, collection };

  // ── the table ──
  const query = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    contentType, page: String(s.page), limit: String(LIMIT), sort: s.sort,
    ...(s.q && { search: s.q }), ...(s.domain && { domain: s.domain }), ...(s.status && { status: s.status }), ...(s.visibility && { visibility: s.visibility }), ...extra,
  }), [contentType, s]);
  const base = collection === 'archived' ? '/api/admin/content' : '/api/admin/library/items';
  const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    fetch(`${base}?${query()}`, { ...authHdr(), signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(({ data, total }) => { setItems(data); setTotal(total); setSelectedItems([]); setLoadFailed(false); setLoading(false); })
      // A failed request is an error with a retry. It is never turned into "no records".
      .catch(e => { if (e?.name === 'AbortError') return; setLoadFailed(true); setLoading(false); });
    return () => ctl.abort();
  }, [base, query, retryKey]);

  // A page past the end (an old link, a filter that shrank the list) goes to the last page instead of showing an empty one.
  useEffect(() => {
    if (!loading && !loadFailed && total > 0 && items.length === 0 && s.page > 1) update({ page: Math.ceil(total / LIMIT) }, { replace: true });
  }, [loading, loadFailed, total, items.length, s.page, update]);

  const refresh = () => { setRetryKey(k => k + 1); overview.retry(); };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item permanently?')) return;
    try {
      const url = collection === 'archived' ? `/api/admin/content/${id}` : `/api/admin/library/items/${kind}/${id}`;
      const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) throw new Error(String(r.status));
      toast.success('Item deleted'); refresh();
    } catch { toast.error('Delete failed'); }
  };

  const handleTogglePublish = async (item: any) => {
    const newStatus = String(item.status).toLowerCase() === 'published' ? 'Draft' : 'Published';
    try {
      const url = collection === 'archived' ? `/api/admin/content/${item.id}` : `/api/admin/library/items/${kind}/${item.id}`;
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ status: newStatus }) });
      if (!r.ok) throw new Error(String(r.status));
      toast.success(`Item ${newStatus === 'Published' ? 'published' : 'unpublished'}`); refresh();
    } catch { toast.error('Status update failed'); }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => setSelectedItems(e.target.checked ? items.map(i => i.id) : []);
  const handleSelectItem = (id: string) => setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleBulkAction = async (action: 'Publish' | 'Draft' | 'Delete') => {
    if (!confirm(`Are you sure you want to ${action} ${selectedItems.length} items?`)) return;
    try {
      const res = collection === 'archived'
        ? await fetch('/api/admin/content/bulk-action', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ action, contentIds: selectedItems }) })
        : await fetch('/api/admin/library/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ action, kind, ids: selectedItems }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(result.message); setSelectedItems([]); refresh();
    } catch (err: any) { toast.error(err.message || 'Bulk action failed'); }
  };

  const handleExport = async () => {
    try {
      toast.loading('Exporting data...', { id: 'export' });
      const res = await fetch(`${base}?${query({ page: '1', limit: '100000' })}`, authHdr());
      if (!res.ok) throw new Error('Export failed');
      const { data, total: matching } = await res.json();
      if (!data || data.length === 0) { toast.error('No data to export', { id: 'export' }); return; }
      // The server returns at most 100,000 rows to one request. A file that quietly holds the first 100,000 of 1,197,102 records is worse than no file,
      // so a partial export says so, in the message and in the file name.
      const partial = typeof matching === 'number' && matching > data.length;
      const csv = Papa.unparse(data.map((item: any) => ({
        Title: item.title, Authors: item.authors, Domain: item.domain, SubjectArea: item.subjectArea, ContentType: item.contentType, AccessType: item.accessType, Status: item.status,
        PublishedAt: item.publishedAt ? format(new Date(item.publishedAt), 'yyyy-MM-dd HH:mm:ss') : '', URL: item.fileUrl,
      })));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${contentType.replace(/\s+/g, '_')}_Export_${format(new Date(), 'yyyyMMdd')}${partial ? `_first_${data.length}_of_${matching}` : ''}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      if (partial) toast(`Exported the first ${data.length.toLocaleString('en-IN')} of ${matching.toLocaleString('en-IN')} matching records. Narrow the filters (a department, a status) to export the rest.`, { id: 'export', duration: 9000, icon: '⚠️' });
      else toast.success('Export successful', { id: 'export' });
    } catch { toast.error('Export failed', { id: 'export' }); }
  };

  const totalPages = Math.ceil(total / LIMIT) || 1;
  const narrowed = isNarrowed(s);
  const clearFilters = () => { setSearch(''); update({ q: '', status: '', visibility: '', domain: '' }); };
  const collName = (c: Collection) => (c === 'new' ? 'New' : 'Archived');
  const pickCollection = (c: Collection) => update({ collection: c });
  const showTable = (
    <div className="min-w-0 space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <label htmlFor="admin-content-search" className="sr-only">Search {L.plural}</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} aria-hidden="true" />
          <input id="admin-content-search" type="text" placeholder={section === 'Books' ? 'Title, author, ISBN or publisher…' : section === 'Periodicals' && collection === 'new' ? 'Title, author, journal or DOI…' : 'Title or author…'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-64 max-w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-500 sm:w-72" />
        </div>
        {!wide && <DepartmentDrawer {...facetProps} label={deptLabel} />}
        {wide && !panelOpen && <DepartmentPanel {...facetProps} open={false} onToggle={togglePanel} />}
        <div className="relative">
          <label htmlFor="admin-content-status" className="sr-only">Status</label>
          <select id="admin-content-status" value={s.status} onChange={e => update({ status: e.target.value as any })}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500">
            <option value="">All status</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
            {collection === 'new' && <option value="Rejected">Rejected</option>}
            <option value="Other">Other status</option>
          </select>
          <Filter size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        </div>
        <div role="group" aria-label="What is shown" className="inline-flex rounded-xl bg-slate-100 p-0.5">
          {([['', 'All records'], ['public', 'Public only']] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={s.visibility === v} onClick={() => update({ visibility: v })}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${s.visibility === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <label htmlFor="admin-content-sort" className="sr-only">Sort</label>
          <select id="admin-content-sort" value={s.sort} onChange={e => update({ sort: e.target.value as any })}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500">
            <option value="added">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
          <Filter size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={handleExport} className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200">Export CSV</button>
          {/* The one way to create a record in this section (the module's tabs do not repeat it). */}
          <button onClick={() => navigate(`/admin/${slug}/new`)} className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
            <Plus size={16} aria-hidden="true" /> Add {L.singular}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite">
        <p className="text-slate-600">
          <span className="font-bold tabular-nums text-slate-900">{loading && !items.length ? '…' : loadFailed ? '—' : total.toLocaleString('en-IN')}</span>{' '}
          {total === 1 && !loadFailed ? L.one : L.plural} match
          {s.domain ? <> in <span className="font-semibold">{deptLabel}</span></> : null}
          {s.visibility === 'public' ? ', public only' : ''} · <span className="text-slate-500">{collName(collection)} collection</span>
        </p>
        {narrowed && <button type="button" onClick={clearFilters} className="rounded-lg px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800">Clear filters</button>}
      </div>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
          <span className="font-bold">{selectedItems.length} selected</span>
          <button onClick={() => handleBulkAction('Publish')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Publish</button>
          <button onClick={() => handleBulkAction('Draft')} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Draft</button>
          <div className="flex-1" />
          <button onClick={() => handleBulkAction('Delete')} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"><Trash2 size={13} aria-hidden="true" /> Delete all</button>
        </div>
      )}

      {/* Table: it scrolls inside its own box if it must; the page never does. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-12 border-r border-slate-100 px-4 py-3 text-center">
                  <input type="checkbox" aria-label="Select all on this page" onChange={handleSelectAll} checked={items.length > 0 && selectedItems.length === items.length} className="h-4 w-4 cursor-pointer rounded text-blue-600" />
                </th>
                <th className="min-w-[260px] px-4 py-3 font-semibold text-slate-600">Title &amp; author</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Department</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Access</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">Added</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="sticky right-0 bg-slate-50 px-4 py-3 text-right font-semibold text-slate-600 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />Loading…</div>
                </td></tr>
              ) : loadFailed ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-600" role="alert">
                  <span className="inline-flex items-center gap-2"><AlertCircle size={16} className="text-amber-600" aria-hidden="true" /> Could not load {L.plural}. This is not an empty collection.</span>{' '}
                  <button type="button" onClick={refresh} className="font-bold text-blue-600 hover:underline">Retry</button>
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-500">
                  {narrowed ? (
                    <>No {L.plural} in the {collName(collection)} collection match these filters. <button type="button" onClick={clearFilters} className="font-bold text-blue-600 hover:underline">Clear filters</button></>
                  ) : (
                    <>
                      <p>There are no {L.plural} in the {collName(collection)} collection.</p>
                      {typeof otherTotal === 'number' && otherTotal > 0 && (other !== 'archived' || archivedVisible) && (
                        <button type="button" onClick={() => pickCollection(other)} className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                          Open the {collName(other)} collection ({otherTotal.toLocaleString('en-IN')} {L.plural})
                        </button>
                      )}
                    </>
                  )}
                </td></tr>
              ) : items.map(item => (
                <tr key={item.id} className={`align-top transition-colors ${selectedItems.includes(item.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                  <td className="border-r border-slate-50 px-4 py-3 text-center">
                    <input type="checkbox" aria-label={`Select ${item.title}`} checked={selectedItems.includes(item.id)} onChange={() => handleSelectItem(item.id)} className="h-4 w-4 cursor-pointer rounded text-blue-600" />
                  </td>
                  <td className="px-4 py-3">
                    <ClampedTitle title={item.title} />
                    <AuthorList authors={item.authors} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.domain || <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.accessType === 'Free' ? 'bg-emerald-100 text-emerald-700' : item.accessType === 'Subscription' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{item.accessType}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{item.publishedAt ? format(new Date(item.publishedAt), 'dd MMM yy') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${String(item.status).toLowerCase() === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span>
                  </td>
                  <td className={`sticky right-0 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)] ${selectedItems.includes(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleTogglePublish(item)} title={String(item.status).toLowerCase() === 'published' ? 'Unpublish' : 'Publish'} aria-label={`${String(item.status).toLowerCase() === 'published' ? 'Unpublish' : 'Publish'} ${item.title}`}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600">
                        {String(item.status).toLowerCase() === 'published' ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                      </button>
                      {item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer" aria-label={`Open the file of ${item.title}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"><ExternalLink size={15} aria-hidden="true" /></a>}
                      <button onClick={() => navigate(`/admin/${slug}/${item.id}${collection === 'archived' ? '?src=archived' : ''}`)} title="Edit" aria-label={`Edit ${item.title}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"><Edit size={15} aria-hidden="true" /></button>
                      <button onClick={() => handleDelete(item.id)} title="Delete" aria-label={`Delete ${item.title}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={15} aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > 0 && !loadFailed && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4">
            <span className="text-xs text-slate-500">Showing {(s.page - 1) * LIMIT + 1}–{Math.min(s.page * LIMIT, total)} of {total.toLocaleString('en-IN')} entries</span>
            <div className="flex items-center gap-2">
              <button disabled={s.page <= 1} onClick={() => update({ page: s.page - 1 })} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40">← Prev</button>
              <span className="px-3 py-1 text-xs text-slate-600">Page {s.page} / {totalPages}</span>
              <button disabled={s.page >= totalPages} onClick={() => update({ page: s.page + 1 })} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      {/* Collection: New (structured) vs Archived (legacy). Two collections, not statuses. */}
      <div className="flex w-fit max-w-full items-center gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Collection">
        {(['new', 'archived'] as const).filter(c => c === 'new' || archivedVisible).map(c => (
          <button key={c} type="button" aria-pressed={collection === c} onClick={() => pickCollection(c)}
            title={c === 'new' ? 'The structured catalogue collection' : 'The older imported collection. Published archived items are listed publicly too.'}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${collection === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {collName(c)}
            <span className="ml-1 text-[10px] font-bold text-slate-400">{counts ? Number(counts[c]?.total ?? 0).toLocaleString('en-IN') : '—'}</span>
          </button>
        ))}
      </div>

      <SectionSummary state={overview} section={section} collection={collection} />

      {wide && panelOpen ? (
        <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6">
          <DepartmentPanel {...facetProps} open onToggle={togglePanel} />
          {showTable}
        </div>
      ) : showTable}
    </div>
  );
}

/** A title on up to two lines, with its full text one control away. The control appears only when the title is actually cut. */
function ClampedTitle({ title }: { title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { if (!open) setCut(el.scrollHeight > el.clientHeight + 1); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [title, open]);
  return (
    <div>
      <div ref={ref} className={`font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] ${open ? '' : 'line-clamp-2'}`} title={cut && !open ? title : undefined}>{title}</div>
      {(cut || open) && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="mt-0.5 text-[11px] font-bold text-blue-600 hover:underline">{open ? 'Show less' : 'Show full title'}</button>
      )}
    </div>
  );
}

/** Two names, then "+N more" which opens the rest. */
function AuthorList({ authors }: { authors?: string | null }) {
  const [open, setOpen] = useState(false);
  const names = useMemo(() => {
    const t = String(authors || '').trim();
    if (!t) return [];
    return (t.includes(';') ? t.split(';') : t.split(',')).map(x => x.trim()).filter(Boolean);
  }, [authors]);
  if (!names.length) return null;
  const shown = open ? names : names.slice(0, 2);
  return (
    <p className="mt-0.5 text-xs text-slate-500 [overflow-wrap:anywhere]">
      {shown.join(', ')}
      {names.length > 2 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="ml-1.5 font-bold text-blue-600 hover:underline">{open ? 'Show fewer' : `+${names.length - 2} more`}</button>
      )}
    </p>
  );
}
