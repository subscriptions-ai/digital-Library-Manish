import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { format, formatDistanceToNowStrict, isPast } from 'date-fns';
import {
  FileText, Search, RefreshCw, Inbox, X, Plus, Mail, Building2,
  Clock, AlertTriangle, CheckCircle2, Download,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  Pending:    'bg-amber-100 text-amber-700 border-amber-200',
  Sent:       'bg-blue-100 text-blue-700 border-blue-200',
  Downloaded: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Approved:   'bg-teal-100 text-teal-700 border-teal-200',
  Paid:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled:  'bg-slate-100 text-slate-600 border-slate-200',
};

const ALL_STATUSES = ['All', 'Pending', 'Sent', 'Downloaded', 'Approved', 'Paid', 'Cancelled'];

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

/** Absolute date plus a relative hint — "12 Aug 2026, 10:49 (7 days ago)". */
function Stamp({ value, prefix }: { value?: string | null; prefix?: string }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const d = new Date(value);
  return (
    <span title={d.toISOString()}>
      {prefix}{format(d, 'd MMM yyyy, HH:mm')}
      <span className="text-slate-400"> ({formatDistanceToNowStrict(d)} ago)</span>
    </span>
  );
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {status}
    </span>
  );
}

export function MyQuotations() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, value: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'All') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/my/quotations?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.quotations || []);
      setStats(data.stats || { total: 0, paid: 0, pending: 0, value: 0 });
    } catch {
      toast.error('Could not load your quotations');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
            <FileText className="text-indigo-600" size={24} />
            My Quotations
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Every quotation raised from your account, newest first.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/sales/quotations/create')}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
          >
            <Plus size={16} />
            New Quotation
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Raised', value: String(stats.total) },
          { label: 'Paid', value: String(stats.paid) },
          { label: 'Open', value: String(stats.pending) },
          { label: 'Value won', value: inr(stats.value) },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[15rem] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search number, customer or organisation…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                status === s
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-16 text-center text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-16 text-center">
            <Inbox size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">
              {search || status !== 'All' ? 'Nothing matches that filter' : 'You have not raised any quotations yet'}
            </p>
            {!search && status === 'All' && (
              <button
                onClick={() => navigate('/sales/quotations/create')}
                className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
              >
                Create your first quotation
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[50rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Quotation', 'Customer', 'Plan', 'Amount', 'Created', 'Valid until', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(q => {
                  const expired = q.expiresAt && isPast(new Date(q.expiresAt)) && q.status !== 'Paid';
                  return (
                    <tr
                      key={q.id}
                      onClick={() => setSelected(q)}
                      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-slate-900">{q.id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{q.userName}</p>
                        <p className="text-[11px] text-slate-400">{q.organization || q.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{q.planType || '—'}</td>
                      <td className="px-4 py-3 font-bold tabular-nums text-slate-900">{inr(q.total)}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-500"><Stamp value={q.createdAt} /></td>
                      <td className="px-4 py-3 text-[11px]">
                        {expired
                          ? <span className="inline-flex items-center gap-1 font-bold text-red-600"><AlertTriangle size={11} /> Expired</span>
                          : <span className="text-slate-500">{q.expiresAt ? format(new Date(q.expiresAt), 'd MMM yyyy') : '—'}</span>}
                      </td>
                      <td className="px-4 py-3"><Badge status={q.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div
            onClick={e => e.stopPropagation()}
            className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-slate-50 shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-7 py-5">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">{selected.id}</span>
                  <Badge status={selected.status} />
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{inr(selected.total)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-5 p-7">
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer</h3>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-400">Name</dt><dd className="font-semibold text-slate-800">{selected.userName}</dd></div>
                  <div><dt className="text-xs text-slate-400">Organisation</dt><dd className="inline-flex items-center gap-1.5 font-semibold text-slate-800"><Building2 size={13} className="text-slate-400" />{selected.organization || '—'}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-400">Email</dt>
                    <dd><a href={`mailto:${selected.userEmail}`} className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:underline"><Mail size={13} />{selected.userEmail}</a></dd>
                  </div>
                  {selected.mobile && <div><dt className="text-xs text-slate-400">Mobile</dt><dd className="font-semibold text-slate-800">{selected.mobile}</dd></div>}
                  {selected.state && <div><dt className="text-xs text-slate-400">State</dt><dd className="font-semibold text-slate-800">{selected.state}</dd></div>}
                  {selected.gstNumber && <div className="sm:col-span-2"><dt className="text-xs text-slate-400">GSTIN</dt><dd className="font-mono text-xs text-slate-800">{selected.gstNumber}</dd></div>}
                </dl>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Clock size={13} /> Timeline
                </h3>
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Created</dt>
                    <dd className="text-right text-slate-800"><Stamp value={selected.createdAt} /></dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Valid until</dt>
                    <dd className="text-right text-slate-800">
                      {selected.expiresAt ? format(new Date(selected.expiresAt), 'd MMM yyyy, HH:mm') : '—'}
                      {selected.expiresAt && isPast(new Date(selected.expiresAt)) && selected.status !== 'Paid' && (
                        <span className="ml-1.5 font-bold text-red-600">expired</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Delivery</dt>
                    <dd className="text-right font-semibold text-slate-800">{selected.deliveryMethod || 'Email'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Raised by</dt>
                    <dd className="text-right font-semibold text-slate-800">{selected.createdBy}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Amount</h3>
                <dl className="flex flex-col gap-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Plan</dt><dd className="font-semibold text-slate-800">{selected.planType || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums text-slate-800">{inr(selected.subtotal)}</dd></div>
                  {selected.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <dt>Discount{selected.couponCode ? ` (${selected.couponCode})` : ''}</dt>
                      <dd className="tabular-nums">− {inr(selected.discountAmount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between"><dt className="text-slate-500">GST</dt><dd className="tabular-nums text-slate-800">{inr(selected.gstAmount)}</dd></div>
                  <div className="mt-1 flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900">
                    <dt>Total</dt><dd className="tabular-nums">{inr(selected.total)}</dd>
                  </div>
                </dl>
              </section>

              {Array.isArray(selected.items) && selected.items.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Line items</h3>
                  <ul className="flex flex-col gap-2 text-sm">
                    {selected.items.map((it: any, i: number) => (
                      <li key={i} className="flex justify-between gap-4 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                        <span className="text-slate-700">{it.domainName || it.name || it.title || `Item ${i + 1}`}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{it.price != null ? inr(it.price) : ''}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {selected.notes && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Notes</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selected.notes}</p>
                </section>
              )}

              {selected.status === 'Paid' && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 size={17} />
                  Marked paid — the receipt is issued from the admin portal.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
