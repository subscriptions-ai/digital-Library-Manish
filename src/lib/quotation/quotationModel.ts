import { COMPANY_DETAILS, issuerOf, type Issuer } from '../../config';
import {
  DEPARTMENT_RATES, GST_RATE as PLAN_GST_RATE, MAX_INSTITUTION_USERS, TERM_MONTHS,
  departmentRate, departmentRateLadder, priceDepartments, slabLabel,
} from '../institutionPricing';
import {
  SOLO_BULK_THRESHOLD, SOLO_RATE_BULK, SOLO_RATE_STANDARD, SOLO_TERM_MONTHS, calculateSoloSubscriptionPrice,
} from '../soloPricing';

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

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  /** What the department list is called: "Subscribed departments" unless the quotation says otherwise. */
  departmentsLabel?: string;
  /**
   * Departments the customer already holds, when the price depends on them. Counted for the
   * pricing slab and shown for transparency; never charged. `names` is empty when they are unknown.
   */
  existingDepartments?: { count: number; names: string[] };
  /** The customer box's caption: "Institution / Customer" unless this is an individual. */
  customerLabel?: string;
  /** The heading of the terms page, and the short pointer to it on page 1. */
  termsHeading?: string;
  termsPointer?: string;
};

/**
 * The approved clauses, worded once. The institutional quotation and the Solo quotation both
 * read them from here, so a change to approved wording is made in one place — and a clause the
 * Solo quotation shares with the institutional one is the same clause, not a lookalike.
 */
