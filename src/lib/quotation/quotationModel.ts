import { COMPANY_DETAILS, issuerOf, type Issuer } from '../../config';
import { departmentRate } from '../institutionPricing';

/**
 * The quotation: one model, read by the builder, the on-screen sheet, the PDF,
 * the server (which prices and numbers it) and every place a quotation is shown.
 *
 * A saved quotation keeps its inputs — departments, users, rate modes — in
 * `pricingBreakdown.doc`, so it can be opened and edited later exactly as it was
 * written. Everything the sheet shows is derived from those inputs here, never
 * stored twice.
 */

export const QUOTE_KIND = 'institutional-v2';

/** The departments a quotation can be written for. */
export const QUOTE_DEPARTMENTS = [
  'Agriculture', 'Applied Mechanics', 'Applied Sciences', 'Architecture', 'Ayurveda',
  'Bio Technology', 'Chemical Engineering', 'Chemistry', 'Civil/Construction Engineering',
  'Computer/IT', 'Education & Social Sciences', 'Electrical Engineering',
  'Electronics & Telecommunication Engineering', 'Energy', 'Law', 'Life Sciences',
  'Management', 'Material Science', 'Mechanical Engineering', 'Medical Sciences',
  'Multidisciplinary', 'Nano Technology', 'Nursing', 'Pharmacy',
];

/**
 * How the subscribed departments are laid out on the sheet and in the PDF: one column while the
 * list is short, two from five departments, filled down each column so it reads in the order
 * the departments were chosen. The same rule serves both, so the preview matches the PDF.
 */
export const DEPT_TWO_COLUMNS_FROM = 5;
export const deptColumns = (count: number): 1 | 2 => (count >= DEPT_TWO_COLUMNS_FROM ? 2 : 1);
/** "01", "02" … "12" — a serial, not a bullet. */
export const deptNo = (index: number): string => String(index + 1).padStart(2, '0');

/** GST state codes. `name` is what is stored; `label` is what is shown in the picker. */
export const QUOTE_STATES: { name: string; label: string; code: string }[] = [
  ['Andhra Pradesh', '28'], ['Arunachal Pradesh', '12'], ['Assam', '18'], ['Bihar', '10'],
  ['Chhattisgarh', '22'], ['Goa', '30'], ['Gujarat', '24'], ['Haryana', '06'],
  ['Himachal Pradesh', '02'], ['Jharkhand', '20'], ['Karnataka', '29'], ['Kerala', '32'],
  ['Madhya Pradesh', '23'], ['Maharashtra', '27'], ['Manipur', '14'], ['Meghalaya', '17'],
  ['Mizoram', '15'], ['Nagaland', '13'], ['Odisha', '21'], ['Punjab', '03'],
  ['Rajasthan', '08'], ['Sikkim', '11'], ['Tamil Nadu', '33'], ['Telangana', '36'],
  ['Tripura', '16'], ['Uttar Pradesh', '09'], ['Uttarakhand', '05'], ['West Bengal', '19'],
  ['Andaman and Nicobar Islands', '35', 'UT'], ['Chandigarh', '04', 'UT'],
  ['Dadra and Nagar Haveli and Daman and Diu', '26', 'UT'], ['Delhi', '07', 'NCT'],
  ['Jammu and Kashmir', '01', 'UT'], ['Ladakh', '38', 'UT'], ['Lakshadweep', '31', 'UT'],
  ['Puducherry', '34', 'UT'],
].map(([name, code, suffix]) => ({ name, code, label: suffix ? `${name} (${suffix})` : name }));

export const stateCodeOf = (state?: string | null): string => {
  const wanted = (state || '').replace(/\s*\((UT|NCT)\)\s*$/i, '').trim().toLowerCase();
  return QUOTE_STATES.find(s => s.name.toLowerCase() === wanted)?.code || '';
};

/** Customers in the company's own state are billed CGST + SGST; everyone else IGST. */
const HOME_STATE_CODE = stateCodeOf(COMPANY_DETAILS.state) || '07';

/**
 * The stored quotation statuses a person can choose, and what each is called on screen.
 * The stored words are unchanged — receipts, conversion to a subscription and every older
 * record depend on them — so "Draft" is Pending and "Accepted" is Approved, and nothing
 * already saved needs migrating. "Downloaded" and "Paid" are set by their own actions.
 */
