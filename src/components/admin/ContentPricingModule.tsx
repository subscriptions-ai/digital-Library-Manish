import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw, Save, ChevronDown, ChevronRight, CheckCircle, XCircle, Tag, Users } from 'lucide-react';

interface ContentModule {
  id: string;
  domain: string;
  contentType: string;
  userType: string;
  totalCount: number;
  monthlyPrice: number;
  quarterlyPrice: number;
  halfYearlyPrice: number;
  yearlyPrice: number;
  yearlyDiscountPct: number;
  isActive: boolean;
}

const CONTENT_TYPE_ICONS: Record<string, string> = {
  'Books': '📚', 'Periodicals': '📰', 'Magazines': '🗞️', 'Case Reports': '📋',
  'Theses': '🎓', 'Conference Proceedings': '🧑‍🤝‍🧑', 'Educational Videos': '🎬', 'Newsletters': '📩'
};

const USER_TYPES = [
  'General',
  'Student Scholar',
  'College Excellence',
  'University Global',
  'Corporate Innovator',
];

const USER_TYPE_COLORS: Record<string, string> = {
  'General':             'bg-slate-100 text-slate-700 border-slate-200',
  'Student Scholar':     'bg-blue-100 text-blue-700 border-blue-200',
  'College Excellence':  'bg-purple-100 text-purple-700 border-purple-200',
  'University Global':   'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Corporate Innovator': 'bg-orange-100 text-orange-700 border-orange-200',
};