function approvedClauses(subject: 'institution' | 'subscriber') {
  const co = COMPANY_DETAILS.registeredName;
  const who = subject === 'subscriber' ? 'the subscriber' : 'the subscribing institution';
  const Who = subject === 'subscriber' ? 'The subscriber' : 'The institution';
  const q = (lead: string, text: string): QuoteTerm => ({ lead, text });
  return {
    advance: q('Advance Payment:', '100% payment is payable in advance. Access will be activated only after realization/confirmation of payment and receipt of any information reasonably required for account setup, tax, billing or access configuration.'),
    nonRefundable: q('Non-refundable after Activation:', `Once subscription access has been activated, the subscription fee is non-cancellable, non-refundable and non-transferable, except in the case of duplicate payment, billing error, or where a refund is required by applicable law or expressly approved in writing by ${co}.`),
    permittedUse: q('Permitted Use:', `Access is limited to ${who}, selected department scope and authorized users. Login credentials, IP-based access or user rights may not be shared, resold, sublicensed or provided to any third party outside ${who} without prior written approval.`),
    prohibited: q('Prohibited Activity:', 'Systematic or bulk downloading, scraping, automated extraction, redistribution, republication, resale, credential sharing, circumvention of technical controls, or any unlawful use is prohibited. The subscriber is responsible for the acts of its authorized users.'),
    suspension: q('Suspension / Termination for Misuse:', `${co} may suspend, restrict or terminate access, without refund, where there is material breach, misuse, credential sharing, abnormal or automated activity, security risk, infringement, fraud, or a legal/compliance requirement. Access may be restored after satisfactory cure and verification, at the company's discretion.`),
    contentChanges: q('Content & Platform Changes:', 'Titles, databases, third-party/open-access resources, features, interfaces and technical methods of access may be added, removed, replaced or modified due to publisher/licensing rights, technical, legal, security or operational reasons. Such changes do not by themselves create a right to refund or extension.'),
    availability: q('Availability / Maintenance:', 'The service is provided on a commercially reasonable-efforts basis. Temporary interruption caused by maintenance, upgrades, internet/network failure, third-party services, cyber/security events or force majeure will not ordinarily create a refund, credit or extension entitlement unless specifically agreed in writing.'),
    analytics: q('Analytics & User Administration:', `Platform access and usage data may be processed for authentication, security, user administration, service delivery, analytics, support, billing and service improvement in accordance with applicable law and the platform privacy policy. ${Who} is responsible for ensuring that user information supplied by it is lawful and accurate.`),
    regulatory: q('No Regulatory / Accreditation Guarantee:', 'Subscription to STM Digital Library is an academic information-resource service and does not constitute or guarantee accreditation, approval, recognition, ranking or compliance certification by UGC, AICTE, NAAC, NBA, NIRF or any other regulator/accreditation body.'),
    taxes: q('Taxes:', 'GST and other applicable taxes/duties are additional unless specifically included in the quotation. Any statutory withholding/TDS must be supported by a valid certificate/document as required by law.'),
    renewal: q('Renewal:', 'Renewal is subject to a fresh confirmation/quotation, then-current pricing and terms, and advance payment. No renewal or continuation is implied merely because access existed in the preceding year.'),
    liability: q('Limitation of Liability:', `To the maximum extent permitted by applicable law, ${co} will not be liable for indirect, incidental, special or consequential loss, loss of profits, loss of data or loss arising from unauthorized use. Aggregate liability relating to the affected subscription will not exceed the subscription fees actually received for that affected subscription term, except where such limitation is prohibited by law.`),
    indemnity: q('Subscriber Responsibility / Indemnity:', `The subscriber remains responsible for compliance by its users and shall indemnify ${co} against third-party claims, losses or reasonable costs arising from unlawful use, infringement, unauthorized redistribution, credential sharing or breach attributable to the subscriber or its users, subject to applicable law.`),
    written: q('Written Terms Prevail:', 'Any discount, waiver, additional commitment, special access right or variation is valid only when recorded in the quotation, invoice, purchase order accepted by the company, or another written approval issued by an authorized representative. Oral statements do not amend these terms.'),
    governing: q('Governing Law & Jurisdiction:', 'These terms and the subscription are governed by the laws of India. Subject to applicable law, courts at New Delhi/Delhi shall have exclusive jurisdiction over disputes arising from or relating to the quotation, payment, subscription, access or services.'),
  };
}

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
  const C = approvedClauses(o.subject === 'subscriber' ? 'subscriber' : 'institution');
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
    C.advance,
    C.nonRefundable,
    ...o.entitlement.map(t => ({ ...t, group: G1 })),
    ...(o.pricing || []).map(t => ({ ...t, group: G1 })),
    C.permittedUse, C.prohibited, C.suspension,
    C.contentChanges, C.availability, C.analytics, C.regulatory,
    C.taxes, C.renewal, C.liability, C.indemnity, C.written, C.governing,
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
  // Self-service quotations carry the snapshot the server priced; draw from that, not from the rate card.
  const kind = row?.pricingBreakdown?.kind;
  if (kind === INSTITUTION_PLAN_KIND) return institutionPlanToRender(row.pricingBreakdown, issuer);
  if (kind === SOLO_PLAN_KIND) return soloPlanToRender(row.pricingBreakdown, issuer);
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

// ── Self-service quotations (the downloads on the pricing screens) ─────────

/**
 * A quotation a customer takes from a pricing screen is a stored record, priced by the server.
 * It carries a snapshot of exactly what was priced — the departments, the slab, the rate and
 * the amounts — so a quotation raised today reads the same next year, whatever the rate card
 * says by then. The PDF, the admin preview and the print view all draw from that snapshot.
 *
 * Institution and Solo are different products with different rules, so they have different
 * snapshots. They share the sheet, not the pricing.
 */
export const INSTITUTION_PLAN_KIND = 'institution-plan-v1';
export const SOLO_PLAN_KIND = 'solo-plan-v1';
const PLAN_VALIDITY_DAYS = 30;

export type PlanCustomer = {
  name: string; contact?: string; email?: string; phone?: string; state?: string | null; gstin?: string | null;
};

export type InstitutionPlanSnapshot = {
  kind: typeof INSTITUTION_PLAN_KIND;
  quoteNo: string;
  /** yyyy-mm-dd */
  date: string;
  validityDays: number;
  customer: PlanCustomer;
  /** Departments the institution holds under running subscriptions. Counted for the slab, never charged. */
  existingDepartmentCount: number;
  newDepartmentCount: number;
  /** Existing plus new: the number that decides the slab. */
  totalDepartmentCount: number;
  appliedPricingSlab: string;
  /** The rate each NEW department is charged, from the slab of the total. */
  ratePerNewDepartment: number;
  /** The one-department rate, the reference for the slab benefit. */
  standardRate: number;
  newDepartmentNames: string[];
  /** Empty when the names are unknown; the count still stands. */
  existingDepartmentNames: string[];
  termMonths: number;
  maxUsers: number;
  subtotal: number;
  gst: number;
  grandTotal: number;
};