export const STATUSES = ['Pending', 'Sent', 'Approved', 'Expired', 'Cancelled'] as const;

const STATUS_LABELS: Record<string, string> = { Pending: 'Draft', Approved: 'Accepted' };
export const statusLabel = (status: string): string => STATUS_LABELS[status] || status;

// ── Pricing ───────────────────────────────────────────────────────────────

export const FREE_USERS = 5;

export function standardUserRate(totalUsers: number): number {
  if (totalUsers <= 100) return 2490;
  if (totalUsers <= 250) return 1990;
  if (totalUsers <= 500) return 1490;
  if (totalUsers <= 999) return 1190;
  return 990;
}

export const userSlabLabel = (totalUsers: number): string =>
  totalUsers <= 100 ? 'Up to 100 total users'
    : totalUsers <= 250 ? '101-250 total users'
    : totalUsers <= 500 ? '251-500 total users'
    : totalUsers <= 999 ? '501-999 total users'
    : '1,000+ total users';

export type QuoteDoc = {
  quoteNo: string;
  /** yyyy-mm-dd */
  quoteDate: string;
  validityDays: number;
  status: string;
  instName: string;
  contactName: string;
  designation: string;
  email: string;
  phone: string;
  address: string;
  /** Plain state name, as stored on the quotation row. */
  state: string;
  customerGstin: string;
  departments: string[];
  totalUsers: number;
  includeFive: boolean;
  deptMode: 'fixed' | 'custom';
  customDeptRate: number | null;
  userMode: 'fixed' | 'custom';
  customUserRate: number | null;
  discount: number;
  specialNote: string;
};

