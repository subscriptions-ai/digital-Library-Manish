import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Search, RefreshCw, FileText, Loader2, ShieldAlert, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function DraftedContentManager() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [massDeleting, setMassDeleting] = useState(false);
  const [deleteLimit, setDeleteLimit] = useState<number | ''>('');
  const [massPublishing, setMassPublishing] = useState(false);
  const [publishLimit, setPublishLimit] = useState<number | ''>('');

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/content?status=Draft&page=${page}&limit=50&search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch drafted content');
      const data = await res.json();
      setDrafts(data.data);
      setTotal(data.total);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, [page, search]);

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this drafted item permanently?')) return;
    
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/content/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to delete item');
      toast.success('Item deleted successfully');
      fetchDrafts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleMassDelete = async () => {
    const limitQuery = deleteLimit ? `?limit=${deleteLimit}` : '';
    const confirmMsg = deleteLimit 
      ? `⚠️ WARNING: Are you sure you want to PERMANENTLY delete ${deleteLimit} drafted content items?` 
      : '⚠️ WARNING: Are you sure you want to PERMANENTLY delete ALL drafted content? This action cannot be undone.';
      
    if (!window.confirm(confirmMsg)) return;
    
    setMassDeleting(true);
    try {
      const res = await fetch(`/api/admin/content-drafts-cleanup${limitQuery}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to mass delete drafted content');
      const data = await res.json();
      toast.success(`Successfully deleted ${data.count} drafted items!`);
      fetchDrafts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMassDeleting(false);
    }
  };

  const handleMassPublish = async () => {
    const limitQuery = publishLimit ? `?limit=${publishLimit}` : '';
    const confirmMsg = publishLimit 
      ? `Are you sure you want to restore and PUBLISH ${publishLimit} drafted content items?` 
      : 'Are you sure you want to restore and PUBLISH ALL drafted content?';
      
    if (!window.confirm(confirmMsg)) return;
    
    setMassPublishing(true);
    try {
      const res = await fetch(`/api/admin/content-drafts-publish${limitQuery}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to mass publish drafted content');
      const data = await res.json();
      toast.success(`Successfully published ${data.count} items!`);
      fetchDrafts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMassPublishing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="text-red-500" /> Drafted & Flagged Content
          </h2>
          <p className="text-slate-500 mt-1">Manage content that failed validation or was manually drafted.</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchDrafts}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors hidden md:block"
            title="Refresh List"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <div className="flex flex-col gap-2 w-full md:w-auto border-l md:border-l-0 md:border-r border-slate-200 md:pr-4 pl-4 md:pl-0">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Restore / Publish</div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl w-full md:w-auto">
              <input
                type="number"
                min="1"
                max={total}
                placeholder="All"
                value={publishLimit}
                onChange={(e) => setPublishLimit(e.target.value ? Number(e.target.value) : '')}
                className="w-20 pl-3 pr-2 py-1.5 text-sm rounded-lg border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                title="Leave empty to publish all"
              />
              <button
                onClick={handleMassPublish}
                disabled={massPublishing || drafts.length === 0}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-lg shadow-sm transition-all text-sm whitespace-nowrap"
              >
                {massPublishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {publishLimit ? `Publish ${publishLimit}` : 'Publish All'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full md:w-auto pl-4 md:pl-0">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Delete</div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl w-full md:w-auto">
              <input
                type="number"
                min="1"
                max={total}
                placeholder="All"
                value={deleteLimit}
                onChange={(e) => setDeleteLimit(e.target.value ? Number(e.target.value) : '')}
                className="w-20 pl-3 pr-2 py-1.5 text-sm rounded-lg border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500 bg-white"
                title="Leave empty to delete all"
              />
              <button
                onClick={handleMassDelete}
                disabled={massDeleting || drafts.length === 0}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold rounded-lg shadow-sm transition-all text-sm whitespace-nowrap"
              >
                {massDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {deleteLimit ? `Delete ${deleteLimit}` : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search drafted content..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
        </div>
        <div className="text-sm font-semibold text-slate-500">
          Total Drafts: <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{total}</span>
        </div>
      </div>

      {/* Content List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
            <Loader2 size={32} className="animate-spin text-red-500" />
            <p>Loading drafted content...</p>
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
              <ShieldAlert size={32} className="text-emerald-500" />
            </div>
            <p className="font-medium text-slate-600 text-lg">No Drafted Content Found</p>
            <p className="text-sm text-slate-400">Your database is clean of any flagged or drafted items.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Title & Type</th>
                  <th className="px-6 py-4">Flagged Reason</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drafts.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <FileText size={18} className="text-slate-400" />
                        </div>
                        <div className="max-w-[250px] md:max-w-[350px]">
                          <p className="font-bold text-slate-900 truncate" title={item.title}>{item.title}</p>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5">{item.contentType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-[300px] whitespace-normal">
                        {item.flaggedReason ? (
                          <div className="flex items-start gap-1.5 text-red-600 bg-red-50 p-2 rounded-lg text-xs leading-relaxed border border-red-100">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{item.flaggedReason}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Manually Drafted</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={deleting === item.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 text-red-600 hover:text-red-700 rounded-lg font-medium transition-all text-xs shadow-sm"
                      >
                        {deleting === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 50 && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-slate-500 font-medium">Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 50 >= total}
            className="px-4 py-2 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
