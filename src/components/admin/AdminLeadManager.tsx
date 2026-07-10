import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Filter, Mail, Phone, Clock, UserPlus, FileText, CheckCircle2,
  MapPin, Building2, ArrowRight, Users
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];

const STATUS_META: Record<string, { bg: string; text: string; border: string }> = {
  'All':          { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200'  },
  'Positive':     { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200'   },
  'No Response':  { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200'  },
  'Subscriber':   { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200'},
  'In Progress':  { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200' },
  'Negative':     { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200'   },
  'Repeated':     { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200' },
};

export function AdminLeadManager() {
  const [leads, setLeads]               = useState<any[]>([]);
  const [team, setTeam]                 = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [assignTo, setAssignTo]         = useState('');
  const [assigning, setAssigning]       = useState(false);
  const [syncing, setSyncing]           = useState(false);

  // Filters
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [stateFilter, setStateFilter]   = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');

  useEffect(() => { fetchData(); }, []);

  const handleSyncOldLeads = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/leads/migrate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync');
      toast.success(data.message);
      fetchData();
    } catch (error: any) { toast.error(error.message); }
    finally { setSyncing(false); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadsRes, teamRes] = await Promise.all([
        fetch('/api/admin/leads',      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch('/api/admin/sales-team', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
      ]);
      if (!leadsRes.ok || !teamRes.ok) throw new Error('Failed to fetch data');
      setLeads(await leadsRes.json());
      setTeam(await teamRes.json());
    } catch { toast.error('Failed to load leads data'); }
    finally { setLoading(false); }
  };

  const handleAssign = async () => {
    if (!assignTo || selectedLeads.length === 0) return;
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ leadIds: selectedLeads, assignedToId: assignTo })
      });
      if (!res.ok) throw new Error('Failed to assign');
      toast.success(`${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''} assigned!`);
      setSelectedLeads([]);
      setAssignTo('');
      fetchData();
    } catch { toast.error('Failed to assign leads'); }
    finally { setAssigning(false); }
  };

  // ── Derived data ─────────────────────────────────────────────
  const uniqueStates  = Array.from(new Set(leads.map(l => l.state).filter(Boolean))).sort() as string[];
  const uniqueSources = Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort() as string[];

  const filteredLeads = leads.filter(lead => {
    if (statusFilter !== 'All' && lead.status !== statusFilter)   return false;
    if (stateFilter  !== 'All' && lead.state  !== stateFilter)    return false;
    if (sourceFilter !== 'All' && lead.source !== sourceFilter)   return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !lead.name?.toLowerCase().includes(q) &&
        !lead.email?.toLowerCase().includes(q) &&
        !lead.phone?.toLowerCase().includes(q) &&
        !lead.organization?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every(l => selectedLeads.includes(l.id));

  const toggleAllFiltered = (checked: boolean) => {
    if (checked) {
      const ids = filteredLeads.map(l => l.id);
      setSelectedLeads(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      const ids = new Set(filteredLeads.map(l => l.id));
      setSelectedLeads(prev => prev.filter(id => !ids.has(id)));
    }
  };

  const getStatusCount = (s: string) => s === 'All' ? leads.length : leads.filter(l => l.status === s).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Title Row ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <UserPlus className="text-indigo-600" size={24} />
            Lead Master
          </h1>
          <p className="text-sm text-slate-500 font-semibold mt-1">
            Manage all incoming queries. Select and assign them to executives.
          </p>
        </div>
        <button
          onClick={handleSyncOldLeads}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold disabled:opacity-50 text-sm transition-colors"
        >
          {syncing ? 'Syncing...' : 'Sync Old Inquiries'}
        </button>
      </div>

      {/* ── Status Pills ──────────────────────────────── */}
      {!loading && leads.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-100">
          {PIPELINE_STAGES.map(stage => {
            const count    = getStatusCount(stage);
            const isActive = statusFilter === stage;
            return (
              <button
                key={stage}
                onClick={() => { setStatusFilter(stage); setSelectedLeads([]); }}
                className={`flex items-center gap-2 py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all border ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {stage}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${isActive ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Search + Filters ──────────────────────────── */}
      {!loading && leads.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
          <div className="relative flex-1 w-full">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone or organization..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedLeads([]); }}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-9 pr-4 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
            />
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shrink-0">
            <MapPin size={14} className="text-slate-400" />
            <select
              value={stateFilter}
              onChange={e => { setStateFilter(e.target.value); setSelectedLeads([]); }}
              className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none cursor-pointer"
            >
              <option value="All">All States</option>
              {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 shrink-0">
            <Filter size={14} className="text-slate-400" />
            <select
              value={sourceFilter}
              onChange={e => { setSourceFilter(e.target.value); setSelectedLeads([]); }}
              className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none cursor-pointer"
            >
              <option value="All">All Sources</option>
              {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Bulk Assign Banner ────────────────────────── */}
      {selectedLeads.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm"
        >
          <div className="font-extrabold text-indigo-900 text-sm">
            {selectedLeads.length} Lead{selectedLeads.length > 1 && 's'} selected
            <span className="text-indigo-500 font-semibold ml-2 text-xs">(of {filteredLeads.length} visible)</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={assignTo}
              onChange={e => setAssignTo(e.target.value)}
              className="px-4 py-2 bg-white border border-indigo-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select Executive —</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.displayName || m.email}</option>)}
            </select>
            <button
              onClick={handleAssign}
              disabled={!assignTo || assigning}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
            >
              {assigning ? 'Assigning...' : <><ArrowRight size={14} /> Assign Leads</>}
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Table ────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-14 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No Leads Found</h3>
          <p className="text-slate-500 text-sm">There are no incoming leads right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-5 w-12">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      checked={allFilteredSelected}
                      onChange={e => toggleAllFiltered(e.target.checked)}
                      title="Select all visible leads"
                    />
                  </th>
                  <th className="py-3.5 px-4">Lead / Organization</th>
                  <th className="py-3.5 px-4">State</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Assigned To</th>
                  <th className="py-3.5 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Users size={28} className="text-slate-300" />
                        <span className="text-sm font-bold text-slate-500">No leads match your current filters</span>
                        <span className="text-xs">Try clearing some filters above</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLeads.map(lead => {
                  const meta = STATUS_META[lead.status] || STATUS_META['All'];
                  const isSelected = selectedLeads.includes(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-indigo-50/40' : ''}`}
                    >
                      <td className="py-3.5 px-5">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) setSelectedLeads([...selectedLeads, lead.id]);
                            else setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                          }}
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{lead.name}</div>
                        {lead.organization && (
                          <div className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                            <Building2 size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[200px]">{lead.organization}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {lead.state
                          ? <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase"><MapPin size={9} className="text-indigo-500" />{lead.state}</span>
                          : <span className="text-slate-400 text-xs italic">N/A</span>
                        }
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 text-xs text-slate-600">
                          <span className="flex items-center gap-1 font-medium"><Mail size={11} className="text-slate-400"/>{lead.email}</span>
                          {lead.phone && <span className="flex items-center gap-1 font-medium"><Phone size={11} className="text-slate-400"/>{lead.phone}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-extrabold text-[10px] uppercase tracking-wider border border-indigo-100">
                          {lead.source}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${meta.bg} ${meta.text} ${meta.border}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-extrabold shrink-0">
                              {(lead.assignedTo.displayName?.[0] || lead.assignedTo.email[0]).toUpperCase()}
                            </div>
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">
                              {lead.assignedTo.displayName || lead.assignedTo.email.split('@')[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-rose-500 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                          <Clock size={11} className="text-slate-400"/>{new Date(lead.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && leads.length > 0 && (
        <p className="text-xs font-bold text-slate-400 text-right">
          Showing {filteredLeads.length} of {leads.length} total leads
          {selectedLeads.length > 0 && <span className="ml-2 text-indigo-600">• {selectedLeads.length} selected</span>}
        </p>
      )}
    </div>
  );
}