export type QuotePricing = {
  count: number;
  users: number;
  included: number;
  extra: number;
  deptRate: number;
  standardDeptRate: number;
  userRate: number;
  standardUserRate: number;
  deptBase: number;
  userBase: number;
  gross: number;
  discount: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
  stateCode: string;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The same arithmetic the server repeats when a quotation is saved. */
export function computeQuotePricing(doc: Pick<QuoteDoc,
  'departments' | 'totalUsers' | 'includeFive' | 'deptMode' | 'customDeptRate' | 'userMode' | 'customUserRate' | 'discount' | 'state'>): QuotePricing {
  const count = doc.departments.length;
  const users = Math.max(1, Math.floor(num(doc.totalUsers)) || 1);
  const included = doc.includeFive ? Math.min(users, FREE_USERS) : 0;
  const extra = doc.includeFive ? Math.max(0, users - FREE_USERS) : users;

  const standardDeptRate = departmentRate(count);
  const deptRate = doc.deptMode === 'custom' ? Math.max(0, num(doc.customDeptRate)) : standardDeptRate;
  const stdUserRate = standardUserRate(users);
  const userRate = doc.userMode === 'custom' ? Math.max(0, num(doc.customUserRate)) : stdUserRate;

  const deptBase = count * deptRate;
  const userBase = extra * userRate;
  const gross = deptBase + userBase;
  const discount = Math.max(0, num(doc.discount));
  const subtotal = Math.max(0, gross - discount);

  const stateCode = stateCodeOf(doc.state);
  let cgst = 0, sgst = 0, igst = 0;
  if (subtotal && stateCode) {
    if (stateCode === HOME_STATE_CODE) { cgst = Math.round(subtotal * 9) / 100; sgst = Math.round(subtotal * 9) / 100; }
    else igst = Math.round(subtotal * 18) / 100;
  }
  const tax = cgst + sgst + igst;
  return {
    count, users, included, extra, deptRate, standardDeptRate, userRate, standardUserRate: stdUserRate,
    deptBase, userBase, gross, discount, subtotal, cgst, sgst, igst, tax, total: subtotal + tax, stateCode,
  };
}

// ── Numbering and dates ───────────────────────────────────────────────────

/** Indian financial year, April to March: "26-27" from 6 Oct 2026. */
export function financialYear(d: Date = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() + 1 >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

export const quoteNoPrefix = (d: Date = new Date()) => `ITB/SDL/${financialYear(d)}/`;

/** The next number in this financial year, given the numbers already issued. */
export function nextQuoteNo(existing: string[], d: Date = new Date()): string {
  const prefix = quoteNoPrefix(d);
  const last = existing
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(last + 1).padStart(3, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** yyyy-mm-dd from a Date, in local time. */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseIso = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** "06 Oct 2026", or "—" when there is no date. */
export function dateDisplay(iso: string): string {
  const d = parseIso(iso);
  return d ? `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—';
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIso(iso);
  if (!d) return '';
  d.setDate(d.getDate() + Math.floor(num(days)));
  return isoDate(d);
}

export const money = (n: number, decimals = 0): string =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Whole rupees when the amount is whole, paise otherwise — a custom rate of 8,999.50 is not shown as 9,000. */
export const moneyAuto = (n: number): string => money(n, Number.isInteger(Number(n) || 0) ? 0 : 2);

// ── What the sheet and the PDF draw ───────────────────────────────────────

export type QuoteLine = { title: string; sub?: string; qty: string; rate: number; amount: number };
/** One numbered term. `**bold**` marks inline emphasis; `lead` is the bold run-in heading. */
export type QuoteTerm = { lead?: string; text: string; group?: string };

/** The headings the terms are grouped under, in the order they appear. */
export const TERM_GROUPS = ['Subscription & Payment', 'Access & Usage', 'Platform & Data', 'Taxes, Renewal & Legal'] as const;

export type QuoteRender = {
  quoteNo: string;
  /** yyyy-mm-dd */
  date: string;
  validTill: string;
  title: string;
  subtitle: string;
  customer: {
    name: string; contact: string; designation: string; email: string; phone: string;
    address: string; state: string; stateCode: string; gstin: string;
  };
  lines: QuoteLine[];
  gross: number;
  discount: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** CGST + SGST, IGST, or — when the place of supply is not known — one GST line. */
  tax: 'split' | 'igst' | 'single';
  singleGst?: number;
  terms: QuoteTerm[];
  specialNote: string;
  issuer: Issuer;
  /** Compact label/value facts about what is being bought. Real values only; omitted ones are not shown. */
  summary: { label: string; value: string }[];
  /** The department names, shown beneath the single subscription line. */
  departments?: string[];
  /** A simpler one-page quotation: terms are short bullets on page 1, with no separate terms page. */
  compact?: boolean;
};

/**
 * The standard terms, in the order the quotation prints them. `entitlement` is
 * what a particular product promises about users; `period` replaces the
 * calendar-year term where a subscription runs from its activation date.
 */
export function standardTerms(o: {
  validityDays: number;
  subject?: 'institution' | 'subscriber';
  period?: string;
  entitlement: QuoteTerm[];
  /** Pricing statements, shown with the entitlement under Subscription & Payment. */
  pricing?: QuoteTerm[];
  /** Shown just before the closing validity line. */
  extra?: QuoteTerm[];
}): QuoteTerm[] {
  const co = COMPANY_DETAILS.registeredName;
  const who = o.subject === 'subscriber' ? 'the subscriber' : 'the subscribing institution';
  const Who = o.subject === 'subscriber' ? 'The subscriber' : 'The institution';
  const [G1, G2, G3, G4] = TERM_GROUPS;
  const groupOf: Record<string, string> = {
    'Subscription Period:': G1, 'Advance Payment:': G1, 'Non-refundable after Activation:': G1,
    'Permitted Use:': G2, 'Prohibited Activity:': G2, 'Suspension / Termination for Misuse:': G2,
    'Content & Platform Changes:': G3, 'Availability / Maintenance:': G3,
    'Analytics & User Administration:': G3, 'No Regulatory / Accreditation Guarantee:': G3,
  };
  const all: QuoteTerm[] = [
    {
      lead: 'Subscription Period:',
      text: o.period ?? 'The subscription is for the relevant calendar year, from 1 January to 31 December. Where activation takes place after 1 January, access will ordinarily expire on 31 December of the same subscription year unless a different term is expressly approved in writing. No pro-rata extension is implied.',
    },
    { lead: 'Advance Payment:', text: '100% payment is payable in advance. Access will be activated only after realization/confirmation of payment and receipt of any information reasonably required for account setup, tax, billing or access configuration.' },
    { lead: 'Non-refundable after Activation:', text: `Once subscription access has been activated, the subscription fee is non-cancellable, non-refundable and non-transferable, except in the case of duplicate payment, billing error, or where a refund is required by applicable law or expressly approved in writing by ${co}.` },
    ...o.entitlement.map(t => ({ ...t, group: G1 })),
    ...(o.pricing || []).map(t => ({ ...t, group: G1 })),
    { lead: 'Permitted Use:', text: `Access is limited to ${who}, selected department scope and authorized users. Login credentials, IP-based access or user rights may not be shared, resold, sublicensed or provided to any third party outside ${who} without prior written approval.` },
    { lead: 'Prohibited Activity:', text: 'Systematic or bulk downloading, scraping, automated extraction, redistribution, republication, resale, credential sharing, circumvention of technical controls, or any unlawful use is prohibited. The subscriber is responsible for the acts of its authorized users.' },
    { lead: 'Suspension / Termination for Misuse:', text: `${co} may suspend, restrict or terminate access, without refund, where there is material breach, misuse, credential sharing, abnormal or automated activity, security risk, infringement, fraud, or a legal/compliance requirement. Access may be restored after satisfactory cure and verification, at the company's discretion.` },
    { lead: 'Content & Platform Changes:', text: 'Titles, databases, third-party/open-access resources, features, interfaces and technical methods of access may be added, removed, replaced or modified due to publisher/licensing rights, technical, legal, security or operational reasons. Such changes do not by themselves create a right to refund or extension.' },
    { lead: 'Availability / Maintenance:', text: 'The service is provided on a commercially reasonable-efforts basis. Temporary interruption caused by maintenance, upgrades, internet/network failure, third-party services, cyber/security events or force majeure will not ordinarily create a refund, credit or extension entitlement unless specifically agreed in writing.' },
    { lead: 'Analytics & User Administration:', text: `Platform access and usage data may be processed for authentication, security, user administration, service delivery, analytics, support, billing and service improvement in accordance with applicable law and the platform privacy policy. ${Who} is responsible for ensuring that user information supplied by it is lawful and accurate.` },
    { lead: 'No Regulatory / Accreditation Guarantee:', text: 'Subscription to STM Digital Library is an academic information-resource service and does not constitute or guarantee accreditation, approval, recognition, ranking or compliance certification by UGC, AICTE, NAAC, NBA, NIRF or any other regulator/accreditation body.' },
    { lead: 'Taxes:', text: 'GST and other applicable taxes/duties are additional unless specifically included in the quotation. Any statutory withholding/TDS must be supported by a valid certificate/document as required by law.' },
    { lead: 'Renewal:', text: 'Renewal is subject to a fresh confirmation/quotation, then-current pricing and terms, and advance payment. No renewal or continuation is implied merely because access existed in the preceding year.' },
    { lead: 'Limitation of Liability:', text: `To the maximum extent permitted by applicable law, ${co} will not be liable for indirect, incidental, special or consequential loss, loss of profits, loss of data or loss arising from unauthorized use. Aggregate liability relating to the affected subscription will not exceed the subscription fees actually received for that affected subscription term, except where such limitation is prohibited by law.` },
    { lead: 'Subscriber Responsibility / Indemnity:', text: `The subscriber remains responsible for compliance by its users and shall indemnify ${co} against third-party claims, losses or reasonable costs arising from unlawful use, infringement, unauthorized redistribution, credential sharing or breach attributable to the subscriber or its users, subject to applicable law.` },
    { lead: 'Written Terms Prevail:', text: 'Any discount, waiver, additional commitment, special access right or variation is valid only when recorded in the quotation, invoice, purchase order accepted by the company, or another written approval issued by an authorized representative. Oral statements do not amend these terms.' },
    { lead: 'Governing Law & Jurisdiction:', text: 'These terms and the subscription are governed by the laws of India. Subject to applicable law, courts at New Delhi/Delhi shall have exclusive jurisdiction over disputes arising from or relating to the quotation, payment, subscription, access or services.' },
    ...(o.extra || []),
    { text: `This quotation is valid for ${o.validityDays} days from the quotation date.` },
  ];
  // The clauses stay in their approved order; the groups are contiguous runs of it, so grouping
  // changes how they are laid out and never how they are numbered.
  return all.map(t => ({ ...t, group: t.group ?? (t.lead && groupOf[t.lead]) ?? G4 }));
}

/** The user-entitlement terms for an institutional quotation, from its own inputs. */
function institutionalEntitlement(doc: QuoteDoc): QuoteTerm[] {
  return [
    doc.includeFive
      ? { lead: 'User Entitlement:', text: `This quotation includes up to **${FREE_USERS} full-access users** with the Premium subscription.` }
      : { lead: 'User Entitlement:', text: 'No complimentary users are included; full-access users are billed separately as shown above.' },
    { lead: 'Additional Users:', text: 'User pricing, if applicable, is charged at the rate and quantity shown in this quotation.' },
  ];
}

/** An institutional quotation, from the inputs the builder collects. */
export function docToRender(doc: QuoteDoc, issuer: Issuer = issuerOf(null)): QuoteRender {
  const p = computeQuotePricing(doc);
  const lines: QuoteLine[] = [];
  if (p.count) {
    lines.push({
      title: 'Premium Department Subscription',
      sub: `Annual STM Digital Library Premium access for the selected department scope.${doc.includeFive ? ` Includes up to ${FREE_USERS} full-access users.` : ' User access is billed separately as quoted.'}`,
      qty: String(p.count), rate: p.deptRate, amount: p.deptBase,
    });
  }
  if (p.extra && p.count) {
    lines.push({
      title: 'Full-Access User Licences',
      sub: 'Annual full-access user licence(s) for the subscribed institution.',
      qty: p.extra.toLocaleString('en-IN'), rate: p.userRate, amount: p.userBase,
    });
  }
  const validity = Math.max(1, Math.floor(num(doc.validityDays)) || 15);
  const validTill = addDaysIso(doc.quoteDate, validity);
  const userSummary = doc.includeFive
    ? `${p.included} included${p.extra ? ` + ${p.extra.toLocaleString('en-IN')} additional` : ''}`
    : `${p.users.toLocaleString('en-IN')} chargeable`;
  return {
    quoteNo: doc.quoteNo,
    date: doc.quoteDate,
    validTill,
    title: 'Premium Institutional Subscription',
    subtitle: 'Annual subscription pricing in INR',
    customer: {
      name: doc.instName, contact: doc.contactName, designation: doc.designation, email: doc.email,
      phone: doc.phone, address: doc.address, state: doc.state, stateCode: p.stateCode, gstin: doc.customerGstin,
    },
    lines,
    gross: p.gross, discount: p.discount, subtotal: p.subtotal,
    cgst: p.cgst, sgst: p.sgst, igst: p.igst, total: p.total,
    tax: p.cgst > 0 ? 'split' : 'igst',
    terms: standardTerms({ validityDays: validity, entitlement: institutionalEntitlement(doc) }),
    specialNote: (doc.specialNote || '').trim(),
    issuer,
    summary: p.count ? [
      { label: 'Subscription', value: 'Premium Institutional' },
      { label: 'Departments', value: String(p.count) },
      { label: 'Access scope', value: 'Subscribed departments listed above' },
      { label: 'Department rate', value: `${moneyAuto(p.deptRate)} / dept / year${doc.deptMode === 'custom' ? ' (special)' : ''}` },
      { label: 'Duration', value: 'Annual (calendar year)' },
      { label: 'User entitlement', value: userSummary },
      { label: 'Valid until', value: dateDisplay(validTill) },
    ] : [],
    departments: doc.departments,
  };
}

// ── Saved quotations ──────────────────────────────────────────────────────

export const emptyDoc = (quoteNo = '', today: Date = new Date()): QuoteDoc => ({
  quoteNo,
  quoteDate: isoDate(today),
  validityDays: 15,
  status: 'Pending',
  instName: '', contactName: '', designation: '', email: '', phone: '', address: '',
  state: '', customerGstin: '',
  departments: [],
  totalUsers: 5,
  includeFive: true,
  deptMode: 'fixed', customDeptRate: null,
  userMode: 'fixed', customUserRate: null,
  discount: 0,
  specialNote: '',
});

/** The inputs of a quotation saved with this builder, or null for an older one. */
export function docOfRow(row: any): QuoteDoc | null {
  const d = row?.pricingBreakdown?.doc;
  if (row?.pricingBreakdown?.kind !== QUOTE_KIND || !d || typeof d !== 'object') return null;
  return { ...emptyDoc(row.id), ...d, quoteNo: row.id, status: row.status || d.status };
}

/**
 * A saved quotation, ready to draw. Quotations raised before this format existed
 * carry only their line items and totals, so they are drawn from those.
 */
export function rowToRender(row: any): QuoteRender {
  const issuer = issuerOf(row);
  const doc = docOfRow(row);
  if (doc) return docToRender(doc, issuer);

  const items: any[] = Array.isArray(row?.items) ? row.items : [];
  const lines: QuoteLine[] = items.map(i => ({
    title: `Premium Department Subscription — ${i.domainName || i.domain || i.contentType || 'Selected scope'}`,
    sub: [i.planName, i.duration].filter(Boolean).join(' · ') || undefined,
    qty: '1', rate: num(i.price), amount: num(i.price),
  }));
  const subtotal = num(row?.subtotal);
  const discount = num(row?.discountAmount);
  const stateCode = stateCodeOf(row?.state);
  const gst = num(row?.gstAmount);
  const split = !!stateCode && stateCode === HOME_STATE_CODE;
  const created = row?.createdAt ? isoDate(new Date(row.createdAt)) : isoDate(new Date());
  const validTill = row?.expiresAt ? isoDate(new Date(row.expiresAt)) : addDaysIso(created, 30);
  const days = Math.max(1, Math.round((new Date(validTill).getTime() - new Date(created).getTime()) / 86_400_000)) || 30;
  return {
    quoteNo: row?.id || '',
    date: created,
    validTill,
    title: 'Premium Institutional Subscription',
    subtitle: 'Subscription pricing in INR',
    customer: {
      name: row?.organization || row?.userName || '', contact: row?.userName || '', designation: row?.designation || '',
      email: row?.userEmail || '', phone: row?.mobile || '',
      address: [row?.address, row?.city, row?.pincode].filter(Boolean).join(', '),
      state: row?.state || '', stateCode, gstin: row?.gstNumber || '',
    },
    lines,
    gross: Math.max(subtotal + discount, lines.reduce((n, l) => n + l.amount, 0)),
    discount, subtotal,
    cgst: split ? gst / 2 : 0, sgst: split ? gst / 2 : 0, igst: !split && stateCode ? gst : 0,
    total: num(row?.total),
    tax: split ? 'split' : stateCode ? 'igst' : 'single',
    singleGst: gst,
    terms: standardTerms({
      validityDays: days,
      period: 'The subscription runs for the period stated in the plan quoted above, from the date of activation.',
      entitlement: [],
    }),
    specialNote: (row?.notes || '').trim(),
    issuer,
    summary: [
      { label: 'Subscription', value: 'Premium Institutional' },
      ...(row?.planType ? [{ label: 'Plan', value: String(row.planType) }] : []),
      ...(lines.length ? [{ label: 'Items', value: String(lines.length) }] : []),
      { label: 'Valid until', value: dateDisplay(validTill) },
    ],
  };
}

/** The columns a quotation row stores, worked out from its inputs. Used by the server. */
export function docToRow(doc: QuoteDoc) {
  const p = computeQuotePricing(doc);
  const validity = Math.max(1, Math.floor(num(doc.validityDays)) || 15);
  const expires = parseIso(addDaysIso(doc.quoteDate, validity)) || new Date(Date.now() + validity * 86_400_000);
  expires.setHours(23, 59, 59, 0);
  const pricing = {
    kind: QUOTE_KIND,
    doc: { ...doc, validityDays: validity },
    total: p.total,
  };
  return {
    p,
    expiresAt: expires,
    data: {
      userEmail: doc.email.trim(),
      userName: doc.contactName.trim() || doc.instName.trim(),
      organization: doc.instName.trim(),
      state: doc.state || null,
      designation: doc.designation.trim() || null,
      mobile: doc.phone.trim() || null,
      address: doc.address.trim() || null,
      gstNumber: doc.customerGstin.trim() || null,
      planType: 'Yearly',
      allowedDomain: doc.departments.join(', ') || null,
      notes: doc.specialNote.trim() || null,
      subtotal: p.subtotal,
      gstAmount: p.tax,
      total: p.total,
      discountAmount: p.discount,
      items: [
        ...(p.count ? [{ domainName: doc.departments.join(', '), planName: 'Premium Department Subscription', duration: 'Yearly', quantity: p.count, price: p.deptRate }] : []),
        ...(p.extra ? [{ domainName: 'Full-Access User Licences', planName: 'Full-Access User Licences', duration: 'Yearly', quantity: p.extra, price: p.userRate }] : []),
      ],
      pricingBreakdown: pricing,
      selectedModules: [],
    },
  };
}

// ── Reference quotations (the downloads on the pricing screens) ───────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A quotation a customer takes from a pricing screen. It is a reference, not a
 * saved record: it carries a number that ties it to the moment it was made, and
 * the price is confirmed again at payment.
 */
export function referenceQuote(o: {
  prefix: string;
  title: string;
  subtitle: string;
  subject: 'institution' | 'subscriber';
  customer: { name: string; contact?: string; email?: string; state?: string | null; gstin?: string | null };
  /** The departments bought. They share one rate, so they are one subscription line. */
  departments: string[];
  deptRate: number;
  lineTitle: string;
  lineSub?: string;
  /** What the summary says: the kind of subscription, how long it runs, and who may use it. */
  subscriptionType: string;
  duration: string;
  users: string;
  /** Pre-tax total and the GST on it, as the screen showed them. */
  base: number;
  gst: number;
  total: number;
  period: string;
  entitlement: QuoteTerm[];
  pricing?: QuoteTerm[];
  /** Extra terms shown just before the validity line. */
  extra?: QuoteTerm[];
  validityDays?: number;
  /** One page, with short terms on it, instead of the full terms page. */
  compact?: boolean;
  now?: Date;
}): QuoteRender {
  const now = o.now ?? new Date();
  const validity = o.validityDays ?? 30;
  const stamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const quoteNo = `${o.prefix}-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  const state = (o.customer.state || '').trim();
  const code = stateCodeOf(state);
  const inState = !!state && (code ? code === HOME_STATE_CODE : state.toLowerCase() === COMPANY_DETAILS.state.toLowerCase());
  const half = round2(o.gst / 2);
  const date = isoDate(now);
  const validTill = addDaysIso(date, validity);
  const count = o.departments.length;
  const gstTerm: QuoteTerm = {
    lead: 'GST:',
    text: state
      ? `GST is charged as ${inState ? 'CGST and SGST' : 'IGST'}, as the place of supply is ${state}.`
      : `GST is charged as CGST and SGST within ${COMPANY_DETAILS.state} and as IGST elsewhere, once the place of supply is confirmed.`,
  };
  const confirm: QuoteTerm = { lead: 'Price Confirmation:', text: 'The price is held until the validity date; the amount shown at payment is the amount charged.' };
  const extra = [...(o.extra || []), confirm, gstTerm];
  return {
    quoteNo,
    date,
    validTill,
    title: o.title,
    subtitle: o.subtitle,
    customer: {
      name: o.customer.name, contact: o.customer.contact || '', designation: '', email: o.customer.email || '', phone: '',
      address: '', state, stateCode: code, gstin: (o.customer.gstin || '').trim(),
    },
    lines: [{ title: o.lineTitle, sub: o.lineSub, qty: String(count), rate: o.deptRate, amount: count * o.deptRate }],
    gross: o.base, discount: 0, subtotal: o.base,
    cgst: inState ? half : 0, sgst: inState ? round2(o.gst - half) : 0, igst: state && !inState ? o.gst : 0,
    total: o.total,
    tax: !state ? 'single' : inState ? 'split' : 'igst',
    singleGst: o.gst,
    // The compact (Solo) quotation lists its few terms as they are; the full set is the institutional one.
    terms: o.compact
      ? [...o.entitlement, ...(o.pricing || []), ...extra, { text: `This quotation is valid for ${validity} days from the quotation date.` }]
      : standardTerms({ validityDays: validity, subject: o.subject, period: o.period, entitlement: o.entitlement, pricing: o.pricing, extra }),
    specialNote: '',
    issuer: issuerOf(null),
    summary: [
      { label: 'Subscription', value: o.subscriptionType },
      { label: 'Departments', value: String(count) },
      { label: 'Access scope', value: 'Subscribed departments listed above' },
      { label: 'Department rate', value: `${moneyAuto(o.deptRate)} / dept / year` },
      { label: 'Duration', value: o.duration },
      { label: 'User entitlement', value: o.users },
      { label: 'Valid until', value: dateDisplay(validTill) },
    ],
    departments: o.departments,
    compact: o.compact,
  };
}
