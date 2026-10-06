import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, Clock, MapPin, Building2, Search, ArrowRight, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, EmptyState, ErrorState, Skeleton, SkeletonRows, type BadgeTone } from '../ui';

const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];

// How each pipeline stage reads as a badge. The word always carries the
// meaning; the tone only helps the eye find what needs attention.
const STAGE_TONE: Record<string, BadgeTone> = {
  'Positive': 'accent',
  'No Response': 'caution',
  'Subscriber': 'success',
  'In Progress': 'accent',
  'Negative': 'neutral',
  'Repeated': 'neutral',
};

/** A lead's pipeline stage as a badge — shared by the dashboard and the lead page. */
export function LeadStatusBadge({ status }: { status: string }) {
  return <Badge tone={STAGE_TONE[status] ?? 'neutral'} dot>{status || 'Unknown'}</Badge>;
}

export function SalesLeadTable() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  
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
    setLoadFailed(false);
    try {
      const res = await fetch('/api/sales/my-leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      setLeads(await res.json());
    } catch {
      setLoadFailed(true);
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
      <div className="space-y-6">
        <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-2/3" /></div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="card card-pad"><SkeletonRows rows={6} /></div>
      </div>
    );
  }

  if (loadFailed) {
    return <ErrorState title="Your leads could not be loaded" onRetry={fetchLeads} />;
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
        <h1 className="type-page-title text-ink">My Leads</h1>
        <p className="text-muted text-sm mt-1">Manage and call your assigned leads. Filter by state or status to organize your day.</p>
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-rule" role="group" aria-label="Filter by pipeline status">
        {PIPELINE_STAGES.map(stage => {
          const count = getStatusCount(stage);
          const isActive = selectedStatus === stage;
          return (
            <button
              key={stage}
              onClick={() => setSelectedStatus(stage)}
              aria-pressed={isActive}
              className={`flex items-center gap-2 h-8 px-3 rounded-full text-xs font-semibold transition-colors duration-150 border ${
                isActive
                  ? 'bg-accent border-accent text-accent-on'
                  : 'bg-surface border-rule text-ink-2 hover:bg-surface-2'
              }`}
            >
              {stage}
              <span className={`px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${
                isActive ? 'bg-white/20 text-accent-on' : 'bg-surface-2 text-muted'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters Row */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div className="field">
          <label htmlFor="lead-search" className="field-label">Search</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id="lead-search"
              type="text"
              placeholder="Name, email, phone or organization"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="lead-state" className="field-label">State</label>
          <select
            id="lead-state"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="input sm:w-44"
          >
            <option value="All">All States</option>
            {uniqueStates.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="lead-source" className="field-label">Source</label>
          <select
            id="lead-source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="input sm:w-44"
          >
            <option value="All">All Sources</option>
            {uniqueSources.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="card overflow-hidden">
        {filteredLeads.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead / Organization</th>
                  <th>State</th>
                  <th className="text-center">Quick Contact</th>
                  <th>Source</th>
                  <th>Pipeline Status</th>
                  <th>Created At</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id}>
                    {/* Lead info */}
                    <td className="cursor-pointer" onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                      <div className="font-semibold text-ink hover:text-accent transition-colors">{lead.name}</div>
                      {lead.organization ? (
                        <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                          <Building2 size={12} className="text-faint shrink-0" aria-hidden="true" />
                          <span className="truncate max-w-[200px]">{lead.organization}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted">No organization</div>
                      )}
                    </td>

                    {/* State */}
                    <td className="whitespace-nowrap">
                      {lead.state ? (
                        <span className="inline-flex items-center gap-1 text-ink-2">
                          <MapPin size={12} className="text-faint" aria-hidden="true" /> {lead.state}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">N/A</span>
                      )}
                    </td>

                    {/* Contact Icons */}
                    <td className="whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        <a
                          href={`mailto:${lead.email}`}
                          title={lead.email}
                          aria-label={`Email ${lead.name}${lead.email ? ` at ${lead.email}` : ''}`}
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-ghost btn-sm btn-icon text-accent"
                        >
                          <Mail size={16} aria-hidden="true" />
                        </a>
                        {lead.phone ? (
                          <a
                            href={`tel:${lead.phone}`}
                            title={lead.phone}
                            aria-label={`Call ${lead.name} on ${lead.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="btn btn-ghost btn-sm btn-icon text-success"
                          >
                            <Phone size={16} aria-hidden="true" />
                          </a>
                        ) : (
                          <button
                            disabled
                            className="btn btn-ghost btn-sm btn-icon"
                            title="No Phone"
                            aria-label="No phone number"
                          >
                            <Phone size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="whitespace-nowrap">
                      <span className="badge badge-neutral">{lead.source}</span>
                    </td>

                    {/* Status inline selector */}
                    <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        disabled={updatingId === lead.id}
                        aria-label={`Pipeline status for ${lead.name}`}
                        className="input h-8 w-auto text-xs font-semibold"
                      >
                        {PIPELINE_STAGES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>

                    {/* Date */}
                    <td className="whitespace-nowrap text-muted">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-faint" aria-hidden="true" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Details Action */}
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/sales/leads/${lead.id}`)}
                        className="btn btn-outline btn-sm"
                        aria-label={`Open ${lead.name}`}
                      >
                        Action <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : leads.length === 0 ? (
          <EmptyState icon={User} title="No leads assigned yet" description="Leads assigned to you will appear here." />
        ) : (
          <EmptyState icon={User} title="No matching leads" description="Try adjusting your filters or search query to find your leads." />
        )}
      </div>

      <p className="text-xs text-muted text-right">
        Showing {filteredLeads.length} of {leads.length} assigned leads
      </p>
    </div>
  );
}
