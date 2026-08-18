import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ShieldAlert, Search, RefreshCw, Inbox, X, ExternalLink, Clock,
  AlertTriangle, CheckCircle, StickyNote, History, Mail, Building2, Link2,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  New:         'bg-red-100 text-red-700 border-red-200',
  UnderReview: 'bg-amber-100 text-amber-700 border-amber-200',
  ActionTaken: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Rejected:    'bg-slate-100 text-slate-600 border-slate-200',
  Withdrawn:   'bg-purple-100 text-purple-700 border-purple-200',
};

const STATUS_LABELS: Record<string, string> = {
  New: 'New', UnderReview: 'Under review', ActionTaken: 'Action taken',
  Rejected: 'Rejected', Withdrawn: 'Withdrawn',
};

const ALL_STATUSES = ['All', 'New', 'UnderReview', 'ActionTaken', 'Rejected', 'Withdrawn'];
const OPEN_STATUSES = ['New', 'UnderReview'];

const CAPACITY_LABELS: Record<string, string> = {
  RightsHolder: 'Rights holder', AuthorisedAgent: 'Authorised agent',
  Author: 'Author', Other: 'Other',
};

const ACTION_LABELS: Record<string, string> = {
  RemoveEntirely: 'Remove listing entirely',
  RemoveFileKeepMetadata: 'Remove file, keep metadata',
  AddAttribution: 'Correct/add attribution',
  Other: 'Other',
};

/** Where the content came from decides how strong our position is — surface it loudly. */
const ORIGIN_STYLES: Record<string, string> = {
  PublisherSubmitted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AdminEntered:       'bg-blue-50 text-blue-700 border-blue-200',
  Ingested:           'bg-amber-50 text-amber-700 border-amber-200',
};

