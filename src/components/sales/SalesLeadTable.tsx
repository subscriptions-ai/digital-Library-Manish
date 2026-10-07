import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Phone, Search, User, Building2, MapPin, Eye, StickyNote, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, Button } from '../ui';
import {
  ActionMenu, ActiveFilter, FilterBar, FilterChips, NO_STATE, PIPELINE_STAGES, SearchField,
  SelectField, formatStamp, isQuiet, stageLabel, timeAgo, QUIET_AFTER_DAYS,
} from './salesUi';

// Kept for the screens that import the badge from here.
export { LeadStatusBadge } from './salesUi';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/** `new` is the chip for leads still on the default stage, which is stored as "All". */
const matchesStage = (lead: any, key: string) => key === 'All' ? true : key === 'new' ? lead.status === 'All' : lead.status === key;

/** Email and call, as icon buttons that say what they are on hover and on focus. */
function ContactButtons({ lead }: { lead: any }) {
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <a href={`mailto:${lead.email}`} data-tip="Email" aria-label={`Email ${lead.name} at ${lead.email}`}
        className="tip btn btn-ghost btn-sm btn-icon text-accent">
        <Mail size={16} aria-hidden="true" />
      </a>
      {lead.phone ? (
        <a href={`tel:${lead.phone}`} data-tip="Call" aria-label={`Call ${lead.name} on ${lead.phone}`}
          className="tip btn btn-ghost btn-sm btn-icon text-success">
          <Phone size={16} aria-hidden="true" />
        </a>
      ) : (
        <span data-tip="No phone number" className="tip btn btn-ghost btn-sm btn-icon opacity-40" aria-label="No phone number on file" role="img">
          <Phone size={16} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

function LeadActions({ lead }: { lead: any }) {
  return (
    <ActionMenu label={`Actions for ${lead.name}`} items={[
      { label: 'View lead', icon: Eye, to: `/sales/leads/${lead.id}` },
      { label: 'Add note', icon: StickyNote, to: `/sales/leads/${lead.id}#add-note` },
      { label: 'Create quotation', icon: FileText, to: '/sales/quotations/create' },
      { label: 'Email', icon: Mail, href: `mailto:${lead.email}` },
      { label: 'Call', icon: Phone, href: `tel:${lead.phone}`, hidden: !lead.phone },
    ]} />
  );
}

function StageSelect({ lead, busy, onChange, className = '' }: { lead: any; busy: boolean; onChange: (s: string) => void; className?: string }) {
  return (
    <select value={lead.status} onChange={e => onChange(e.target.value)} disabled={busy}
      aria-label={`Pipeline status for ${lead.name}`} onClick={e => e.stopPropagation()}
      className={`input h-8 w-auto text-xs font-semibold ${className}`}>
      {PIPELINE_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
    </select>
  );
}

export function SalesLeadTable() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // The dashboard's tiles arrive here with a stage (or "gone quiet") already chosen.
  const [stage, setStage] = useState(params.get('status') || 'All');
  const [quiet, setQuiet] = useState(params.get('quiet') === '1');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch('/api/sales/my-leads', { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setLeads(await res.json());
    } catch {
      setLoadFailed(true);
      toast.error('Failed to load leads list', { id: 'sales-leads' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateStatus = async (leadId: string, newStatus: string) => {
    setUpdatingId(leadId);
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: newStatus, updatedAt: new Date().toISOString() } : l)));
      toast.success(`Status updated to ${stageLabel(newStatus)}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const clearQuiet = () => {
    setQuiet(false);
    const next = new URLSearchParams(params);
    next.delete('quiet');
    setParams(next, { replace: true });
  };

  const states = useMemo(() => Array.from(new Set(leads.map(l => l.state).filter(Boolean))).sort() as string[], [leads]);
  const sources = useMemo(() => Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort() as string[], [leads]);

  const chips = useMemo(() => {
    const n = (key: string) => leads.filter(l => matchesStage(l, key)).length;
    const keys = ['All', ...(n('new') ? ['new'] : []), 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];
    return keys.map(k => ({ key: k, label: k === 'new' ? 'New' : k, count: n(k) }));
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (!matchesStage(l, stage)) return false;
      if (quiet && !isQuiet(l)) return false;
      if (stateFilter !== 'All' && l.state !== stateFilter) return false;
      if (sourceFilter !== 'All' && l.source !== sourceFilter) return false;
      if (q && ![l.name, l.email, l.phone, l.organization].some(v => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [leads, stage, quiet, stateFilter, sourceFilter, search]);

  const anyFilter = stage !== 'All' || quiet || stateFilter !== 'All' || sourceFilter !== 'All' || !!search.trim();
  const resetFilters = () => { setStage('All'); setQuiet(false); setStateFilter('All'); setSourceFilter('All'); setSearch(''); setParams({}, { replace: true }); };

  const heading = <PageHeader title="My Leads" description="Manage and follow up with your assigned leads." />;

  if (loading) {
    return (
      <div>
        {heading}
        <div className="space-y-5">
          <Skeleton className="h-8 w-2/3 rounded-full" />
          <Skeleton className="h-[62px] w-full rounded-lg" />
          <div className="card card-pad"><SkeletonRows rows={6} /></div>
        </div>
      </div>
    );
  }
  if (loadFailed) return <div>{heading}<div className="card"><ErrorState title="Your leads could not be loaded" onRetry={load} /></div></div>;

  const noMatch = leads.length > 0 && filtered.length === 0;

  return (
    <div>
      {heading}

      <div className="space-y-5">
        <FilterChips label="Filter by pipeline status" options={chips} value={stage} onChange={setStage} />

        <FilterBar>
          <SearchField id="lead-search" value={search} onChange={setSearch} placeholder="Name, email, phone or organisation" />
          <SelectField id="lead-state" label="State" value={stateFilter} onChange={setStateFilter}
            options={[{ value: 'All', label: 'All states' }, ...states.map(s => ({ value: s, label: s }))]} />
          <SelectField id="lead-source" label="Source" value={sourceFilter} onChange={setSourceFilter}
            options={[{ value: 'All', label: 'All sources' }, ...sources.map(s => ({ value: s, label: s }))]} />
        </FilterBar>

        {quiet && (
          <ActiveFilter onClear={clearQuiet}>
            Showing Positive and In Progress leads with no activity for {QUIET_AFTER_DAYS}+ days.
          </ActiveFilter>
        )}

        <div className="card overflow-hidden">
          {leads.length === 0 ? (
            <EmptyState icon={User} title="No leads assigned yet" description="Leads assigned to you will appear here." />
          ) : noMatch ? (
            <EmptyState icon={Search} title="No leads match these filters"
              description="Try a different search, or clear the filters to see all of your leads."
              action={anyFilter ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : undefined} />
          ) : (
            <>
              {/* Tablet and desktop: the table. Source and last activity step aside below lg. */}
              <div className="table-wrap relative hidden md:block">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lead / Organisation</th>
                      <th>Location</th>
                      <th>Contact</th>
                      <th className="hidden lg:table-cell">Source</th>
                      <th>Pipeline status</th>
                      <th className="hidden lg:table-cell">Last activity</th>
                      <th className="w-12"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(lead => (
                      <tr key={lead.id} className="cursor-pointer" onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                        <td className="max-w-[280px]">
                          <Link to={`/sales/leads/${lead.id}`} onClick={e => e.stopPropagation()}
                            className="block truncate font-semibold text-ink hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:underline">
                            {lead.name}
                          </Link>
                          <span className="mt-0.5 block truncate text-xs text-muted">{lead.organization || 'No organisation'}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          {lead.state
                            ? <span className="inline-flex items-center gap-1 text-ink-2"><MapPin size={12} className="text-faint" aria-hidden="true" />{lead.state}</span>
                            : <span className="text-xs text-muted">{NO_STATE}</span>}
                        </td>
                        <td><ContactButtons lead={lead} /></td>
                        <td className="hidden whitespace-nowrap lg:table-cell"><span className="badge badge-neutral">{lead.source}</span></td>
                        <td className="whitespace-nowrap">
                          <StageSelect lead={lead} busy={updatingId === lead.id} onChange={s => updateStatus(lead.id, s)} />
                        </td>
                        <td className="hidden whitespace-nowrap text-xs text-muted lg:table-cell">
                          <span title={formatStamp(lead.updatedAt)}>{timeAgo(lead.updatedAt)}</span>
                        </td>
                        <td className="text-right"><LeadActions lead={lead} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone: a card each, rather than a desktop table squeezed to 390px. */}
              <ul className="divide-y divide-rule md:hidden">
                {filtered.map(lead => (
                  <li key={lead.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/sales/leads/${lead.id}`} className="block font-semibold text-ink hover:text-accent">{lead.name}</Link>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Building2 size={12} className="shrink-0 text-faint" aria-hidden="true" />
                          <span className="truncate">{lead.organization || 'No organisation'}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <ContactButtons lead={lead} />
                        <LeadActions lead={lead} />
                      </div>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-faint" aria-hidden="true" />{lead.state || NO_STATE}</span>
                      <span className="badge badge-neutral">{lead.source}</span>
                      <span title={formatStamp(lead.updatedAt)}>Active {timeAgo(lead.updatedAt)}</span>
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted">Pipeline status</span>
                      <StageSelect lead={lead} busy={updatingId === lead.id} onChange={s => updateStatus(lead.id, s)} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {leads.length > 0 && (
          <p className="text-right text-xs text-muted" aria-live="polite">
            Showing {filtered.length} of {leads.length} assigned {leads.length === 1 ? 'lead' : 'leads'}
          </p>
        )}
      </div>
    </div>
  );
}
