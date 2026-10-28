import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Clock, MailQuestion, Search, Sparkles, Users, ArrowRight } from 'lucide-react';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, Button, buttonClass } from '../ui';
import { SmartPagination } from '../SmartPagination';
import { DataNote, FilterBar, SearchField, SelectField } from './salesUi';
import {
  fmtNum, fmtRegistered, getJson, SubscriptionBadge, SUB_LABEL, SUB_ORDER,
  type FollowUps, type Member, type MemberPage,
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

export function RegisteredUsers() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'verified-unsubscribed' ? 'verified-unsubscribed' : '';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [verified, setVerified] = useState('');
  const [subscription, setSubscription] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MemberPage | null>(null);
  const [followUps, setFollowUps] = useState<FollowUps | null | 'failed'>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  // The search box waits for a pause in typing before asking the server.
  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true); setFailed(false);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQ) qs.set('q', debouncedQ);
    if (verified) qs.set('verified', verified);
    if (subscription) qs.set('subscription', subscription);
    if (view) qs.set('view', view);
    try {
      const d = await getJson<MemberPage>(`/api/sales/registrations/users?${qs}`);
      if (id === seq.current) setData(d);
    } catch {
      if (id === seq.current) setFailed(true);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [page, debouncedQ, verified, subscription, view]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getJson<FollowUps>('/api/sales/registrations/follow-ups').then(setFollowUps).catch(() => setFollowUps('failed'));
  }, []);

  const anyFilter = !!(debouncedQ || verified || subscription || view);
  const reset = () => { setQ(''); setDebouncedQ(''); setVerified(''); setSubscription(''); setPage(1); setParams({}, { replace: true }); };
  const showFollowUps = (on: boolean) => { setPage(1); setParams(on ? { view: 'verified-unsubscribed' } : {}, { replace: true }); };

  const heading = (
    <PageHeader
      title="Registered Users — View Only"
      description="Members behind the leads assigned to you. You can look and follow up here; nothing on this page changes an account."
    />
  );

  return (
    <div>
      {heading}
      <div className="space-y-6">
        {/* Follow-ups */}
        <section aria-labelledby="fu-h" className="space-y-3">
          <h2 id="fu-h" className="text-xs font-semibold uppercase tracking-wider text-muted">Follow-ups</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            <div className="card card-pad flex flex-col">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-caution-soft text-caution" aria-hidden="true"><MailQuestion size={18} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Verified, not subscribed <span className="badge badge-neutral ml-1">My assigned</span></p>
                  <p className="mt-0.5 text-xs text-muted">Confirmed their email, hold no running subscription — the warmest people to call.</p>
                </div>
              </div>
              {followUps === null ? <Skeleton className="mt-4 h-16 rounded-lg" /> :
                followUps === 'failed' ? <p className="mt-4 text-sm text-muted">Follow-ups could not be loaded.</p> :
                followUps.verifiedUnsubscribed.total === 0 ? <p className="mt-4 text-sm text-muted">All clear — none of your assigned members is waiting.</p> : (
                  <>
                    <p className="mt-3 text-2xl font-bold tabular-nums text-ink">{fmtNum(followUps.verifiedUnsubscribed.total)}</p>
                    <ul className="mt-2 divide-y divide-rule">
                      {followUps.verifiedUnsubscribed.members.slice(0, 5).map(m => (
                        <li key={m.email} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 flex-1"><MemberName m={m} /><span className="block truncate text-xs text-muted">{m.email}</span></span>
                          <span className="shrink-0 text-xs text-muted">{fmtRegistered(m.registeredAt)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-3">
                      <Button variant="outline" size="sm" onClick={() => showFollowUps(true)}>Show all in the table <ArrowRight size={14} aria-hidden="true" /></Button>
                    </div>
                  </>
                )}
            </div>

            <div className="card card-pad flex flex-col">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-caution-soft text-caution" aria-hidden="true"><Sparkles size={18} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Subscription enquiries waiting <span className="badge badge-neutral ml-1">Whole team</span></p>
                  <p className="mt-0.5 text-xs text-muted">Members who asked for help to subscribe. These go to whoever is free first, so they are not limited to your leads.</p>
                </div>
              </div>
              {followUps === null ? <Skeleton className="mt-4 h-16 rounded-lg" /> :
                followUps === 'failed' ? <p className="mt-4 text-sm text-muted">The enquiry count could not be loaded.</p> : (
                  <p className="mt-3 text-2xl font-bold tabular-nums text-ink">{fmtNum(followUps.pendingEnquiries)}</p>
                )}
              <div className="mt-auto pt-3">
                <Link to="/sales/pro-applications" className={buttonClass('outline', 'sm')}>Open enquiries <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
        </section>

        {/* The table */}
        <section aria-labelledby="ru-h" className="space-y-4">
          <h2 id="ru-h" className="text-xs font-semibold uppercase tracking-wider text-muted">
            {view ? 'Verified, not subscribed' : 'My registered users'}
          </h2>
          <FilterBar>
            <SearchField id="ru-search" value={q} onChange={setQ} placeholder="Name, email or organisation" />
            <SelectField id="ru-verified" label="Verification" value={verified} onChange={v => { setVerified(v); setPage(1); }}
              options={[{ value: '', label: 'All' }, { value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }]} />
            <SelectField id="ru-sub" label="Subscription" value={subscription} onChange={v => { setSubscription(v); setPage(1); }}
              options={[{ value: '', label: 'All' }, { value: 'active', label: 'Any active' }, { value: 'inactive', label: 'No active subscription' },
                ...SUB_ORDER.map(s => ({ value: s, label: SUB_LABEL[s] }))]} />
          </FilterBar>
          {view && (
            <div className="flex items-center gap-2 rounded-lg border border-rule bg-accent-soft px-3 py-2 text-sm text-ink-2">
              <BadgeCheck size={14} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">Showing assigned members with a verified email and no running subscription.</span>
              <button type="button" onClick={() => showFollowUps(false)} className="shrink-0 text-xs font-semibold text-accent hover:underline">Show all</button>
            </div>
          )}

          <div className="card overflow-hidden">
            {loading && !data ? (
              <div className="p-5"><SkeletonRows rows={6} /></div>
            ) : failed ? (
              <ErrorState title="Your registered users could not be loaded" onRetry={load} />
            ) : !data || data.total === 0 ? (
              anyFilter
                ? <EmptyState icon={Search} title="No members match" description="Try a different search, or clear the filters." action={<Button variant="outline" onClick={reset}>Clear filters</Button>} />
                : <EmptyState icon={Users} title="No registered members assigned to you yet" description="Members who signed up and whose lead is assigned to you appear here. Nothing is assigned automatically." />
            ) : (
              <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <div className="table-wrap hidden md:block">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Email</th><th className="whitespace-nowrap">Registered</th><th>Verification</th><th>Subscription</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map(m => (
                        <tr key={m.email}>
                          <td className="max-w-[260px]"><MemberName m={m} />{m.organization && <span className="mt-0.5 block truncate text-xs text-muted">{m.organization}</span>}</td>
                          <td className="max-w-[260px] truncate">{m.email}</td>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <VerifiedBadge yes={m.verified} /><SubscriptionBadge status={m.subscription} />
                      </div>
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
          <DataNote>
            Only members behind leads assigned to you are listed — matched by the email on the lead. Overall registration counts for everyone are on the Dashboard. This page is view only: it cannot edit accounts, change verification or subscriptions, or export data.
          </DataNote>
        </section>
      </div>
    </div>
  );
}
