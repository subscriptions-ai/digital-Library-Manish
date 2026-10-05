/**
 * What an institution pays: departments, by the year.
 *
 * One file, read by the server (which decides what a payment is for and how much it must be)
 * and by the screens (which show the same numbers before anyone pays). A price the browser
 * works out is only ever a preview; the order is always priced again here, on the server.
 *
 * - A department costs less each the more are bought together: ₹9,990 for one, ₹7,990 each
 *   for five or more.
 * - Users are not priced. A paid subscription covers up to 1,000 users; beyond that, contact us.
 * - Every purchase runs twelve months from the day it is bought.
 * - GST is 18% on top of everything.
 */

export const GST_RATE = 0.18;

/**
 * The most users one institution may have on a paid subscription. There is no charge per user
 * below it; beyond it the institution is asked to contact us.
 */
export const MAX_INSTITUTION_USERS = 1000;

/** Every purchase lasts this long from the day it is made. */
export const TERM_MONTHS = 12;

/** Per-department yearly price by how many departments are bought together. */
export const DEPARTMENT_RATES: { minDepartments: number; rate: number }[] = [
  { minDepartments: 5, rate: 7990 },
  { minDepartments: 4, rate: 8490 },
  { minDepartments: 3, rate: 8990 },
  { minDepartments: 2, rate: 9490 },
  { minDepartments: 1, rate: 9990 }
];

/** The lowest per-department price, for "starting from" labels. */
export const STARTING_DEPARTMENT_RATE = DEPARTMENT_RATES[0].rate;

export function departmentRate(count: number): number {
  if (count < 1) return 0;
  return DEPARTMENT_RATES.find((tier) => count >= tier.minDepartments)!.rate;
}

export type PriceBreakdown = {
  /** Units charged: departments, or extra seats. */
  quantity: number;
  rate: number;
  base: number;
  gst: number;
  total: number;
};

/** Rupees to two places; GST on whole-rupee bases only ever needs two. */
const round2 = (value: number) => Math.round(value * 100) / 100;

function withGst(quantity: number, rate: number): PriceBreakdown {
  const base = quantity * rate;
  const gst = round2(base * GST_RATE);
  return { quantity, rate, base, gst, total: round2(base + gst) };
}

export function priceDepartments(count: number): PriceBreakdown {
  return withGst(Math.max(0, Math.floor(count)), departmentRate(count));
}

/** Twelve months on from `from`: bought in October, it ends in the following September. */
export function termEnd(from: Date = new Date()): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + TERM_MONTHS);
  return end;
}

export function formatRupees(value: number, decimals = 0): string {
  return '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
