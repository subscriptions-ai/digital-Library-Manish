import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui';
import { FilterBar, SearchField, SelectField, formatStamp, interactionIcon } from './salesUi';

const TYPES = [
  { value: 'All', label: 'All interactions' },
  { value: 'Note', label: 'Notes' },
  { value: 'Call', label: 'Calls' },
  { value: 'Email', label: 'Emails' },
  { value: 'Meeting', label: 'Meetings' },
  { value: 'StatusChange', label: 'Status changes' },
];
const TYPE_WORD: Record<string, string> = { StatusChange: 'Status change' };

const GROUPS = ['Today', 'Yesterday', 'This week', 'Older'] as const;

export function SalesActivityLog() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [type, setType] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch('/api/sales/my-activity', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error();
      setActivities(await res.json());
    } catch {
      setLoadFailed(true);
      toast.error('Failed to load activity log', { id: 'sales-activity' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter(a => {
      if (type !== 'All' && a.type !== type) return false;
      return !q || [a.lead?.name, a.lead?.organization, a.notes].some(v => v?.toLowerCase().includes(q));
    });
  }, [activities, type, search]);

  // Today, yesterday, the rest of the week, then everything older.
  const grouped = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const out: Record<(typeof GROUPS)[number], any[]> = { Today: [], Yesterday: [], 'This week': [], Older: [] };
    for (const a of filtered) {
      const t = new Date(a.createdAt).getTime();
      out[t >= today ? 'Today' : t >= today - 864e5 ? 'Yesterday' : t >= today - 7 * 864e5 ? 'This week' : 'Older'].push(a);
    }
    return out;
  }, [filtered]);

  const heading = <PageHeader title="Activity Log" description="A timeline of your notes, calls, emails, meetings and status changes." />;

  if (loading) {
    return (
      <div>
        {heading}
        <div className="space-y-5" role="status" aria-label="Loading activity">
          <Skeleton className="h-[62px] w-full rounded-lg" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    );
  }
  if (loadFailed) return <div>{heading}<div className="card"><ErrorState title="Your activity could not be loaded" onRetry={load} /></div></div>;

  const filtering = type !== 'All' || !!search.trim();

  return (
    <div>
      {heading}
      <div className="space-y-6">
        <FilterBar>
          <SearchField id="activity-search" value={search} onChange={setSearch} placeholder="Lead, organisation or note" />
          <SelectField id="activity-type" label="Interaction type" value={type} onChange={setType} options={TYPES} />
        </FilterBar>

        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={filtering ? Search : ClipboardList}
              title={filtering ? 'No activity matches these filters' : 'No activity yet'}
              description={filtering ? 'Try a different search or interaction type.' : 'Notes, calls, emails and meetings you log on a lead will appear here.'}
              action={filtering ? <Button variant="outline" onClick={() => { setType('All'); setSearch(''); }}>Clear filters</Button> : undefined}
            />
          </div>
        ) : (
          GROUPS.map(group => grouped[group].length > 0 && (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2 id={`g-${group}`} className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group}<span className="font-medium normal-case tracking-normal text-faint tabular-nums">{grouped[group].length}</span>
              </h2>
              <ul className="card divide-y divide-rule overflow-hidden">
                {grouped[group].map(a => {
                  const { icon: Icon, tone } = interactionIcon(a.type);
                  return (
                    <li key={a.id}>
                      <Link to={`/sales/leads/${a.leadId}`}
                        className="flex items-start gap-3 px-4 py-4 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none sm:gap-4 sm:px-5">
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden="true"><Icon size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                            <span className="min-w-0">
                              <span className="text-sm font-semibold text-ink">{a.lead?.name || 'Unknown lead'}</span>
                              {a.lead?.organization && <span className="text-xs text-muted"> · {a.lead.organization}</span>}
                            </span>
                            <time dateTime={a.createdAt} className="shrink-0 text-xs text-muted">{formatStamp(a.createdAt)}</time>
                          </span>
                          <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{a.notes}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="badge badge-neutral">{TYPE_WORD[a.type] || a.type}</span>
                            {a.lead?.source && <span className="badge badge-neutral">{a.lead.source}</span>}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