export type SoloPlanSnapshot = {
  kind: typeof SOLO_PLAN_KIND;
  quoteNo: string;
  date: string;
  validityDays: number;
  customer: PlanCustomer;
  departmentCount: number;
  pricingSlab: string;
  ratePerDepartment: number;
  departmentNames: string[];
  termMonths: number;
  subtotal: number;
  gst: number;
  grandTotal: number;
};

export type PlanSnapshot = InstitutionPlanSnapshot | SoloPlanSnapshot;

const unique = (names: string[]): string[] => [...new Set(names.map(n => String(n).trim()).filter(Boolean))];

/**
 * Prices an institution's addition. The slab is decided by the total after the purchase —
 * what it already holds plus what it adds — and only the added departments are charged at
 * that rate. This is the one place that arithmetic lives; the server calls it, and so do the
 * tests that pin the rate card.
 */
export function buildInstitutionPlanSnapshot(o: {
  quoteNo: string; now?: Date; customer: PlanCustomer; existingNames: string[]; newNames: string[];
}): InstitutionPlanSnapshot {
  const existing = unique(o.existingNames);
  const held = new Set(existing);
  const fresh = unique(o.newNames).filter(n => !held.has(n));
  const total = existing.length + fresh.length;
  const rate = departmentRate(total);
  const base = fresh.length * rate;
  const gst = round2(base * PLAN_GST_RATE);
  const now = o.now ?? new Date();
  return {
    kind: INSTITUTION_PLAN_KIND,
    quoteNo: o.quoteNo,
    date: isoDate(now),
    validityDays: PLAN_VALIDITY_DAYS,
    customer: o.customer,
    existingDepartmentCount: existing.length,
    newDepartmentCount: fresh.length,
    totalDepartmentCount: total,
    appliedPricingSlab: slabLabel(total),
    ratePerNewDepartment: rate,
    standardRate: departmentRate(1),
    newDepartmentNames: fresh,
    existingDepartmentNames: existing,
    termMonths: TERM_MONTHS,
    maxUsers: MAX_INSTITUTION_USERS,
    subtotal: base,
    gst,
    grandTotal: round2(base + gst),
  };
}

/** A Solo Learner's quotation. Solo pricing is its own: the slab is the purchase itself, not what is already held. */
export function buildSoloPlanSnapshot(o: {
  quoteNo: string; now?: Date; customer: PlanCustomer; names: string[];
}): SoloPlanSnapshot {
  const names = unique(o.names);
  const price = calculateSoloSubscriptionPrice(names.length, { state: o.customer.state });
  return {
    kind: SOLO_PLAN_KIND,
    quoteNo: o.quoteNo,
    date: isoDate(o.now ?? new Date()),
    validityDays: PLAN_VALIDITY_DAYS,
    customer: o.customer,
    departmentCount: names.length,
    pricingSlab: price.bulkApplied ? `${SOLO_BULK_THRESHOLD}+ departments` : `1-${SOLO_BULK_THRESHOLD - 1} departments`,
    ratePerDepartment: price.rate,
    departmentNames: names,
    termMonths: SOLO_TERM_MONTHS,
    subtotal: price.subtotal,
    gst: price.gst,
    grandTotal: price.total,
  };
}

