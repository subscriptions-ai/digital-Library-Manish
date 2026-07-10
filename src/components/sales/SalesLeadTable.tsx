import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, Clock, MapPin, Building2, Search, Filter, ArrowRight, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];

const STAGE_COLORS: Record<string, string> = {
  'All': 'bg-slate-100 border-slate-200 text-slate-800',
  'Positive': 'bg-blue-100 border-blue-200 text-blue-800',
  'No Response': 'bg-amber-100 border-amber-200 text-amber-800',
  'Subscriber': 'bg-emerald-100 border-emerald-200 text-emerald-800',
  'In Progress': 'bg-purple-100 border-purple-200 text-purple-800',
  'Negative': 'bg-rose-100 border-rose-200 text-rose-800',
  'Repeated': 'bg-orange-100 border-orange-200 text-orange-800',
};

export function SalesLeadTable() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');

  const navigate = useNavigate();

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/my-leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      setLeads(await res.json());
    } catch {
      toast.error('Failed to load leads list');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (leadId: string, newStatus: string) => {
    setUpdatingId(leadId);
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error();
      
      // Update local state
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
      toast.success(`Status updated to ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-100 rounded w-1/4"></div>
        <div className="h-12 bg-slate-100 rounded"></div>
        <div className="h-64 bg-slate-100 rounded"></div>
      </div>
    );
  }

  // Derived filter options
  const uniqueStates = Array.from(new Set(leads.map(l => l.state).filter(Boolean))).sort() as string[];
  const uniqueSources = Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort() as string[];

  // Statistics counts for pills (Total count changes per status)
  const getStatusCount = (status: string) => {
    if (status === 'All') return leads.length;
    return leads.filter(l => l.status === status).length;
  };

  // Filtered Leads
  const filteredLeads = leads.filter(lead => {
    // 1. Status Pill
    if (selectedStatus !== 'All' && lead.status !== selectedStatus) return false;
    
    // 2. State Dropdown
    if (stateFilter !== 'All' && lead.state !== stateFilter) return false;
    
    // 3. Source Dropdown
    if (sourceFilter !== 'All' && lead.source !== sourceFilter) return false;
    
    // 4. Search text
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = lead.name?.toLowerCase().includes(q);
      const emailMatch = lead.email?.toLowerCase().includes(q);
      const phoneMatch = lead.phone?.toLowerCase().includes(q);
      const orgMatch = lead.organization?.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch && !phoneMatch && !orgMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">My Leads</h1>
        <p className="text-slate-500 text-sm font-semibold mt-1">Manage and call your assigned leads. Filter by state or status to organize your day.</p>
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
        {PIPELINE_STAGES.map(stage => {
          const count = getStatusCount(stage);
          const isActive = selectedStatus === stage;
          return (
            <button
              key={stage}
              onClick={() => setSelectedStatus(stage)}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all border ${
                isActive 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/10'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {stage}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isActive ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
        {/* Search */}
        <div className="relative w-full sm:flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-400"
          />
        </div>

        {/* State Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <MapPin size={15} className="text-slate-400" />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none pr-6 cursor-pointer"
          >
            <option value="All">All States</option>
            {uniqueStates.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Filter size={15} className="text-slate-400" />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none pr-6 cursor-pointer"
          >
            <option value="All">All Sources</option>
            {uniqueSources.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase bg-slate-50/50">
                  <th className="py-4 px-6 font-extrabold">Lead / Organization</th>
                  <th className="py-4 px-4 font-extrabold">State</th>
                  <th className="py-4 px-4 font-extrabold text-center">Quick Contact</th>
                  <th className="py-4 px-4 font-extrabold">Source</th>
                  <th className="py-4 px-4 font-extrabold">Pipeline Status</th>
                  <th className="py-4 px-4 font-extrabold">Created At</th>
                  <th className="py-4 pr-6 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                    {/* Lead info */}
                    <td className="py-4 px-6 cursor-pointer" onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                      <div className="font-bold text-slate-800 hover:text-indigo-600 transition-colors">{lead.name}</div>
                      {lead.organization ? (
                        <div className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                          <Building2 size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[200px]">{lead.organization}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">No organization</div>
                      )}
                    </td>

                    {/* State */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {lead.state ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                          <MapPin size={10} className="text-indigo-500" /> {lead.state}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>

                    {/* Contact Icons */}
                    <td className="py-4 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <a
                          href={`mailto:${lead.email}`}
                          title={lead.email}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all inline-block"
                        >
                          <Mail size={14} />
                        </a>
                        {lead.phone ? (
                          <a
                            href={`tel:${lead.phone}`}
                            title={lead.phone}
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all inline-block"
                          >
                            <Phone size={14} />
                          </a>
                        ) : (
                          <button
                            disabled
                            className="p-2 bg-slate-50 text-slate-300 rounded-xl cursor-not-allowed inline-block"
                            title="No Phone"
                          >
                            <Phone size={14} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded font-extrabold text-[10px] uppercase border border-indigo-100 tracking-wider">
                        {lead.source}
                      </span>
                    </td>

                    {/* Status inline selector */}
                    <td className="py-4 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        disabled={updatingId === lead.id}
                        className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {PIPELINE_STAGES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-4 whitespace-nowrap font-medium text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Details Action */}
                    <td className="py-4 pr-6 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/sales/leads/${lead.id}`)}
                        className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 ml-auto bg-slate-100/50 py-1.5 px-3 rounded-xl transition-all hover:bg-slate-100"
                      >
                        Action <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 bg-slate-50/20">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <User size={20} />
            </div>
            <h4 className="font-extrabold text-slate-700 text-sm">No Matching Leads</h4>
            <p className="text-slate-400 text-xs mt-1">Try adjusting your filters or search query to find your leads.</p>
          </div>
        )}
      </div>
      
      <div className="text-xs font-bold text-slate-400 text-right">
        Showing {filteredLeads.length} of {leads.length} assigned leads
      </div>
    </div>
  );
}