export function ContentPricingModule() {
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<string>('General');
  const [edits, setEdits] = useState<Record<string, Partial<ContentModule>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  const fetchModules = useCallback(async (userType: string) => {
    setLoading(true);
    try {
      const params = `?userType=${encodeURIComponent(userType)}`;
      const res = await fetch(`/api/admin/content-modules${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setModules(data);
      const domains = [...new Set(data.map((m: ContentModule) => m.domain))];
      setExpandedDomains(new Set(domains as string[]));
      setEdits({});
    } catch {
      toast.error('Failed to load pricing modules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModules(selectedUserType); }, [fetchModules, selectedUserType]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/content-modules/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      toast.success(`Synced ${data.synced} modules (all user types)`);
      fetchModules(selectedUserType);
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const setEdit = (id: string, field: keyof ContentModule, value: any) => {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const saveModule = async (id: string) => {
    const edit = edits[id];
    if (!edit || Object.keys(edit).length === 0) return;
    setSaving(s => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/admin/content-modules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(edit)
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Pricing updated');
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      fetchModules(selectedUserType);
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const toggleToggle = async (m: ContentModule) => {
    try {
      await fetch(`/api/admin/content-modules/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ isActive: !m.isActive })
      });
      toast.success(m.isActive ? 'Module hidden from users' : 'Module visible to users');
      fetchModules(selectedUserType);
    } catch {
      toast.error('Update failed');
    }
  };

  const grouped = modules.reduce<Record<string, ContentModule[]>>((acc, m) => {
    if (!acc[m.domain]) acc[m.domain] = [];
    acc[m.domain].push(m);
    return acc;
  }, {});

  const val = (id: string, field: keyof ContentModule, fallback: number) =>
    (edits[id]?.[field] as number) ?? fallback;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pricing Modules</h1>
          <p className="text-sm text-slate-500 mt-1">Set prices per domain + content type + user type. Modules auto-update when content is added.</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold disabled:opacity-60 transition-colors">
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync from Library'}
        </button>
      </div>

      {/* User Type Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-700">User Type Pricing</span>
          <span className="text-xs text-slate-400 ml-1">— prices vary per user category</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {USER_TYPES.map(ut => (
            <button
              key={ut}
              onClick={() => setSelectedUserType(ut)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selectedUserType === ut
                  ? (USER_TYPE_COLORS[ut] ?? 'bg-slate-100 text-slate-700 border-slate-300') + ' shadow-sm'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
              }`}
            >
              {ut}
            </button>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-sm text-blue-800">
        <Tag size={16} className="shrink-0 mt-0.5" />
        <div>
          <strong>How pricing works:</strong> Set Monthly, Quarterly, <strong>Half-Yearly</strong>, and Yearly prices per module per user type.
          Switch user type tabs above to configure different prices for each category.
          Click <strong>Sync</strong> to auto-create modules for all 5 user types from the current content library.
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="font-bold text-slate-700">No modules found</h3>
          <p className="text-sm text-slate-500 mt-1">Add some content to the library, then click <strong>Sync from Library</strong>.</p>
        </div>
      ) : (Object.entries(grouped) as [string, ContentModule[]][]).map(([domain, domainModules]) => {
        const isExpanded = expandedDomains.has(domain);
        const totalItems = domainModules.reduce((s, m) => s + m.totalCount, 0);
        const activeCount = domainModules.filter(m => m.isActive).length;

        return (
          <div key={domain} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedDomains(prev => {
                const n = new Set(prev);
                n.has(domain) ? n.delete(domain) : n.add(domain);
                return n;
              })}
              className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <div>
                  <div className="font-bold text-slate-900 text-base">{domain}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {totalItems.toLocaleString()} items · {domainModules.length} content types · {activeCount} active
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${USER_TYPE_COLORS[selectedUserType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {selectedUserType}
                </span>
                <div className="flex gap-1.5">
                  {domainModules.map(m => (
                    <span key={m.id} className={`w-2 h-2 rounded-full ${m.isActive ? 'bg-emerald-400' : 'bg-slate-200'}`} title={m.contentType} />
                  ))}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wide font-bold">
                      <th className="px-5 py-2.5 text-left">Content Type</th>
                      <th className="px-4 py-2.5 text-center">Items</th>
                      <th className="px-4 py-2.5 text-center">Monthly ₹</th>
                      <th className="px-4 py-2.5 text-center">Quarterly ₹</th>
                      <th className="px-4 py-2.5 text-center text-purple-600 bg-purple-50">Half-Yearly ₹</th>
                      <th className="px-4 py-2.5 text-center">Yearly ₹</th>
                      <th className="px-4 py-2.5 text-center">Disc %</th>
                      <th className="px-4 py-2.5 text-center">Visible</th>
                      <th className="px-4 py-2.5 text-center">Save</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {domainModules.map(m => {
                      const hasEdits = !!edits[m.id] && Object.keys(edits[m.id]).length > 0;
                      return (
                        <tr key={m.id} className={`hover:bg-slate-50/50 transition-colors ${!m.isActive ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2 font-semibold text-slate-800">
                              <span>{CONTENT_TYPE_ICONS[m.contentType] || '📄'}</span>
                              {m.contentType}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
                              {m.totalCount.toLocaleString()}
                            </span>
                          </td>
                          {(['monthlyPrice', 'quarterlyPrice', 'halfYearlyPrice', 'yearlyPrice'] as const).map(field => (
                            <td key={field} className={`px-4 py-3 text-center ${field === 'halfYearlyPrice' ? 'bg-purple-50/40' : ''}`}>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                <input
                                  type="number" min="0" step="1"
                                  value={val(m.id, field, m[field])}
                                  onChange={e => setEdit(m.id, field, e.target.value)}
                                  className={`w-24 pl-5 pr-2 py-1.5 text-sm text-center border rounded-lg bg-slate-50 focus:bg-white outline-none transition-colors ${
                                    field === 'halfYearlyPrice'
                                      ? 'border-purple-200 focus:border-purple-400'
                                      : 'border-slate-200 focus:border-blue-400'
                                  }`}
                                />
                              </div>
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number" min="0" max="100" step="1"
                              value={val(m.id, 'yearlyDiscountPct', m.yearlyDiscountPct)}
                              onChange={e => setEdit(m.id, 'yearlyDiscountPct', e.target.value)}
                              className="w-16 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-400 outline-none"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => toggleToggle(m)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                m.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}>
                              {m.isActive ? <><CheckCircle size={12} /> On</> : <><XCircle size={12} /> Off</>}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => saveModule(m.id)}
                              disabled={!hasEdits || saving[m.id]}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed mx-auto"
                            >
                              {saving[m.id]
                                ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                                : <Save size={12} />}
                              Save
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
