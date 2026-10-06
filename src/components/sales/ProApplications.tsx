import React, { useEffect, useState } from 'react';
import { Sparkles, Mail, Phone, Building2, Clock } from 'lucide-react';
import { Badge, EmptyState, ErrorState, SkeletonRows } from '../ui';

/**
 * Pro applications, for the sales team.
 *
 * A sales executive is only shown the leads assigned to them, and the requests
 * screen belongs to administrators — so without this page, somebody asking to
 * pay would be visible to nobody who could ring them until an administrator
 * happened to assign the lead. These are shown to the whole team, unassigned,
 * because the first person free to call should be able to.
 *
 * Access itself is still granted by an administrator under Subscription
 * Requests. This page is for the conversation, not the approval.
 */
export function ProApplications() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState<'Pending' | ''>('Pending');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/sales/pro-applications${filter ? `?status=${filter}` : ''}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const ago = (iso: string) => {
    const h = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6);
    if (h < 1) return 'just now';
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };

  const rows: any[] = data?.applications || [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sales</p>
          <h1 className="type-page-title mt-1 flex items-center gap-2 text-ink">
            <Sparkles size={20} className="text-accent shrink-0" aria-hidden="true" /> Pro applications
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Members who have run into the free reading limit and asked for a membership without one.
            Call to agree terms; an administrator grants the access under Subscription Requests.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-rule bg-surface p-1" role="group" aria-label="Show applications">
          {([['Pending', 'Waiting'], ['', 'All']] as const).map(([v, label]) => (
            <button key={label} onClick={() => setFilter(v as any)}
              aria-pressed={filter === v}
              className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors duration-150 ${
                filter === v ? 'bg-accent text-accent-on' : 'text-ink-2 hover:bg-surface-2'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card card-pad mt-6"><SkeletonRows rows={4} /></div>
      ) : data === null ? (
        // The request failed (a success always returns an object), so say so
        // rather than claim nobody has applied.
        <ErrorState className="mt-6" title="Applications could not be loaded" onRetry={load} />
      ) : !rows.length ? (
        <div className="card mt-6">
          <EmptyState
            icon={Sparkles}
            title={filter ? 'Nobody is waiting for a decision.' : 'No applications yet.'}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map(a => (
            <div key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{a.member?.displayName || a.userName}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1 min-w-0 break-all"><Mail size={12} className="shrink-0" aria-hidden="true" /> {a.email}</span>
                    {(a.member?.contact) && <span className="inline-flex items-center gap-1"><Phone size={12} aria-hidden="true" /> {a.member.contact}</span>}
                    {(a.member?.organization) && <span className="inline-flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> {a.member.organization}</span>}
                    <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" /> {ago(a.createdAt)}</span>
                  </div>
                </div>
                <Badge dot tone={a.status === 'Pending' ? 'caution' : a.status === 'Approved' ? 'success' : 'neutral'}>
                  {a.status === 'Pending' ? 'Waiting' : a.status}
                </Badge>
              </div>

              {a.notes && (
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-3 py-2 font-sans text-[13px] leading-relaxed text-ink-2">
                  {a.notes}
                </pre>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${a.email}`} className="btn btn-outline btn-sm">
                  <Mail size={14} aria-hidden="true" /> Email
                </a>
                {a.member?.contact && (
                  <a href={`tel:${a.member.contact}`} className="btn btn-primary btn-sm">
                    <Phone size={14} aria-hidden="true" /> Call
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