const ORIGIN_HINTS: Record<string, string> = {
  PublisherSubmitted: 'Submitted by a publisher — check for a signed agreement before responding.',
  AdminEntered:       'Entered manually by an admin — verify the source before responding.',
  Ingested:           'Auto-ingested from an open-access index — no agreement backs this item.',
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function DueChip({ dueAt, status }: { dueAt: string; status: string }) {
  if (!OPEN_STATUSES.includes(status)) return <span className="text-xs text-slate-400">—</span>;
  const due = new Date(dueAt);
  const overdue = due.getTime() < Date.now();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
      {overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
      {overdue
        ? `${formatDistanceToNowStrict(due)} overdue`
        : `${formatDistanceToNowStrict(due)} left`}
    </span>
  );
}

export function TakedownRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ status: '', actionTaken: '', adminNotes: '' });

  const token = () => localStorage.getItem('token');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'All') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/takedown-requests?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setRequests(data.requests || []);
      setOpenCount(data.openCount || 0);
      setOverdueCount(data.overdueCount || 0);
    } catch {
      toast.error('Could not load takedown requests');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const openDetail = (r: any) => {
    setSelected(r);
    setDraft({ status: r.status, actionTaken: r.actionTaken || '', adminNotes: r.adminNotes || '' });
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/takedown-requests/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      toast.success('Request updated');
      setSelected(updated);
      load();
    } catch {
      toast.error('Could not update this request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
            <ShieldAlert className="text-red-600" size={24} />
            Content Removal Requests
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Rights complaints received from the public form. Each has a 7-day response commitment.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Counters */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Open</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{openCount}</p>
        </div>
        <div className={`rounded-2xl border p-5 ${overdueCount > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
          <p className={`text-xs font-bold uppercase tracking-widest ${overdueCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>
            Past due
          </p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${overdueCount > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {overdueCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total received</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{requests.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reference, requester, organisation or URL…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s === 'All' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-16 text-center text-sm text-slate-400">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center">
            <Inbox size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No requests found</p>
            <p className="mt-1 text-xs text-slate-400">
              Requests submitted from the public form appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Reference', 'Requester', 'Content', 'Origin', 'Due', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(r)}
                    className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-slate-900">{r.reference}</span>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {format(new Date(r.createdAt), 'd MMM yyyy')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{r.requesterName}</p>
                      <p className="text-[11px] text-slate-400">{r.organization || r.requesterEmail}</p>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <p className="truncate text-slate-700">{r.contentTitle || r.contentUrl}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{ACTION_LABELS[r.requestedAction]}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.ownershipSource ? (
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${ORIGIN_STYLES[r.ownershipSource] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {r.ownershipSource}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">unresolved</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><DueChip dueAt={r.dueAt} status={r.status} /></td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm"
             onClick={() => setSelected(null)}>
          <div
            onClick={e => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-slate-50 shadow-2xl"
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-7 py-5">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">{selected.reference}</span>
                  <Badge status={selected.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Received {format(new Date(selected.createdAt), 'd MMMM yyyy, HH:mm')} · due{' '}
                  {format(new Date(selected.dueAt), 'd MMMM yyyy')}
                </p>
              </div>
              <button onClick={() => setSelected(null)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-5 p-7">
              {selected.ownershipSource && (
                <div className={`rounded-2xl border p-4 text-xs font-semibold ${ORIGIN_STYLES[selected.ownershipSource]}`}>
                  {ORIGIN_HINTS[selected.ownershipSource]}
                </div>
              )}

              {/* Requester */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Requester</h3>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-400">Name</dt><dd className="font-semibold text-slate-800">{selected.requesterName}</dd></div>
                  <div><dt className="text-xs text-slate-400">Acting as</dt><dd className="font-semibold text-slate-800">{selected.capacityOther || CAPACITY_LABELS[selected.capacity]}</dd></div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-slate-400">Email</dt>
                    <dd><a href={`mailto:${selected.requesterEmail}`} className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:underline"><Mail size={13} />{selected.requesterEmail}</a></dd>
                  </div>
                  <div><dt className="text-xs text-slate-400">Organisation</dt><dd className="inline-flex items-center gap-1.5 font-semibold text-slate-800"><Building2 size={13} className="text-slate-400" />{selected.organization || '—'}</dd></div>
                </dl>
              </section>

              {/* Content */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Reported content</h3>
                <a href={selected.contentUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-start gap-1.5 break-all text-sm font-semibold text-blue-600 hover:underline">
                  <Link2 size={14} className="mt-0.5 shrink-0" />
                  {selected.contentUrl}
                  <ExternalLink size={12} className="mt-0.5 shrink-0" />
                </a>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-400">Title</dt><dd className="font-semibold text-slate-800">{selected.contentTitle || '—'}</dd></div>
                  <div><dt className="text-xs text-slate-400">Identifier</dt><dd className="font-mono text-xs text-slate-800">{selected.identifier || '—'}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-400">Requested action</dt>
                    <dd className="font-semibold text-slate-800">
                      {selected.requestedActionOther || ACTION_LABELS[selected.requestedAction]}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Claim */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Basis of claim</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selected.ownershipBasis}</p>
                {selected.additionalInfo && (
                  <>
                    <h3 className="mb-3 mt-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Additional information</h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selected.additionalInfo}</p>
                  </>
                )}
              </section>

              {/* Handling */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Handling</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-500">Status</label>
                    <select
                      value={draft.status}
                      onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                    >
                      {ALL_STATUSES.filter(s => s !== 'All').map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-500">
                      Action taken <span className="font-normal text-slate-400">(recorded in the audit trail)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={draft.actionTaken}
                      onChange={e => setDraft(d => ({ ...d, actionTaken: e.target.value }))}
                      placeholder="e.g. File access removed on 20 Aug; citation metadata retained. Requester notified."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                      <StickyNote size={13} /> Internal notes
                    </label>
                    <textarea
                      rows={3}
                      value={draft.adminNotes}
                      onChange={e => setDraft(d => ({ ...d, adminNotes: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                  >
                    <CheckCircle size={16} />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </section>

              {/* Audit trail */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <History size={13} /> Audit trail
                </h3>
                <ol className="flex flex-col gap-3">
                  {(Array.isArray(selected.auditTrail) ? selected.auditTrail : []).map((e: any, i: number) => (
                    <li key={i} className="flex gap-3 text-xs">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <div>
                        <p className="font-semibold text-slate-800">{e.event}</p>
                        <p className="text-slate-400">
                          {e.at ? format(new Date(e.at), 'd MMM yyyy, HH:mm') : ''} · {e.by}
                        </p>
                        {e.detail && <p className="mt-1 text-slate-500">{e.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 border-t border-slate-100 pt-4 text-[11px] text-slate-400">
                  Submitted from {selected.ipAddress || 'unknown address'}
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
