import React, { useEffect, useState } from 'react';
import { CreditCard, Library, Clock, ArrowRight, AlertCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { buttonClass, Card, CardHeader, EmptyState, MetricCard, PageHeader, StatusBadge } from '../ui';

export function SubscriberOverview() {
  const { profile } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/dashboard', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setData)
      .catch(() => toast.error("Failed to load overview data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy="true">
        <MetricCard label="Active subscriptions" value={null} loading />
        <MetricCard label="Covered domains" value={null} loading />
        <MetricCard label="Nearest expiry" value={null} loading />
      </div>
    );
  }

  // "None" only once we know there is none; if the request failed, "—".
  const nearestExpiryStr = data?.nearestExpiry ? new Date(data.nearestExpiry).toLocaleDateString() : (data ? 'None' : null);

  return (
    <div className="space-y-8 pb-12">
      {profile?.isDemoAccount && (
        <div role="status" className="flex flex-col gap-4 rounded-xl border border-caution bg-caution-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-ink">Demo Account</h2>
              <p className="mt-1 text-sm text-ink-2">
                This demo account is valid for 30 days and will expire on {profile.demoExpiresAt ? new Date(profile.demoExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'its expiry date'}.
              </p>
            </div>
          </div>
          <Link to="/contact" className={buttonClass('outline', 'sm', 'shrink-0')}>
            Request Access
          </Link>
        </div>
      )}

      <PageHeader
        title="Welcome back!"
        description="Here's an overview of your active subscriptions and content access."
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Active subscriptions"
          icon={CreditCard}
          value={data ? (data.activeSubscriptions ?? 0).toLocaleString() : null}
          context={data ? `Total spent: ₹${(data.totalSpent ?? 0).toLocaleString()}` : undefined}
        />
        <MetricCard
          label="Covered domains"
          icon={Library}
          value={data ? (data.allowedDomains?.length ?? 0).toLocaleString() : null}
          context="Across the library platforms"
        />
        <MetricCard
          label="Nearest expiry"
          icon={Clock}
          value={nearestExpiryStr}
          context={data?.nearestExpiry ? (
            <Link to="/dashboard/subscriptions" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
              Manage <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : undefined}
        />
      </div>

      {/* Expired Subscriptions Alert */}
      {data?.expiredSubscriptions?.length > 0 && (
        <section className="space-y-4" aria-labelledby="overview-expired">
          <h2 id="overview-expired" className="flex items-center gap-2 type-section text-ink">
            <AlertCircle size={20} className="text-caution" aria-hidden="true" /> Expired Subscriptions
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.expiredSubscriptions.map((sub: any) => (
              <div key={sub.id} className="flex flex-col items-start justify-between gap-4 rounded-xl border border-caution bg-caution-soft p-5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{sub.domainName}</h3>
                    <StatusBadge status="subscription-expired" />
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    Expired on: {new Date(sub.endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <Link to="/contact" className={buttonClass('primary', 'sm', 'shrink-0')}>
                  Request Renewal
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mini Activity & Allowed Domains */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your Purchased Domains" />
          <div className="space-y-2">
            {data?.allowedDomains?.length > 0 ? data.allowedDomains.map((domain: string) => (
              <Link
                key={domain}
                to="/dashboard/library/access"
                className="group flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3 transition-colors duration-150 hover:bg-accent-soft"
              >
                <span className="min-w-0 truncate font-semibold text-ink">{domain}</span>
                <ArrowRight size={18} className="shrink-0 text-accent" aria-hidden="true" />
              </Link>
            )) : (
              <EmptyState
                icon={Library}
                title="No subscriptions found"
                description="You don't have any active subscriptions yet."
                className="py-8"
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Activity" />
          {data?.recentActivity?.length ? (
            <ul className="divide-y divide-rule">
              {data.recentActivity.map((activity: any) => (
                <li key={activity.id} className="flex flex-col justify-between gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{activity.title}</div>
                    <div className="mt-1 text-xs text-muted">{activity.type}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted">
                    {new Date(activity.date).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Clock}
              title="No reading activity yet"
              description="What you open will show up here."
              className="py-8"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
