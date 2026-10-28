import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Clock, Eye, MailQuestion, Search, Sparkles, Users, ArrowRight, X } from 'lucide-react';
import { Badge, EmptyState, PageHeader, Skeleton, SkeletonRows, Button, buttonClass } from '../ui';
import { SmartPagination } from '../SmartPagination';
import { DataNote, FilterBar, SearchField, SelectField } from './salesUi';
import {
  ApiErrorState, asApiError, DemoBadge, fmtNum, fmtRegistered, getJson, SubscriptionBadge, SUB_LABEL, SUB_ORDER,
  type ApiError, type FollowUps, type Member, type MemberPage,
} from './registrationApi';

const PAGE_SIZE = 20;

function VerifiedBadge({ yes }: { yes: boolean }) {
  return yes ? <Badge tone="success" dot>Verified</Badge> : <Badge tone="neutral" dot>Not verified</Badge>;
}

/** Name first, then the lead it belongs to — the one existing screen where an executive works that person. */
function MemberName({ m }: { m: Member }) {
  const label = m.name?.trim() || m.email;
  return m.leadId
    ? <Link to={`/sales/leads/${m.leadId}`} className="block truncate font-semibold text-ink hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:underline">{label}</Link>
    : <span className="block truncate font-semibold text-ink">{label}</span>;
}

/** One follow-up: the count first, because the count is the point. */
function FollowUpCard({ icon: Icon, label, scope, hint, count, error, onRetry, action }: {
  icon: typeof Users; label: string; scope: string; hint: string; count: number | null; error: ApiError | null; onRetry: () => void; action: React.ReactNode;
}) {
  return (
    <div className="card card-pad">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-caution-soft text-caution" aria-hidden="true"><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">{label}<span className="badge badge-neutral">{scope}</span></p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
      </div>
      {error ? (
        <ApiErrorState compact error={error} subject="This count" onRetry={onRetry} />
      ) : (
        <div className="mt-3 flex items-end justify-between gap-3">
          {count === null ? <Skeleton className="h-9 w-16" /> : <p className="text-3xl font-bold leading-none tabular-nums text-ink" aria-label={`${count} ${label}`}>{fmtNum(count)}</p>}
          {action}
        </div>
      )}
    </div>
  );
}

