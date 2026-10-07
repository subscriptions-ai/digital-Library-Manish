import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { isPast, differenceInCalendarDays } from 'date-fns';
import {
  FileText, RefreshCw, Inbox, Plus, Mail, Building2, Search,
  Clock, CheckCircle2, Download, Pencil, Printer, Eye,
} from 'lucide-react';
import { docOfRow, rowToRender, statusLabel } from '../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../lib/quotation/quotationPdf';
import { printQuotation } from '../../lib/quotation/quotationPrint';
import { Badge, Button, Dialog, EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge, type BadgeTone } from '../ui';
import { ActionMenu, ActiveFilter, FilterBar, FilterChips, SearchField, StatCard, formatDay, formatStamp, inr, pct } from './salesUi';

// "Open" is not a stored status: it is everything not yet paid or cancelled.
const FILTERS = ['All', 'Open', 'Pending', 'Sent', 'Downloaded', 'Approved', 'Expired', 'Paid', 'Cancelled'];
const isOpen = (q: any) => !['Paid', 'Cancelled'].includes(q.status);

/**
 * Where a quotation stands on time, which is a different question from where it
 * stands in the workflow: a quotation can be "Sent" and past its date at once.
 * Paid and cancelled ones are finished, so their date no longer matters.
 */
type Validity = { label: string; tone: BadgeTone } | null;
function validityOf(q: any): Validity {
  if (!q.expiresAt || !isOpen(q)) return null;
  const d = new Date(q.expiresAt);
  if (isPast(d)) return { label: 'Expired', tone: 'caution' };
  if (differenceInCalendarDays(d, new Date()) <= 7) return { label: 'Expires soon', tone: 'caution' };
  return { label: 'Valid', tone: 'success' };
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
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, value: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // The dashboard arrives with "open" or "expired" already chosen.
  const [status, setStatus] = useState(params.get('scope') === 'open' ? 'Open' : params.get('status') || 'All');
  const [onlyExpired, setOnlyExpired] = useState(params.get('validity') === 'expired');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const q = new URLSearchParams();
      if (status !== 'All' && status !== 'Open') q.set('status', status);
      if (search.trim()) q.set('search', search.trim());
      const res = await fetch(`/api/my/quotations?${q}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.quotations || []);
      setStats(data.stats || { total: 0, paid: 0, pending: 0, value: 0 });
    } catch {
      setLoadFailed(true);
      toast.error('Could not load your quotations', { id: 'sales-quotes' });
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const closeDrawer = useCallback(() => setSelected(null), []);
  const clearExpired = () => { setOnlyExpired(false); const n = new URLSearchParams(params); n.delete('validity'); setParams(n, { replace: true }); };

  const shown = useMemo(() => rows.filter(q =>
    (status !== 'Open' || isOpen(q)) && (!onlyExpired || validityOf(q)?.label === 'Expired')), [rows, status, onlyExpired]);

  const filtering = status !== 'All' || onlyExpired || !!search.trim();
  const resetFilters = () => { setStatus('All'); setOnlyExpired(false); setSearch(''); setParams({}, { replace: true }); };
  const failed = loadFailed;
  const first = loading && !rows.length;

  const pdf = (q: any) => downloadQuotationPdf(rowToRender(q)).catch(() => toast.error('Could not create the PDF.'));
  const rowMenu = (q: any) => (
    <ActionMenu label={`Actions for quotation ${q.id}`} items={[
      { label: 'View', icon: Eye, onSelect: () => setSelected(q) },
      { label: 'Download PDF', icon: Download, onSelect: () => pdf(q) },
      { label: 'Print', icon: Printer, onSelect: () => printQuotation(rowToRender(q)) },
      { label: 'Edit', icon: Pencil, to: `/sales/quotations/create?edit=${encodeURIComponent(q.id)}`, hidden: q.status === 'Paid' || !docOfRow(q) },
    ]} />
  );

  return (
    <div>
      <PageHeader
        title="My Quotations"
        description="Every quotation raised from your account, newest first."
        actions={<>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
          </Button>
          <Button onClick={() => navigate('/sales/quotations/create')}><Plus size={16} aria-hidden="true" /> New Quotation</Button>
        </>}
      />

      <div className="space-y-5">
        {/* Totals — a failed load shows a dash, not a row of zeros. The first three are also shortcuts. */}
        <section aria-label="Quotation totals" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Raised" value={failed ? null : stats.total} loading={first} icon={FileText} context="All quotations you have raised"
            onSelect={() => setStatus('All')} selected={status === 'All' && !onlyExpired} />
          <StatCard label="Paid" value={failed ? null : stats.paid} loading={first} icon={CheckCircle2} context={`${pct(stats.paid, stats.total)}% of those raised`}
            onSelect={() => setStatus('Paid')} selected={status === 'Paid'} />
          <StatCard label="Open" value={failed ? null : stats.pending} loading={first} icon={Clock} context="Not yet paid or cancelled"
            onSelect={() => setStatus('Open')} selected={status === 'Open'} />
          <StatCard label="Value won" value={failed ? null : inr(stats.value)} loading={first} context={`From ${stats.paid} paid ${stats.paid === 1 ? 'quotation' : 'quotations'}`} />
        </section>

        <FilterBar>
          <SearchField id="quotation-search" value={search} onChange={setSearch} placeholder="Number, customer or organisation" />
        </FilterBar>
        <FilterChips label="Filter by workflow status" value={status} onChange={setStatus}
          options={FILTERS.map(f => ({ key: f, label: f === 'All' || f === 'Open' ? f : statusLabel(f) }))} />
        {onlyExpired && <ActiveFilter onClear={clearExpired}>Showing open quotations that are past their valid-until date.</ActiveFilter>}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6"><SkeletonRows rows={5} /></div>
          ) : loadFailed ? (
            <ErrorState title="Your quotations could not be loaded" onRetry={load} />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={filtering ? Search : Inbox}
              title={filtering ? 'No quotations found' : 'You have not raised any quotations yet'}
              description={filtering ? 'Nothing matches these filters.' : 'Create one and it will be listed here.'}
              action={filtering
                ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button>
                : <Button onClick={() => navigate('/sales/quotations/create')}>Create your first quotation</Button>}
            />
          ) : (
            <>
              <div className="table-wrap relative hidden md:block">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Quotation</th><th>Customer</th><th className="hidden xl:table-cell">Plan</th><th className="text-right">Amount</th>
                      <th className="hidden lg:table-cell">Created</th><th>Valid until</th><th>Workflow status</th><th className="w-12"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(q => {
                      const v = validityOf(q);
                      return (
                        <tr key={q.id} onClick={() => setSelected(q)} tabIndex={0} aria-label={`Open quotation ${q.id}`} className="cursor-pointer"
                          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected(q); } }}>
                          <td><span className="font-mono text-xs font-semibold text-ink">{q.id}</span></td>
                          <td className="max-w-[240px]">
                            <p className="truncate font-semibold text-ink">{q.userName}</p>
                            <p className="truncate text-xs text-muted">{q.organization || q.userEmail}</p>
                          </td>
                          <td className="hidden xl:table-cell">{q.planType || '—'}</td>
                          <td className="whitespace-nowrap text-right font-semibold tabular-nums text-ink">{inr(q.total)}</td>
                          <td className="hidden whitespace-nowrap text-xs text-muted lg:table-cell">{formatDay(q.createdAt)}</td>
                          <td className="whitespace-nowrap">
                            <p className="text-xs text-ink-2">{formatDay(q.expiresAt)}</p>
                            {v && <Badge tone={v.tone} className="mt-1">{v.label}</Badge>}
                          </td>
                          <td className="whitespace-nowrap"><StatusBadge status={q.status} label={statusLabel(q.status)} /></td>
                          <td className="text-right">{rowMenu(q)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-rule md:hidden">
                {shown.map(q => {
                  const v = validityOf(q);
                  return (
                    <li key={q.id} className="space-y-2.5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => setSelected(q)} className="min-w-0 text-left">
                          <span className="block font-mono text-xs font-semibold text-ink">{q.id}</span>
                          <span className="mt-1 block truncate font-semibold text-ink">{q.userName}</span>
                          <span className="block truncate text-xs text-muted">{q.organization || q.userEmail}</span>
                        </button>
                        {rowMenu(q)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums text-ink">{inr(q.total)}</span>
                        <StatusBadge status={q.status} label={statusLabel(q.status)} />
                        {v && <Badge tone={v.tone}>{v.label}</Badge>}
                      </div>
                      <p className="text-xs text-muted">Created {formatDay(q.createdAt)} · Valid until {formatDay(q.expiresAt)}</p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      <Dialog
        open={!!selected}
        onClose={closeDrawer}
        side="right"
        title={selected ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{selected.id}</span>
            <StatusBadge status={selected.status} label={statusLabel(selected.status)} />
          </span>
        ) : ''}
        description={selected ? <span className="text-xl font-bold tabular-nums text-ink">{inr(selected.total)}</span> : undefined}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => pdf(selected)}>
                <Download size={14} aria-hidden="true" /> Download PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => printQuotation(rowToRender(selected))}>
                <Printer size={14} aria-hidden="true" /> Print
              </Button>
              {selected.status !== 'Paid' && docOfRow(selected) && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/sales/quotations/create?edit=${encodeURIComponent(selected.id)}`)}>
                  <Pencil size={14} aria-hidden="true" /> Edit
                </Button>
              )}
            </div>

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
                  <dd className="text-right text-ink">{formatStamp(selected.createdAt)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted">Valid until</dt>
                  <dd className="text-right text-ink">
                    {formatStamp(selected.expiresAt)}
                    {validityOf(selected) && <Badge tone={validityOf(selected)!.tone} className="ml-2">{validityOf(selected)!.label}</Badge>}
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