/** The columns a stored self-service quotation carries, from its snapshot. Used by the server. */
export function planSnapshotToRow(s: PlanSnapshot) {
  const institution = s.kind === INSTITUTION_PLAN_KIND;
  const names = institution ? s.newDepartmentNames : s.departmentNames;
  const rate = institution ? s.ratePerNewDepartment : s.ratePerDepartment;
  const expires = parseIso(addDaysIso(s.date, s.validityDays)) || new Date(Date.now() + s.validityDays * 86_400_000);
  expires.setHours(23, 59, 59, 0);
  return {
    expiresAt: expires,
    data: {
      id: s.quoteNo,
      userEmail: (s.customer.email || '').trim(),
      userName: (s.customer.contact || s.customer.name || '').trim(),
      organization: institution ? s.customer.name : null,
      state: s.customer.state || null,
      mobile: s.customer.phone || null,
      planType: 'Yearly',
      allowedDomain: names.join(', ') || null,
      subtotal: s.subtotal,
      gstAmount: s.gst,
      total: s.grandTotal,
      discountAmount: 0,
      deliveryMethod: 'Download',
      items: [{
        domainName: names.join(', '),
        planName: institution ? 'Premium Department Subscription' : 'Department Subscription (Solo Learner)',
        duration: 'Yearly', quantity: names.length, price: rate,
      }],
      pricingBreakdown: s as any,
      selectedModules: [],
    },
  };
}

/** CGST + SGST within the company's state, IGST outside it, one GST line when the state is not known. */
function planTax(state: string | null | undefined, gst: number) {
  const st = (state || '').trim();
  const code = stateCodeOf(st);
  const inState = !!st && (code ? code === HOME_STATE_CODE : st.toLowerCase() === COMPANY_DETAILS.state.toLowerCase());
  const half = round2(gst / 2);
  return {
    state: st, stateCode: code,
    cgst: inState ? half : 0, sgst: inState ? round2(gst - half) : 0, igst: st && !inState ? gst : 0,
    tax: (!st ? 'single' : inState ? 'split' : 'igst') as 'split' | 'igst' | 'single',
  };
}

