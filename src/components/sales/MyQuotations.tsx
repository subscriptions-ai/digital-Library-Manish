import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { format, formatDistanceToNowStrict, isPast } from 'date-fns';
import {
  FileText, Search, RefreshCw, Inbox, Plus, Mail, Building2,
  Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Button, Dialog, EmptyState, ErrorState, MetricCard, SkeletonRows, StatusBadge } from '../ui';

const ALL_STATUSES = ['All', 'Pending', 'Sent', 'Downloaded', 'Approved', 'Paid', 'Cancelled'];

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);

/** Absolute date plus a relative hint — "12 Aug 2026, 10:49 (7 days ago)". */
function Stamp({ value, prefix }: { value?: string | null; prefix?: string }) {
  if (!value) return <span className="text-muted">—</span>;
  const d = new Date(value);
  return (
    <span title={d.toISOString()}>
      {prefix}{format(d, 'd MMM yyyy, HH:mm')}
      <span className="text-muted"> ({formatDistanceToNowStrict(d)} ago)</span>
    </span>
  );
}

/** The section heading inside the detail drawer. */
function DrawerSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-rule p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{icon}{title}</h3>
      {children}
    </section>
  );
}

export function MyQuotations() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, value: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
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
      setLoadFailed(true);
      toast.error('Could not load your quotations');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const closeDrawer = useCallback(() => setSelected(null), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-page-title flex items-center gap-2 text-ink">
            <FileText className="text-accent shrink-0" size={22} aria-hidden="true" />
            My Quotations
          </h1>
          <p className="mt-1 text-sm text-muted">
            Every quotation raised from your account, newest first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </Button>
          <Button onClick={() => navigate('/sales/quotations/create')}>
            <Plus size={16} aria-hidden="true" />
            New Quotation
          </Button>
        </div>
      </div>

      {/* Totals — a failed load shows a dash, not a row of zeros. */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Raised', value: String(stats.total) },
          { label: 'Paid', value: String(stats.paid) },
          { label: 'Open', value: String(stats.pending) },
          { label: 'Value won', value: inr(stats.value) },
        ].map(s => (
          <MetricCard key={s.label} label={s.label} value={loadFailed ? null : s.value} loading={loading && !rows.length} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="quotation-search" className="field-label">Search</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id="quotation-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Number, customer or organisation"
              className="input pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 ${
                status === s
                  ? 'border-accent bg-accent text-accent-on'
                  : 'border-rule bg-surface text-ink-2 hover:bg-surface-2'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonRows rows={5} /></div>
        ) : loadFailed ? (
          <ErrorState title="Your quotations could not be loaded" onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={search || status !== 'All' ? 'Nothing matches that filter' : 'You have not raised any quotations yet'}
            action={!search && status === 'All' ? (
              <Button onClick={() => navigate('/sales/quotations/create')}>
                Create your first quotation
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table min-w-[50rem]">
              <thead>
                <tr>
                  {['Quotation', 'Customer', 'Plan', 'Amount', 'Created', 'Valid until', 'Status'].map(h => (
                    <th key={h}>{h}</th>
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
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(q); } }}
                      tabIndex={0}
                      aria-label={`Open quotation ${q.id}`}
                      className="cursor-pointer"
                    >
                      <td>
                        <span className="font-mono text-xs font-semibold text-ink">{q.id}</span>
                      </td>
                      <td>
                        <p className="font-semibold text-ink">{q.userName}</p>
                        <p className="text-xs text-muted">{q.organization || q.userEmail}</p>
                      </td>
                      <td>{q.planType || '—'}</td>
                      <td className="font-semibold tabular-nums text-ink">{inr(q.total)}</td>
                      <td className="text-xs text-muted"><Stamp value={q.createdAt} /></td>
                      <td className="text-xs">
                        {expired
                          ? <span className="badge badge-caution"><AlertTriangle size={12} aria-hidden="true" /> Expired</span>
                          : <span className="text-muted">{q.expiresAt ? format(new Date(q.expiresAt), 'd MMM yyyy') : '—'}</span>}
                      </td>
                      <td><StatusBadge status={q.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <Dialog
        open={!!selected}
        onClose={closeDrawer}
        side="right"
        title={selected ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{selected.id}</span>
            <StatusBadge status={selected.status} />
          </span>
        ) : ''}
        description={selected ? <span className="text-xl font-bold tabular-nums text-ink">{inr(selected.total)}</span> : undefined}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <DrawerSection title="Customer">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">Name</dt><dd className="font-medium text-ink">{selected.userName}</dd></div>
                <div><dt className="text-xs text-muted">Organisation</dt><dd className="inline-flex items-center gap-1.5 font-medium text-ink"><Building2 size={14} className="text-faint" aria-hidden="true" />{selected.organization || '—'}</dd></div>
                <div className="sm:col-span-2 min-w-0">
                  <dt className="text-xs text-muted">Email</dt>
                  <dd><a href={`mailto:${selected.userEmail}`} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline break-all"><Mail size={14} aria-hidden="true" />{selected.userEmail}</a></dd>
                </div>
                {selected.mobile && <div><dt className="text-xs text-muted">Mobile</dt><dd className="font-medium text-ink">{selected.mobile}</dd></div>}
                {selected.state && <div><dt className="text-xs text-muted">State</dt><dd className="font-medium text-ink">{selected.state}</dd></div>}
                {selected.gstNumber && <div className="sm:col-span-2"><dt className="text-xs text-muted">GSTIN</dt><dd className="font-mono text-xs text-ink">{selected.gstNumber}</dd></div>}
              </dl>
            </DrawerSection>

            <DrawerSection title="Timeline" icon={<Clock size={14} aria-hidden="true" />}>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted">Created</dt>
                  <dd className="text-right text-ink"><Stamp value={selected.createdAt} /></dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted">Valid until</dt>
                  <dd className="text-right text-ink">
                    {selected.expiresAt ? format(new Date(selected.expiresAt), 'd MMM yyyy, HH:mm') : '—'}
                    {selected.expiresAt && isPast(new Date(selected.expiresAt)) && selected.status !== 'Paid' && (
                      <span className="badge badge-caution ml-2">Expired</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Delivery</dt>
                  <dd className="text-right font-medium text-ink">{selected.deliveryMethod || 'Email'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Raised by</dt>
                  <dd className="text-right font-medium text-ink break-all">{selected.createdBy}</dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Amount">
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Plan</dt><dd className="font-medium text-ink">{selected.planType || '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums text-ink">{inr(selected.subtotal)}</dd></div>
                {selected.discountAmount > 0 && (
                  <div className="flex justify-between gap-4 text-success">
                    <dt>Discount{selected.couponCode ? ` (${selected.couponCode})` : ''}</dt>
                    <dd className="tabular-nums">− {inr(selected.discountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4"><dt className="text-muted">GST</dt><dd className="tabular-nums text-ink">{inr(selected.gstAmount)}</dd></div>
                <div className="mt-1 flex justify-between gap-4 border-t border-rule pt-3 text-base font-bold text-ink">
                  <dt>Total</dt><dd className="tabular-nums">{inr(selected.total)}</dd>
                </div>
              </dl>
            </DrawerSection>

            {Array.isArray(selected.items) && selected.items.length > 0 && (
              <DrawerSection title="Line items">
                <ul className="flex flex-col gap-2 text-sm">
                  {selected.items.map((it: any, i: number) => (
                    <li key={i} className="flex justify-between gap-4 border-b border-rule pb-2 last:border-0 last:pb-0">
                      <span className="text-ink-2">{it.domainName || it.name || it.title || `Item ${i + 1}`}</span>
                      <span className="shrink-0 tabular-nums text-muted">{it.price != null ? inr(it.price) : ''}</span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>
            )}

            {selected.notes && (
              <DrawerSection title="Notes">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{selected.notes}</p>
              </DrawerSection>
            )}

            {selected.status === 'Paid' && (
              <div className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
                <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />
                Marked paid — the receipt is issued from the admin portal.
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
