import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Mail, Phone, Building2, FileText } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../ui';
import { FilterChips, formatStamp, timeAgo } from './salesUi';

/**
 * Subscription enquiries, for the sales team.
 *
 * Formerly "Pro applications". A member can now buy a subscription on their own
 * — choose departments, download the quotation, pay — so this is no longer the
 * way in. It is the way in for the member who would rather talk first: the form
 * on their membership page still files one of these, and the same record is
 * what administrators approve under Subscription Requests. The route, the API
 * and every earlier record are unchanged; only what the page says it is for.
 *
 * A sales executive is only shown the leads assigned to them, and the requests
 * screen belongs to administrators, so these are shown to the whole team,
 * unassigned: the first person free to call should be able to.
 */

/** The server writes these notes in a fixed shape; read them back into fields, and keep whatever does not fit. */
function readNotes(notes?: string | null) {
  const out = { role: '', interests: '', sessions: '', words: '', rest: [] as string[] };
  for (const line of String(notes || '').split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = /^(Designation|Wants to read|In their words|Free sessions used so far|Applying for):\s*(.*)$/.exec(line);
    if (!m) { out.rest.push(line); continue; }
    if (m[1] === 'Designation') out.role = m[2];
    else if (m[1] === 'Wants to read') out.interests = m[2];
    else if (m[1] === 'In their words') out.words = m[2];
    else if (m[1] === 'Free sessions used so far') out.sessions = m[2];
    // "Applying for" only restated which plan; the page's title already says.
  }
  return out;
}

const STATUS_TONE: Record<string, 'caution' | 'success' | 'neutral' | 'alarm'> = {
  Pending: 'caution', Approved: 'success', Rejected: 'alarm',
};
const STATUS_WORD: Record<string, string> = { Pending: 'Waiting', Approved: 'Approved', Rejected: 'Declined' };

export function ProApplications() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState<'Pending' | ''>('Pending');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/sales/pro-applications${filter ? `?status=${filter}` : ''}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(load, [load]);

  const rows: any[] = data?.applications || [];

  return (
    <div>
      <PageHeader
        title="Subscription Enquiries"
        description="Members who asked for help with a Premium Subscription. Call to agree terms; an administrator activates access under Subscription Requests."
        actions={
          <FilterChips label="Show enquiries" value={filter} onChange={k => setFilter(k as any)}
            options={[{ key: 'Pending', label: 'Waiting', count: data?.pending }, { key: '', label: 'All' }]} />
        }
      />

      {loading ? (
        <div className="card card-pad"><SkeletonRows rows={4} /></div>
      ) : data === null ? (
        // The request failed (a success always returns an object), so say so
        // rather than claim nobody has asked.
        <div className="card"><ErrorState title="Enquiries could not be loaded" onRetry={load} /></div>
      ) : !rows.length ? (
        <div className="card">
          <EmptyState
            icon={Sparkles}
            title={filter ? 'No subscription enquiries waiting' : 'No subscription enquiries yet'}
            description={filter ? 'Everyone who has asked for help has been dealt with.' : 'Members who ask for help with a subscription will appear here.'}
            action={filter ? <Button variant="outline" onClick={() => setFilter('')}>Show all enquiries</Button> : undefined}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map(a => {
            const n = readNotes(a.notes);
            const phone = a.member?.contact;
            return (
              <li key={a.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink">{a.member?.displayName || a.userName}</h2>
                    <time dateTime={a.createdAt} title={formatStamp(a.createdAt)} className="text-xs text-muted">Submitted {timeAgo(a.createdAt)}</time>
                  </div>
                  <Badge dot tone={STATUS_TONE[a.status] ?? 'neutral'}>{STATUS_WORD[a.status] ?? a.status}</Badge>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-ink-2">
                  <li className="flex items-center gap-2 min-w-0"><Mail size={14} className="shrink-0 text-faint" aria-hidden="true" /><span className="truncate">{a.email}</span></li>
                  {phone && <li className="flex items-center gap-2"><Phone size={14} className="shrink-0 text-faint" aria-hidden="true" />{phone}</li>}
                  {a.member?.organization && <li className="flex items-center gap-2 min-w-0"><Building2 size={14} className="shrink-0 text-faint" aria-hidden="true" /><span className="truncate">{a.member.organization}</span></li>}
                </ul>

                <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-rule pt-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted">Request</dt><dd className="font-medium text-ink">Subscription assistance</dd></div>
                  {n.role && <div><dt className="text-xs text-muted">Role</dt><dd className="font-medium text-ink">{n.role}</dd></div>}
                  {n.interests && <div className="sm:col-span-2"><dt className="text-xs text-muted">Wants to read</dt><dd className="font-medium text-ink">{n.interests}</dd></div>}
                  {n.sessions && <div><dt className="text-xs text-muted">Free sessions used</dt><dd className="font-medium tabular-nums text-ink">{n.sessions}</dd></div>}
                </dl>

                {(n.words || n.rest.length > 0) && (
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                    {n.words ? <><span className="text-muted">In their words: </span>{n.words}</> : n.rest.join('\n')}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <a href={`mailto:${a.email}`} className="btn btn-outline btn-sm"><Mail size={14} aria-hidden="true" /> Email</a>
                  {phone && <a href={`tel:${phone}`} className="btn btn-primary btn-sm"><Phone size={14} aria-hidden="true" /> Call</a>}
                  {a.status === 'Pending' && (
                    <Link to="/sales/quotations/create" className="btn btn-ghost btn-sm"><FileText size={14} aria-hidden="true" /> Create quotation</Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
