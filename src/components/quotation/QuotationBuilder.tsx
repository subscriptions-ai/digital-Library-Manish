import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronDown, Download, FilePlus2, List, Mail, Printer, Save, Search } from 'lucide-react';
import { issuerOf, type Issuer } from '../../config';
import { Button, Card, CardHeader, Field, PageHeader, friendlyError } from '../ui';
import { cn } from '../../lib/utils';
import {
  QUOTE_DEPARTMENTS, QUOTE_STATES, STATUSES, FREE_USERS, statusLabel,
  computeQuotePricing, docOfRow, docToRender, emptyDoc, money, userSlabLabel, type QuoteDoc,
} from '../../lib/quotation/quotationModel';
import { downloadQuotationPdf, quotationPdfBase64 } from '../../lib/quotation/quotationPdf';
import { printQuotation } from '../../lib/quotation/quotationPrint';
import { QuotationViewer } from './QuotationViewer';

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

/** What is wrong with a quotation that is not ready to save, or null. The server checks the same again. */
function problemWith(d: QuoteDoc): string | null {
  const p = computeQuotePricing(d);
  if (!d.quoteNo.trim()) return 'Enter the quotation number.';
  if (!d.instName.trim()) return 'Enter the institution name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return 'Enter a valid client email.';
  if (!d.departments.length) return 'Select at least one department.';
  if (!p.stateCode) return 'Select the State / UT so GST is calculated correctly.';
  if (d.deptMode === 'custom' && d.customDeptRate === null) return 'Enter the custom department rate.';
  if (d.userMode === 'custom' && p.extra > 0 && d.customUserRate === null) return 'Enter the custom user rate.';
  return null;
}

/** A small run of text under a control. */
const Help = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted leading-relaxed">{children}</p>;

