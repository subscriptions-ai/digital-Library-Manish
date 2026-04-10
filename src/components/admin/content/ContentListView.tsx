import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const DOMAINS = ['Medical', 'Engineering', 'Pharmacy', 'Nursing', 'Management', 'Arts & Humanities', 'Law', 'Others'];

interface ContentListViewProps {
  contentType: string;
}

export function ContentListView({ contentType }: ContentListViewProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const slug = contentType.toLowerCase().replace(/\s+/g, '-');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        contentType,
        page: page.toString(),
        limit: limit.toString(),
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(domainFilter && { domain: domainFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/admin/content?${query}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to load');
      const { data, total } = await res.json();
      setItems(data);
      setTotal(total);
      setSelectedItems([]);
    } catch {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [contentType, debouncedSearch, domainFilter, statusFilter, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item permanently?')) return;
    try {
      await fetch(`/api/admin/content/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Item deleted');
      fetchItems();
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleTogglePublish = async (item: any) => {
    const newStatus = item.status === 'Published' ? 'Draft' : 'Published';
    try {
      await fetch(`/api/admin/content/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Item ${newStatus === 'Published' ? 'published' : 'unpublished'}`);
      fetchItems();
    } catch {
      toast.error('Status update failed');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedItems(items.map(i => i.id));
    else setSelectedItems([]);
  };

  const handleSelectItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkAction = async (action: 'Publish' | 'Draft' | 'Delete') => {
    if (!confirm(`Are you sure you want to ${action} ${selectedItems.length} items?`)) return;
    try {
      const res = await fetch('/api/admin/content/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ action, contentIds: selectedItems })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(result.message);
      setSelectedItems([]);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || 'Bulk action failed');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder={`Search title or author...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-blue-500 w-64"
            />
          </div>
          <div className="relative">
            <select value={domainFilter} onChange={e => { setDomainFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-blue-500"
            >
              <option value="">All Domains</option>
              {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <Filter size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="Published">Published</option>
              <option value="Draft">Draft</option>
            </select>
            <Filter size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <button
          onClick={() => navigate(`/admin/${slug}/new`)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shrink-0 transition-colors"
        >
          <Plus size={16} /> Add {contentType.replace(/s$/, '')}
        </button>
      </div>

      {/* Bulk Action Bar */}
      {selectedItems.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2">
          <span className="font-bold">{selectedItems.length} selected</span>
          <div className="h-4 w-px bg-blue-200 mx-1 border-hidden" />
          <button onClick={() => handleBulkAction('Publish')} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">Publish</button>
          <button onClick={() => handleBulkAction('Draft')} className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">Draft</button>
          <div className="flex-1" />
          <button onClick={() => handleBulkAction('Delete')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold font-bold flex items-center gap-1.5 transition-colors">
            <Trash2 size={13} /> Delete All
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 w-12 text-center border-r border-slate-100">
                <input type="checkbox" onChange={handleSelectAll} checked={items.length > 0 && selectedItems.length === items.length} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
              </th>
              <th className="px-5 py-3 font-semibold text-slate-600 w-2/5">Title & Author</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Domain</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Access</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Added</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center text-slate-400">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Loading...
                </div>
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-slate-400">
                No {contentType} found. Add some using the button above.
              </td></tr>
            ) : items.map(item => (
              <tr key={item.id} className={`transition-colors ${selectedItems.includes(item.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                <td className="px-5 py-3 text-center border-r border-slate-50">
                  <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => handleSelectItem(item.id)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                </td>
                <td className="px-5 py-3">
                  <div className="font-semibold text-slate-900 line-clamp-1">{item.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.authors}</div>
                </td>
                <td className="px-5 py-3 text-slate-600">{item.domain || '—'}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                    ${item.accessType === 'Free' ? 'bg-emerald-100 text-emerald-700' : item.accessType === 'Subscription' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.accessType}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">{item.publishedAt ? format(new Date(item.publishedAt), 'dd MMM yy') : '—'}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                    ${item.status === 'Published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleTogglePublish(item)} title={item.status === 'Published' ? 'Unpublish' : 'Publish'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                      {item.status === 'Published' ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    {item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <ExternalLink size={15} />
                    </a>}
                    <button onClick={() => navigate(`/admin/${slug}/${item.id}`)} title="Edit"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                      <Edit size={15} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} title="Delete"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pagination */}
        {total > 0 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} entries
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">
                ← Prev
              </button>
              <span className="px-3 py-1 text-xs text-slate-600">Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