/** The GST and price-confirmation terms every self-service quotation closes with. */
function planClosingTerms(state: string, validityDays: number): QuoteTerm[] {
  const inState = planTax(state, 1).tax === 'split';
  return [
    { lead: 'Price Confirmation:', text: 'The price is held until the validity date; the amount shown at payment is the amount charged.' },
    {
      lead: 'GST:',
      text: state
        ? `GST is charged as ${inState ? 'CGST and SGST' : 'IGST'}, as the place of supply is ${state}.`
        : `GST is charged as CGST and SGST within ${COMPANY_DETAILS.state} and as IGST elsewhere, once the place of supply is confirmed.`,
    },
    { text: `This quotation is valid for ${validityDays} days from the quotation date.` },
  ];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function institutionPlanToRender(s: InstitutionPlanSnapshot, issuer: Issuer = issuerOf(null)): QuoteRender {
  const tax = planTax(s.customer.state, s.gst);
  const existing = s.existingDepartmentCount;
  const fresh = s.newDepartmentCount;
  const validTill = addDaysIso(s.date, s.validityDays);
  const rate = moneyAuto(s.ratePerNewDepartment);
  const benefitEach = Math.max(0, s.standardRate - s.ratePerNewDepartment);
  const users = `Up to ${s.maxUsers.toLocaleString('en-IN')} users, no extra charge`;
  const slab = s.appliedPricingSlab.replace(/^./, c => c.toUpperCase());

  const summary: QuoteRender['summary'] = existing > 0 ? [
    { label: 'Subscription', value: 'Premium Institutional' },
    { label: 'Existing active departments', value: String(existing) },
    { label: 'New departments in this quotation', value: String(fresh) },
    { label: 'Total departments after purchase', value: String(s.totalDepartmentCount) },
    { label: 'Applied pricing slab', value: slab },
    { label: 'Applied rate', value: `${rate} / department / year` },
    { label: 'Amount charged for', value: `${plural(fresh, 'new department')} only` },
    ...(benefitEach > 0 ? [{ label: 'Pricing slab benefit', value: `${moneyAuto(benefitEach * fresh)} (${moneyAuto(benefitEach)} x ${plural(fresh, 'new department')})` }] : []),
    { label: 'Duration', value: `${s.termMonths} months from activation (new departments)` },
    { label: 'User entitlement', value: users },
    { label: 'Valid until', value: dateDisplay(validTill) },
  ] : [
    { label: 'Subscription', value: 'Premium Institutional' },
    { label: 'Departments', value: String(fresh) },
    { label: 'Access scope', value: 'Subscribed departments listed above' },
    { label: 'Applied pricing slab', value: slab },
    { label: 'Department rate', value: `${rate} / department / year` },
    { label: 'Duration', value: `${s.termMonths} months from activation` },
    { label: 'User entitlement', value: users },
    { label: 'Valid until', value: dateDisplay(validTill) },
  ];

  const pricing: QuoteTerm[] = existing > 0 ? [
    {
      lead: 'Pricing Slab:',
      text: `The applicable department rate is determined using the total number of active departments after the proposed addition. Existing active departments: ${existing}. New departments: ${fresh}. Total after purchase: ${s.totalDepartmentCount}. Applied slab: ${s.appliedPricingSlab} at INR ${s.ratePerNewDepartment.toLocaleString('en-IN')} per department/year.`,
    },
    {
      lead: 'Amount Charged:',
      text: `The quoted amount applies only to the ${plural(fresh, 'newly added department')}. Existing active departments are not charged again under this quotation.`,
    },
    { lead: 'Department Rates:', text: `${departmentRateLadder()}, per year.` },
  ] : [
    { lead: 'Pricing Slab:', text: `Applied pricing slab: ${s.appliedPricingSlab} — INR ${s.ratePerNewDepartment.toLocaleString('en-IN')} per department/year.` },
    { lead: 'Department Rates:', text: `${departmentRateLadder()}, per year.` },
  ];

  return {
    quoteNo: s.quoteNo,
    date: s.date,
    validTill,
    title: 'Premium Institutional Subscription',
    subtitle: `${s.termMonths}-month subscription pricing in INR`,
    customer: {
      name: s.customer.name, contact: s.customer.contact || '', designation: '', email: s.customer.email || '',
      phone: s.customer.phone || '', address: '', state: tax.state, stateCode: tax.stateCode, gstin: (s.customer.gstin || '').trim(),
    },
    lines: [{
      title: 'Premium Department Subscription',
      sub: existing > 0
        ? "Additional department access under the institution's applicable subscription pricing slab."
        : `Full access to each subscribed department for ${s.termMonths} months from the date of activation.`,
      qty: String(fresh), rate: s.ratePerNewDepartment, amount: s.subtotal,
    }],
    gross: s.subtotal, discount: 0, subtotal: s.subtotal,
    cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst, total: s.grandTotal,
    tax: tax.tax, singleGst: s.gst,
    terms: standardTerms({
      validityDays: s.validityDays,
      subject: 'institution',
      // Every purchase is a new subscription that starts on its own day; it does not move the
      // end date of what the institution already holds, and the quotation says so.
      period: existing > 0
        ? `The ${s.termMonths}-month subscription term applies to the departments added under this quotation, from their date of activation. Existing active departments keep their current expiry dates; this quotation does not renew or extend them.`
        : `The subscription runs for ${s.termMonths} months from the date of activation.`,
      entitlement: [{
        lead: 'User Entitlement:',
        text: `Up to ${s.maxUsers.toLocaleString('en-IN')} users on the institution's account, at no extra charge. For more, please contact ${COMPANY_DETAILS.email}.`,
      }],
      pricing,
      extra: planClosingTerms(tax.state, s.validityDays).slice(0, 2),
    }),
    specialNote: '',
    issuer,
    summary,
    departments: s.newDepartmentNames,
    departmentsLabel: 'New departments in this quotation',
    existingDepartments: existing > 0 ? { count: existing, names: s.existingDepartmentNames } : undefined,
    termsHeading: 'Institutional Commercial Terms & Conditions',
    termsPointer: 'Commercial Terms & Conditions',
  };
}

export function soloPlanToRender(s: SoloPlanSnapshot, issuer: Issuer = issuerOf(null)): QuoteRender {
  const tax = planTax(s.customer.state, s.gst);
  const validTill = addDaysIso(s.date, s.validityDays);
  const bulk = s.departmentCount >= SOLO_BULK_THRESHOLD;
  const C = approvedClauses('subscriber');
  const [G1, G2, G3, G4] = TERM_GROUPS;
  const inr = (n: number) => `INR ${n.toLocaleString('en-IN')}`;
  const closing = planClosingTerms(tax.state, s.validityDays);

  // The approved clauses, in the order the Solo quotation prints them, under the same four
  // headings as the institutional one. Clauses that only make sense for an institution
  // (accreditation, indemnity) are not carried over.
  const terms: QuoteTerm[] = [
    { lead: 'Subscription Period:', text: `The subscription runs for ${s.termMonths} months from the date of activation.`, group: G1 },
    { ...C.advance, group: G1 },
    { ...C.nonRefundable, group: G1 },
    { lead: 'User Entitlement:', text: 'Your own account (1 user). The subscription gives full access to each subscribed department for the period above.', group: G1 },
    {
      lead: 'Pricing Slab:',
      text: `${inr(SOLO_RATE_STANDARD)} per department per year for 1-${SOLO_BULK_THRESHOLD - 1} departments; ${inr(SOLO_RATE_BULK)} per department per year for ${SOLO_BULK_THRESHOLD} or more departments, applicable to every selected department in that purchase. Applied here: ${bulk ? `${SOLO_BULK_THRESHOLD}+ department rate` : 'standard rate'}.`,
      group: G1,
    },
    { lead: 'Payment:', text: `Pay online from your Subscription page, or by bank transfer or UPI using the details on the previous page, then write to ${COMPANY_DETAILS.email} with the quotation number and the transfer reference.`, group: G1 },
    { ...closing[0], group: G1 },

    { ...C.permittedUse, group: G2 },
    { lead: 'Account & Credential Sharing:', text: "The Solo subscription is for the subscribing user's own account and must not be shared with another user.", group: G2 },
    { ...C.prohibited, group: G2 },
    { ...C.suspension, group: G2 },

    { ...C.contentChanges, group: G3 },
    { ...C.availability, group: G3 },
    { ...C.analytics, lead: 'Data, Analytics & Privacy:', text: C.analytics.text.replace('user administration, ', '').replace('user information supplied by it', 'information supplied by it'), group: G3 },

    { ...C.taxes, group: G4 },
    { ...closing[1], group: G4 },
    { ...C.renewal, group: G4 },
    { ...C.liability, group: G4 },
    { ...C.written, group: G4 },
    { ...C.governing, group: G4 },
    { lead: 'Quotation Validity:', text: `This quotation is valid for ${s.validityDays} days from the quotation date.`, group: G4 },
  ];

  return {
    quoteNo: s.quoteNo,
    date: s.date,
    validTill,
    title: 'Premium Subscription (Solo Learner)',
    subtitle: `${s.termMonths}-month subscription pricing in INR`,
    customer: {
      name: s.customer.name, contact: '', designation: '', email: s.customer.email || '',
      phone: s.customer.phone || '', address: '', state: tax.state, stateCode: tax.stateCode, gstin: '',
    },
    lines: [{
      title: 'Premium Department Subscription — Solo Learner',
      sub: `Full access to each subscribed department for ${s.termMonths} months from the date of activation.`,
      qty: String(s.departmentCount), rate: s.ratePerDepartment, amount: s.subtotal,
    }],
    gross: s.subtotal, discount: 0, subtotal: s.subtotal,
    cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst, total: s.grandTotal,
    tax: tax.tax, singleGst: s.gst,
    terms,
    specialNote: '',
    issuer,
    summary: [
      { label: 'Subscription', value: 'Premium Solo Learner' },
      { label: 'Departments', value: String(s.departmentCount) },
      { label: 'Access scope', value: 'Subscribed departments listed above' },
      { label: 'Pricing slab', value: s.pricingSlab.replace(/^./, c => c.toUpperCase()).replace('departments', 'Departments') },
      { label: 'Department rate', value: `${moneyAuto(s.ratePerDepartment)} / department / year` },
      { label: 'Duration', value: `${s.termMonths} months from activation` },
      { label: 'User entitlement', value: 'Your own account (1 user)' },
      { label: 'Valid until', value: dateDisplay(validTill) },
    ],
    departments: s.departmentNames,
    departmentsLabel: 'Subscribed departments',
    customerLabel: 'Customer details',
    termsHeading: 'Terms & Conditions',
    termsPointer: 'Terms & Conditions',
  };
}