/** The read-only rate shown when a standard slab applies. */
function RateReadout({ value, note }: { value: string; note: string }) {
  return (
    <div className="rounded-lg border border-rule bg-accent-soft px-3 py-2">
      <p className="text-sm font-semibold text-ink">{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

export function QuotationBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const editId = params.get('edit');
  const listPath = location.pathname.replace(/\/create\/?$/, '');

  const [doc, setDoc] = useState<QuoteDoc>(() => emptyDoc());
  const [issuer, setIssuer] = useState<Issuer>(() => issuerOf(null));
  /** True once the quotation exists on the server, so the next save updates it. */
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'save' | 'download' | 'email'>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  const [deptQuery, setDeptQuery] = useState('');
  const deptRef = useRef<HTMLDivElement>(null);

  const patch = useCallback((p: Partial<QuoteDoc>) => setDoc(d => ({ ...d, ...p })), []);

  // A fresh quotation takes the next number; an edit loads the saved one.
  const startNew = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    setIssuer(issuerOf(null));
    let no = '';
    try {
      const res = await fetch('/api/quotation/next-number', { headers: authHeaders() });
      if (res.ok) no = (await res.json()).quotationNumber || '';
    } catch { /* the number can be typed in */ }
    setDoc(emptyDoc(no));
    setLoading(false);
  }, []);

  useEffect(() => {
    let live = true;
    if (!editId) { startNew(); return () => { live = false; }; }
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/quotation/record?id=${encodeURIComponent(editId)}`, { headers: authHeaders() });
        const row = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(row.error || 'Could not open that quotation.');
        const d = docOfRow(row);
        if (!d) throw new Error('This quotation was made before the current format and cannot be edited. Create a new one instead.');
        if (row.status === 'Paid') throw new Error('A paid quotation can no longer be edited.');
        if (!live) return;
        setDoc(d); setIssuer(issuerOf(row)); setSaved(true);
      } catch (e) {
        if (!live) return;
        toast.error(friendlyError(e, 'Could not open that quotation.'));
        setParams({}, { replace: true });
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [editId, startNew, setParams]);

  // Close the department list on an outside click.
  useEffect(() => {
    if (!deptOpen) return;
    const onDown = (e: MouseEvent) => { if (!deptRef.current?.contains(e.target as Node)) setDeptOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [deptOpen]);

  const pricing = useMemo(() => computeQuotePricing(doc), [doc]);
  const render = useMemo(() => docToRender(doc, issuer), [doc, issuer]);
  const visibleDepts = QUOTE_DEPARTMENTS.filter(d => d.toLowerCase().includes(deptQuery.trim().toLowerCase()));

  const toggleDept = (name: string) =>
    patch({ departments: doc.departments.includes(name) ? doc.departments.filter(x => x !== name) : [...doc.departments, name] });

  // Pre-fill a repeat client from their latest quotation, without overwriting what has been typed.
  const autofill = async () => {
    const email = doc.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || saved) return;
    try {
      const res = await fetch(`/api/quotation/customer/${encodeURIComponent(email)}`, { headers: authHeaders() });
      if (!res.ok) return;
      const q = await res.json();
      setDoc(d => ({
        ...d,
        instName: d.instName || q.organization || '',
        contactName: d.contactName || q.userName || '',
        designation: d.designation || q.designation || '',
        phone: d.phone || q.mobile || '',
        address: d.address || q.address || '',
        state: d.state || q.state || '',
        customerGstin: d.customerGstin || q.gstNumber || '',
      }));
    } catch { /* nothing to pre-fill */ }
  };

  /** Save, then return the saved quotation's inputs (the server may have given it a new number). */
  const persist = async (status?: string): Promise<QuoteDoc | null> => {
    const problem = problemWith(doc);
    if (problem) { toast.error(problem); return null; }
    const res = await fetch('/api/quotation/save', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ doc, editing: saved, status: status || doc.status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not save the quotation.');
    const next = docOfRow(body.quotation) || doc;
    setDoc(next);
    setIssuer(issuerOf(body.quotation));
    setSaved(true);
    if (editId !== next.quoteNo) setParams({ edit: next.quoteNo }, { replace: true });
    if (next.quoteNo !== doc.quoteNo) toast(`Number ${doc.quoteNo} was already taken, so this quotation is ${next.quoteNo}.`, { icon: 'ℹ️' });
    return next;
  };

  const run = async (kind: 'save' | 'download' | 'email') => {
    setBusy(kind);
    try {
      if (kind === 'save') {
        const next = await persist();
        if (next) toast.success(`Quotation ${next.quoteNo} saved.`);
      } else if (kind === 'download') {
        const next = await persist(doc.status === 'Pending' ? 'Downloaded' : doc.status);
        if (next) {
          await downloadQuotationPdf(docToRender(next, issuer));
          toast.success('Quotation downloaded.');
        }
      } else {
        const next = await persist();
        if (next) {
          const r = docToRender(next, issuer);
          const res = await fetch('/api/quotation/send', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ doc: next, editing: true, pdfBase64: await quotationPdfBase64(r) }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || 'Could not send the quotation.');
          if (body.quotation) setDoc(docOfRow(body.quotation) || next);
          toast.success(`Quotation sent to ${next.email}.`);
        }
      }
    } catch (e) {
      toast.error(friendlyError(e, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const print = () => {
    const problem = problemWith(doc);
    if (problem) { toast.error(problem); return; }
    printQuotation(render);
  };

  const newQuotation = () => {
    setParams({}, { replace: true });
    if (!editId) startNew();
  };

  const statuses = (STATUSES as readonly string[]).includes(doc.status) ? STATUSES : [...STATUSES, doc.status];
  const deptCountLabel = doc.departments.length === 1 ? doc.departments[0] : doc.departments.length ? `${doc.departments.length} departments selected` : 'Select department(s)';
  const summary = [
    pricing.count ? `${pricing.count} department${pricing.count !== 1 ? 's' : ''}` : '',
    `${pricing.users} users`,
    doc.includeFive ? `${pricing.included} included` : '',
    pricing.extra ? `${pricing.extra} chargeable @ ${money(pricing.userRate)}` : '',
    pricing.discount ? `discount ${money(pricing.discount)}` : '',
  ].filter(Boolean).join(' • ');

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={saved ? 'Edit quotation' : 'New quotation'}
        description={saved
          ? `Editing ${doc.quoteNo}. Changes are saved to the same quotation.`
          : 'Fill in the details on the left; the quotation on the right is exactly what the client receives.'}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(listPath)}><List size={16} aria-hidden="true" />All quotations</Button>
            <Button variant="outline" size="sm" onClick={newQuotation}><FilePlus2 size={16} aria-hidden="true" />New quotation</Button>
          </>
        )}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[42fr_58fr]">
        {/* ── The form ── */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Quotation" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Quotation No." required><input className="input" value={doc.quoteNo} onChange={e => patch({ quoteNo: e.target.value })} disabled={saved} /></Field>
              <Field label="Quotation date"><input className="input" type="date" value={doc.quoteDate} onChange={e => patch({ quoteDate: e.target.value })} /></Field>
              <Field label="Validity (days)"><input className="input" type="number" min={1} max={365} value={doc.validityDays || ''} onChange={e => patch({ validityDays: Number(e.target.value) })} /></Field>
              <Field label="Status">
                <select className="input" value={doc.status} onChange={e => patch({ status: e.target.value })}>
                  {statuses.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Institution / customer" />
            <div className="space-y-4">
              <Field label="Client email" required><input className="input" type="email" placeholder="email@institution.edu" value={doc.email} onChange={e => patch({ email: e.target.value })} onBlur={autofill} /></Field>
              <Field label="Institution name" required><input className="input" placeholder="College / University / Institute" value={doc.instName} onChange={e => patch({ instName: e.target.value })} /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Contact person"><input className="input" placeholder="Name" value={doc.contactName} onChange={e => patch({ contactName: e.target.value })} /></Field>
                <Field label="Designation"><input className="input" placeholder="Librarian / Registrar / etc." value={doc.designation} onChange={e => patch({ designation: e.target.value })} /></Field>
              </div>
              <Field label="Phone"><input className="input" placeholder="Contact number" value={doc.phone} onChange={e => patch({ phone: e.target.value })} /></Field>
              <Field label="Billing address"><textarea className="input min-h-[80px] py-2" placeholder="Institution billing / correspondence address" value={doc.address} onChange={e => patch({ address: e.target.value })} /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="State / UT" required>
                  <select className="input" value={doc.state} onChange={e => patch({ state: e.target.value })}>
                    <option value="">Select state / UT</option>
                    {QUOTE_STATES.map(s => <option key={s.name} value={s.name}>{s.label} ({s.code})</option>)}
                  </select>
                </Field>
                <Field label="Customer GSTIN (optional)"><input className="input" placeholder="GSTIN / NA" value={doc.customerGstin} onChange={e => patch({ customerGstin: e.target.value })} /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Subscription" />
            <div className="space-y-4">
              <div className="field" ref={deptRef}>
                <span className="field-label">Departments<span className="req" aria-hidden="true">*</span></span>
                <button type="button" className="input flex items-center justify-between text-left" aria-expanded={deptOpen} onClick={() => setDeptOpen(o => !o)}>
                  <span className={cn('truncate', !doc.departments.length && 'text-faint')}>{deptCountLabel}</span>
                  <span className="ml-3 flex shrink-0 items-center gap-1 text-xs text-muted">{doc.departments.length} selected<ChevronDown size={14} aria-hidden="true" /></span>
                </button>
                {deptOpen && (
                  <div className="overflow-hidden rounded-lg border border-rule bg-surface">
                    <div className="relative border-b border-rule p-2">
                      <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
                      <input className="input pl-8" placeholder="Search department..." value={deptQuery} onChange={e => setDeptQuery(e.target.value)} aria-label="Search departments" />
                    </div>
                    <div className="max-h-60 overflow-auto p-1.5">
                      {visibleDepts.map(name => (
                        <label key={name} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
                          <input type="checkbox" checked={doc.departments.includes(name)} onChange={() => toggleDept(name)} className="h-4 w-4 accent-[var(--accent)]" />
                          {name}
                        </label>
                      ))}
                      {!visibleDepts.length && <p className="px-2 py-3 text-sm text-muted">No department matches.</p>}
                    </div>
                    <div className="flex justify-between border-t border-rule p-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => patch({ departments: [...QUOTE_DEPARTMENTS] })}>Select all</Button>
                        <Button size="sm" variant="outline" onClick={() => patch({ departments: [] })}>Clear</Button>
                      </div>
                      <Button size="sm" onClick={() => setDeptOpen(false)}>Done</Button>
                    </div>
                  </div>
                )}
              </div>

              <Field label="Total full-access users required" required>
                <input className="input" type="number" min={1} step={1} value={doc.totalUsers || ''} onChange={e => patch({ totalUsers: Number(e.target.value) })} />
              </Field>

              <div className="space-y-4 rounded-xl border border-rule bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Pricing controls</p>
                <Field label={`Include ${FREE_USERS} users with subscription?`}>
                  <select className="input" value={doc.includeFive ? 'yes' : 'no'} onChange={e => patch({ includeFive: e.target.value === 'yes' })}>
                    <option value="yes">Yes - {FREE_USERS} users included</option>
                    <option value="no">No - charge all users</option>
                  </select>
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Department pricing">
                    <select className="input" value={doc.deptMode} onChange={e => patch({ deptMode: e.target.value as QuoteDoc['deptMode'] })}>
                      <option value="fixed">Fixed - standard slab</option>
                      <option value="custom">Custom - manual rate</option>
                    </select>
                  </Field>
                  {doc.deptMode === 'fixed' ? (
                    <div className="field">
                      <span className="field-label">Applicable fixed rate</span>
                      <RateReadout value={pricing.count ? `${money(pricing.standardDeptRate)} / department / year` : 'Select department(s)'} note="Standard slab applied automatically" />
                    </div>
                  ) : (
                    <Field label="Custom rate / department / year (INR)">
                      <input className="input" type="number" min={0} placeholder="Approved custom rate" value={doc.customDeptRate ?? ''} onChange={e => patch({ customDeptRate: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="User pricing">
                    <select className="input" value={doc.userMode} onChange={e => patch({ userMode: e.target.value as QuoteDoc['userMode'] })}>
                      <option value="fixed">Fixed - volume slab</option>
                      <option value="custom">Custom - manual rate</option>
                    </select>
                  </Field>
                  {doc.userMode === 'fixed' ? (
                    <div className="field">
                      <span className="field-label">Applicable fixed rate</span>
                      <RateReadout value={`${money(pricing.standardUserRate)} / chargeable user / year`} note={`${userSlabLabel(pricing.users)} — changes with user volume`} />
                    </div>
                  ) : (
                    <Field label="Custom rate / chargeable user / year (INR)">
                      <input className="input" type="number" min={0} placeholder="Approved custom rate" value={doc.customUserRate ?? ''} onChange={e => patch({ customUserRate: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                  )}
                </div>

                <Field label="Special discount / adjustment (INR)">
                  <input className="input" type="number" min={0} step={1} value={doc.discount || ''} placeholder="0" onChange={e => patch({ discount: Number(e.target.value) })} />
                </Field>
                <Help>Fixed pricing uses the approved standard slabs. Use a manual rate only when an approved special rate is required. All selections are saved with the quotation so it can be edited later.</Help>
              </div>

              <Field label="Special note / commercial remark (optional)">
                <textarea className="input min-h-[80px] py-2" placeholder="Any approved special condition, PO note, implementation note, etc." value={doc.specialNote} onChange={e => patch({ specialNote: e.target.value })} />
              </Field>
            </div>
          </Card>

          <div className="rounded-2xl p-5 text-white" style={{ background: 'var(--navy)' }}>
            <p className="text-xs uppercase tracking-wider opacity-70">Total payable</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{money(pricing.total, 2)}</p>
            <p className="mt-1 text-xs opacity-80">{pricing.count ? summary : 'Select at least one department.'}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              {[['Department base', money(pricing.deptBase)], ['User charges', money(pricing.userBase)], ['GST', money(pricing.tax, 2)]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-white/15 bg-white/5 p-2.5">
                  <p className="uppercase opacity-70">{k}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => run('save')} loading={busy === 'save'} disabled={!!busy || loading}><Save size={16} aria-hidden="true" />Save quotation</Button>
            <Button variant="brand" onClick={() => run('email')} loading={busy === 'email'} disabled={!!busy || loading}><Mail size={16} aria-hidden="true" />Email to client</Button>
            <Button variant="outline" onClick={() => run('download')} loading={busy === 'download'} disabled={!!busy || loading}><Download size={16} aria-hidden="true" />Download PDF</Button>
            <Button variant="outline" onClick={print} disabled={!!busy || loading}><Printer size={16} aria-hidden="true" />Print</Button>
          </div>
        </div>

        {/* ── The quotation, as it will be sent. It stays in view while the form is edited. ── */}
        <div className="min-w-0 xl:sticky xl:top-4 xl:h-[calc(100vh-6rem)]">
          <QuotationViewer render={render} className="xl:h-full" />
        </div>
      </div>
    </div>
  );
}
