import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import { DOMAINS } from '../../constants';
const CONTENT_TYPES = ['Books', 'Periodicals', 'Magazines', 'Case Reports', 'Theses', 'Conference Proceedings', 'Educational Videos', 'Newsletters'];

export function ContentManager() {
  const navigate = useNavigate();
  const [content, setContent] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(domainFilter && { domain: domainFilter }),
        ...(typeFilter && { contentType: typeFilter })
      });
      
      const res = await fetch(`/api/admin/content?${query}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to load content');
      
      const { data, total } = await res.json();
      setContent(data);
      setTotal(total);
    } catch (error) {
      console.error(error);
      toast.error('Could not load content');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, domainFilter, typeFilter, page, limit]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this content?')) return;
    try {
      const res = await fetch(`/api/admin/content/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Content deleted');
      fetchContent();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete content');
    }
  };

  const startIdx = (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search title, author, or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        
        <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
          <div className="relative shrink-0">
            <select 
              value={domainFilter}
              onChange={(e) => { setDomainFilter(e.target.value); setPage(1); }}
              className="appearance-none bg-white border border-slate-200 rounded-xl py-2.5 pl-4 pr-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 min-w-32"
            >
              <option value="">All Domains</option>
              {DOMAINS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
            <Filter size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative shrink-0">
            <select 
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="appearance-none bg-white border border-slate-200 rounded-xl py-2.5 pl-4 pr-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 min-w-32"
            >
              <option value="">All Types</option>
              {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Filter size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <button 
            onClick={() => navigate('/admin/content/new')}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0 shadow-sm"
          >
            <Plus size={18} />
            <span>Add Content</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-64">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 box-border">
              <tr>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest w-1/3">Title & Details</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">Domain / Type</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">Access & Price</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 relative">
              {loading && content.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                      <p>Loading content...</p>
                    </div>
                  </td>
                </tr>
              ) : content.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No content found matching your filters.
                  </td>
                </tr>
              ) : (
                content.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 truncate max-w-xs xl:max-w-md">{item.title}</div>
                      <div className="text-xs text-slate-500 truncate mt-1">By {item.authors}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{item.domain || 'N/A'}</div>
                      <div className="text-xs text-slate-500 mt-1">{item.contentType}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{item.accessType}</div>
                      <div className="text-xs text-emerald-600 font-bold mt-1">
                        {item.price > 0 ? `₹${item.price}` : 'Free'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'Published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          title="Preview"
                          onClick={() => window.open(item.fileUrl, '_blank')}
                          disabled={!item.fileUrl}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button 
                          title="Edit"
                          onClick={() => navigate(`/admin/content/${item.id}`)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          title="Delete"
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Showing {total > 0 ? startIdx : 0} to {endIdx} of {total} entries
          </div>
          <div className="flex items-center gap-2">
            <button 
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="text-sm font-medium text-slate-700 px-2">Page {page} of {totalPages}</div>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