export function RegisteredUsers() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'verified-unsubscribed' ? 'verified-unsubscribed' : '';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [verified, setVerified] = useState('');
  const [subscription, setSubscription] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MemberPage | null>(null);
  const [followUps, setFollowUps] = useState<FollowUps | null>(null);
  const [followError, setFollowError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const seq = useRef(0);

  // The search box waits for a pause in typing before asking the server.
  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true); setError(null);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQ) qs.set('q', debouncedQ);
    if (verified) qs.set('verified', verified);
    if (subscription) qs.set('subscription', subscription);
    if (view) qs.set('view', view);
    try {
      const d = await getJson<MemberPage>(`/api/sales/registrations/users?${qs}`);
      if (id === seq.current) setData(d);
    } catch (e) {
      // The table keeps no stale rows on screen under an error: a failed load is not "the same members as before".
      if (id === seq.current) { setError(asApiError(e)); setData(null); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [page, debouncedQ, verified, subscription, view]);
  useEffect(() => { load(); }, [load]);

  const loadFollowUps = useCallback(() => {
    setFollowError(null); setFollowUps(null);
    getJson<FollowUps>('/api/sales/registrations/follow-ups').then(setFollowUps).catch(e => setFollowError(asApiError(e)));
  }, []);
  useEffect(() => { loadFollowUps(); }, [loadFollowUps]);

  const filtered = !!(debouncedQ || verified || subscription || view);
  const reset = () => { setQ(''); setDebouncedQ(''); setVerified(''); setSubscription(''); setPage(1); setParams({}, { replace: true }); };
  const showFollowUps = (on: boolean) => { setPage(1); setParams(on ? { view: 'verified-unsubscribed' } : {}, { replace: true }); };
  const demo = !!(data?.demo || followUps?.demo);

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">Registered Users
          <span className="badge badge-neutral align-middle"><Eye size={12} aria-hidden="true" /> View only</span>
          {demo && <DemoBadge />}
        </span>}
        description="View members linked to your assigned leads."
      />
      <div className="space-y-6">
        {/* Follow-ups */}
        <section aria-labelledby="fu-h" className="space-y-3">
          <h2 id="fu-h" className="text-xs font-semibold uppercase tracking-wider text-muted">Follow-ups</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FollowUpCard icon={MailQuestion} label="Verified, not subscribed" scope="My assigned"
              hint="Confirmed their email and hold no running subscription."
              count={followUps ? followUps.verifiedUnsubscribed.total : null} error={followError} onRetry={loadFollowUps}
              action={<Button variant="outline" size="sm" onClick={() => showFollowUps(true)} disabled={!followUps || followUps.verifiedUnsubscribed.total === 0}>View list <ArrowRight size={14} aria-hidden="true" /></Button>} />
            <FollowUpCard icon={Sparkles} label="Subscription enquiries waiting" scope="Whole team"
              hint="Members asking for help to subscribe. Shared by the whole sales team, not limited to your leads."
              count={followUps ? followUps.pendingEnquiries : null} error={followError} onRetry={loadFollowUps}
              action={<Link to="/sales/pro-applications" className={buttonClass('outline', 'sm')}>Open enquiries <ArrowRight size={14} aria-hidden="true" /></Link>} />
          </div>
        </section>

        {/* The table */}
        <section aria-labelledby="ru-h" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ru-h" className="text-xs font-semibold uppercase tracking-wider text-muted">{view ? 'Verified, not subscribed' : 'My registered users'}</h2>
            <span className="badge badge-neutral">My assigned</span>
          </div>

          <FilterBar>
            <SearchField id="ru-search" value={q} onChange={setQ} placeholder="Name, email or organisation" />
            <SelectField id="ru-verified" label="Verification" value={verified} onChange={v => { setVerified(v); setPage(1); }}
              options={[{ value: '', label: 'All' }, { value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }]} />
            <SelectField id="ru-sub" label="Subscription" value={subscription} onChange={v => { setSubscription(v); setPage(1); }}
              options={[{ value: '', label: 'All' }, { value: 'active', label: 'Any active' }, { value: 'inactive', label: 'No active subscription' },
                ...SUB_ORDER.map(s => ({ value: s, label: SUB_LABEL[s] }))]} />
            <Button variant="outline" onClick={reset} disabled={!filtered && !q} className="sm:mb-px"><X size={14} aria-hidden="true" /> Clear filters</Button>
          </FilterBar>

          {view && (
            <div className="flex items-center gap-2 rounded-lg border border-rule bg-accent-soft px-3 py-2 text-sm text-ink-2">
              <BadgeCheck size={14} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">Showing assigned members with a verified email and no running subscription.</span>
              <button type="button" onClick={() => showFollowUps(false)} className="shrink-0 text-xs font-semibold text-accent hover:underline">Show all</button>
            </div>
          )}

          <p className="text-sm text-muted" aria-live="polite">
            {data ? <><b className="tabular-nums text-ink">{fmtNum(data.total)}</b> {data.total === 1 ? 'member' : 'members'}{filtered ? ' match your filters' : ' linked to your assigned leads'}</> : ' '}
          </p>

          <div className="card overflow-hidden">
            {loading && !data ? (
              <div className="p-5" role="status" aria-label="Loading registered users"><SkeletonRows rows={6} /></div>
            ) : error ? (
              <ApiErrorState error={error} subject="Your registered users" onRetry={load} />
            ) : !data || data.total === 0 ? (
              filtered
                ? <EmptyState icon={Search} title="No matching users" description="No member linked to your leads matches these filters." action={<Button variant="outline" onClick={reset}>Clear filters</Button>} />
                : <EmptyState icon={Users} title="No registered users assigned to you yet" description="Members whose signup lead is assigned to you appear here. Nothing is assigned automatically." />
            ) : (
              <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <div className="table-wrap hidden md:block">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Email</th><th className="whitespace-nowrap">Registered on</th><th>Verification</th><th>Subscription</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map(m => (
                        <tr key={m.email}>
                          <td className="max-w-[240px]"><MemberName m={m} />{m.organization && <span className="mt-0.5 block truncate text-xs text-muted">{m.organization}</span>}</td>
                          <td className="max-w-[240px] truncate">{m.email}</td>
                          <td className="whitespace-nowrap text-ink-2">{fmtRegistered(m.registeredAt)}</td>
                          <td className="whitespace-nowrap"><VerifiedBadge yes={m.verified} /></td>
                          <td className="whitespace-nowrap"><SubscriptionBadge status={m.subscription} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-rule md:hidden">
                  {data.members.map(m => (
                    <li key={m.email} className="space-y-2 p-4">
                      <div className="min-w-0"><MemberName m={m} /><p className="truncate text-xs text-muted">{m.email}</p>{m.organization && <p className="truncate text-xs text-muted">{m.organization}</p>}</div>
                      <div className="flex flex-wrap items-center gap-2"><VerifiedBadge yes={m.verified} /><SubscriptionBadge status={m.subscription} /></div>
                      <p className="flex items-center gap-1 text-xs text-muted"><Clock size={12} className="text-faint" aria-hidden="true" />Registered {fmtRegistered(m.registeredAt)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {data && data.total > 0 && (
            <SmartPagination page={data.page} totalPages={data.pages} total={data.total} pageSize={data.pageSize} onChange={setPage} />
          )}
          {!!data?.ambiguous && (
            <DataNote>
              {fmtNum(data.ambiguous)} {data.ambiguous === 1 ? 'member matches' : 'members match'} leads assigned to you and to another executive, so whose they are cannot be told. They are not listed.
            </DataNote>
          )}
          <DataNote>
            Only members behind leads assigned to you are listed, matched by the email on the lead. Overall registration counts for everyone are on the Dashboard. This page is view only: it cannot edit accounts, change verification or subscriptions, or export data.
          </DataNote>
        </section>
      </div>
    </div>
  );
}
