/**
 * The price lists as the screens show them, read from the same files that price a quotation,
 * a checkout and a subscription — never typed out again. A screen that shows a price calls one
 * of these; if a rate changes in `soloPricing.ts` or `institutionPricing.ts`, every card,
 * dialog and quotation changes with it.
 *
 * The two lists are separate products and are never mixed: Solo Learners are shown the first,
 * an institution the second, chosen by the account's type — not by the page it is looking at.
 */
import { DEPARTMENT_RATES, GST_RATE as INSTITUTION_GST_RATE, formatRupees } from './institutionPricing';
import { SOLO_BULK_THRESHOLD, SOLO_RATE_BULK, SOLO_RATE_STANDARD } from './soloPricing';
import { GST_RATE as SOLO_GST_RATE } from './gstUtils';

/** The words every pricing screen uses for the same things. */
export const PRICE_LABELS = {
  product: 'Annual Department Subscription',
  perDepartment: 'Per Department / Year',
  unit: '/ department / year',
  subtotal: 'Subtotal',
  gst: (percent: number) => `GST @ ${percent}%`,
  grandTotal: 'Grand Total',
  bulkRate: (threshold: number) => `${threshold}+ Department Rate`,
} as const;

export type PricingTier = {
  /** "1 Department", "2 Departments", "5+ Departments", "1–4 Departments". */
  label: string;
  rate: number;
  /** The rate, formatted: "₹8,990". */
  price: string;
  /** "each" for a tier that prices every department, empty for the single-department tier. */
  suffix: string;
  /** The lowest and highest number of departments this tier covers (max null: no upper limit). */
  min: number;
  max: number | null;
  /** The best rate, shown with emphasis. */
  best: boolean;
};

export type PricingDisplay = {
  kind: 'solo' | 'institution';
  tiers: PricingTier[];
  gstPercent: number;
  /** The tier a total of `count` departments is priced in. */
  tierFor: (count: number) => PricingTier | null;
};

const dept = (n: number, plus = false) => `${n}${plus ? '+' : ''} ${n === 1 && !plus ? 'Department' : 'Departments'}`;

function finish(kind: 'solo' | 'institution', tiers: PricingTier[], gstPercent: number): PricingDisplay {
  return {
    kind, tiers, gstPercent,
    tierFor: (count) => (count < 1 ? null : tiers.find(t => count >= t.min && (t.max === null || count <= t.max)) ?? null),
  };
}

/** Solo / individual: one rate up to four departments, a lower one on every department from five. */
export function getSoloPricingDisplay(): PricingDisplay {
  const top = SOLO_BULK_THRESHOLD;
  return finish('solo', [
    { label: top - 1 > 1 ? `1–${top - 1} Departments` : '1 Department', rate: SOLO_RATE_STANDARD, price: formatRupees(SOLO_RATE_STANDARD), suffix: 'each', min: 1, max: top - 1, best: false },
    { label: dept(top, true), rate: SOLO_RATE_BULK, price: formatRupees(SOLO_RATE_BULK), suffix: 'each', min: top, max: null, best: true },
  ], Math.round(SOLO_GST_RATE * 100));
}

/** Institution: the rate falls with each department held in total, from ₹9,990 for one. */
export function getInstitutionPricingDisplay(): PricingDisplay {
  const asc = [...DEPARTMENT_RATES].sort((a, b) => a.minDepartments - b.minDepartments);
  const top = asc[asc.length - 1].minDepartments;
  return finish('institution', asc.map(t => ({
    label: dept(t.minDepartments, t.minDepartments === top),
    rate: t.rate,
    price: formatRupees(t.rate),
    suffix: t.minDepartments > 1 ? 'each' : '',
    min: t.minDepartments,
    max: t.minDepartments === top ? null : t.minDepartments,
    best: t.minDepartments === top,
  })), Math.round(INSTITUTION_GST_RATE * 100));
}
