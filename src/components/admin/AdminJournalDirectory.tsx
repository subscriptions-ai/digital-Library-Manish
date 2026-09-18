import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * Every journal in the catalogue, for the admin.
 *
 * The left panel answers "how many journals do we hold in each department";
 * choosing a department there filters the list on the right. The counts are
 * the server's, over the whole catalogue, never the fifty rows on screen.
 */

type Journal = {
  id: string; title: string; issn: string | null; eissn: string | null;
  publisherName: string | null; domain: string | null; status: string;
  licence: string | null; articleCount: number; firstYear: number | null; lastYear: number | null;
};
type Answer = {
  journals: Journal[]; total: number; page: number; limit: number; catalogue: number; withArticles: number;
  departments: { name: string | null; count: number }[];
  statuses: Record<string, number>;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const n = (x: number) => Number(x || 0).toLocaleString('en-IN');
const NONE = '__none';

export function AdminJournalDirectory() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [articles, setArticles] = useState('');
  const [sort, setSort] = useState('title');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (domain) p.set('domain', domain);
    if (status) p.set('status', status);
    if (articles) p.set('articles', articles);
    p.set('sort', sort);
    return p;
  }, [q, domain, status, articles, sort]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams(params);
    p.set('page', String(page));
    fetch(`/api/admin/journals?${p}`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) toast.error('Could not load journals'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [params, page, reload]);

  const choose = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1); };
  const pickDomain = choose(setDomain);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/journals?${params}&format=csv`, { headers: authHeader() });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `journals-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${n(data?.total || 0)} journals`);
    } catch {
      toast.error('Could not export');
    } finally {
      setExporting(false);
    }
  };

  const departments = data?.departments || [];
  const allInView = departments.reduce((s, d) => s + d.count, 0);
  const maxDept = Math.max(1, ...departments.map(d => d.count));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const filtered = !!(q || domain || status || articles);
  const deptLabel = (name: string | null) => name ?? 'No department';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Journals</h1>
          <p className="mt-1 text-sm text-slate-500">Every journal in the database, and how many each department holds.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReload(r => r + 1)} title="Refresh"
            className="flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm hover:bg-slate-50">
            <RefreshCw size={15} />
          </button>
          <button onClick={exportCsv} disabled={exporting || !data?.total}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export {data ? n(data.total) : ''}
          </button>
        </div>
      </div>

      {/* The figures, for the filters that are set */}
      <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4">
        {[
          { label: 'In the database', value: data?.catalogue, hint: 'every journal' },
          { label: 'Matching', value: data?.total, hint: filtered ? 'these filters' : 'no filter set' },
          { label: 'With articles', value: data?.withArticles, hint: 'of those matching' },
          { label: 'Full text allowed', value: data?.statuses?.Accepted, hint: 'licence checked' },
        ].map(c => (
          <div key={c.label} className="p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{c.value === undefined ? '—' : n(c.value)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Journals per department — choosing one filters the list */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Journals by department</p>
            <p className="text-[11px] text-slate-400">{q || status || articles ? 'for the search and filters set' : 'the whole database'} · click to filter</p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            <button onClick={() => pickDomain('')}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${!domain ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span>All departments</span>
              <span className="tabular-nums">{n(allInView)}</span>
            </button>
            {departments.map(d => {
              const key = d.name ?? NONE;
              const active = domain === key;
              return (
                <button key={key} onClick={() => pickDomain(active ? '' : key)}
                  className={`block w-full rounded-lg px-3 py-2 text-left ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className={`truncate ${active ? 'font-bold text-blue-700' : d.name ? 'text-slate-700' : 'italic text-slate-400'}`}>{deptLabel(d.name)}</span>
                    <span className={`shrink-0 tabular-nums ${active ? 'font-bold text-blue-700' : 'text-slate-500'}`}>{n(d.count)}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-blue-400" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                  </span>
                </button>
              );
            })}
            {!departments.length && !loading && <p className="px-3 py-4 text-sm text-slate-400">No journals match.</p>}
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {/* Search and filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by title, ISSN or publisher…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50" />
            </div>
            {[
              { value: domain, set: pickDomain, label: 'Any department',
                options: departments.map(d => [d.name ?? NONE, `${deptLabel(d.name)} (${n(d.count)})`]) },
              { value: status, set: choose(setStatus), label: 'Any licence',
                options: [['Accepted', `Full text allowed (${n(data?.statuses?.Accepted || 0)})`], ['MetadataOnly', `Metadata only (${n(data?.statuses?.MetadataOnly || 0)})`]] },
              { value: articles, set: choose(setArticles), label: 'Articles: any',
                options: [['with', 'Has articles'], ['without', 'No articles yet']] },
              { value: sort, set: choose(setSort), label: '',
                options: [['title', 'Sort: A to Z'], ['articles', 'Sort: most articles'], ['newest', 'Sort: newest added']] },
            ].map((f, i) => (
              <select key={i} value={f.value} onChange={e => f.set(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium outline-none ${
                  f.label && f.value ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                {f.label && <option value="">{f.label}</option>}
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            {(filtered || search) && (
              <button onClick={() => { setSearch(''); setQ(''); setDomain(''); setStatus(''); setArticles(''); setPage(1); }}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</button>
            )}
          </div>

          {/* The list */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    <th className="border-b border-slate-200 px-5 py-3.5">Journal</th>
                    <th className="border-b border-slate-200 px-5 py-3.5">Department</th>
                    <th className="border-b border-slate-200 px-5 py-3.5">Licence</th>
                    <th className="border-b border-slate-200 px-5 py-3.5 text-right">Articles</th>
                    <th className="border-b border-slate-200 px-5 py-3.5">Years</th>
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50' : ''}>
                  {(data?.journals || []).map(j => (
                    <tr key={j.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="max-w-[420px] px-5 py-3">
                        <a href={`/dashboard/journal/${j.id}`} target="_blank" rel="noopener noreferrer"
                          className="group inline-flex items-start gap-1.5 text-sm font-semibold text-slate-900 hover:text-blue-600">
                          <span>{j.title}</span>
                          <ExternalLink size={12} className="mt-1 shrink-0 opacity-0 group-hover:opacity-60" />
                        </a>
                        <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
                          {[j.issn && `ISSN ${j.issn}`, j.eissn && `eISSN ${j.eissn}`, j.publisherName].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-slate-600">{j.domain || <span className="italic text-slate-400">None</span>}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          j.status === 'Accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {j.status === 'Accepted' ? 'Full text' : j.status === 'MetadataOnly' ? 'Metadata only' : j.status}
                        </span>
                        {j.licence && <p className="mt-0.5 text-[11px] text-slate-400">{j.licence}</p>}
                      </td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-slate-700">{n(j.articleCount)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] tabular-nums text-slate-500">
                        {j.firstYear ? (j.lastYear && j.lastYear !== j.firstYear ? `${j.firstYear}–${j.lastYear}` : j.firstYear) : '—'}
                      </td>
                    </tr>
                  ))}
                  {!loading && data && !data.journals.length && (
                    <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-400">
                      <BookOpen size={22} className="mx-auto mb-2 text-slate-300" />No journals match these filters.
                    </td></tr>
                  )}
                  {loading && !data && (
                    <tr><td colSpan={5} className="px-5 py-14 text-center"><Loader2 className="mx-auto animate-spin text-slate-300" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data && data.total > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {n(data.total)} journal{data.total === 1 ? '' : 's'} · showing {n((data.page - 1) * data.limit + 1)}–{n(Math.min(data.page * data.limit, data.total))}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page"
                    className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /></button>
                  <span className="tabular-nums">Page {n(page)} of {n(pages)}</span>
                  <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page"
                    className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
