import React, { useEffect, useState } from 'react';
import { Sparkles, Mail, Phone, Building2, Clock, Loader2 } from 'lucide-react';

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
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sales</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
            <Sparkles size={22} className="text-indigo-600" /> Pro applications
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Members who have run into the free reading limit and asked for a membership without one.
            Call to agree terms; an administrator grants the access under Subscription Requests.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {([['Pending', 'Waiting'], ['', 'All']] as const).map(([v, label]) => (
            <button key={label} onClick={() => setFilter(v as any)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                filter === v ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 className="animate-spin" size={16} /> Loading…
        </div>
      ) : !rows.length ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-400">
          {filter ? 'Nobody is waiting for a decision.' : 'No applications yet.'}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map(a => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{a.member?.displayName || a.userName}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Mail size={12} /> {a.email}</span>
                    {(a.member?.contact) && <span className="inline-flex items-center gap-1"><Phone size={12} /> {a.member.contact}</span>}
                    {(a.member?.organization) && <span className="inline-flex items-center gap-1"><Building2 size={12} /> {a.member.organization}</span>}
                    <span className="inline-flex items-center gap-1"><Clock size={12} /> {ago(a.createdAt)}</span>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  a.status === 'Pending' ? 'bg-amber-100 text-amber-700'
                  : a.status === 'Approved' ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'}`}>
                  {a.status === 'Pending' ? 'Waiting' : a.status}
                </span>
              </div>

              {a.notes && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-slate-600">
                  {a.notes}
                </pre>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${a.email}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                  Email
                </a>
                {a.member?.contact && (
                  <a href={`tel:${a.member.contact}`}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                    Call
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
