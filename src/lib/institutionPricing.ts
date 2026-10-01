/**
 * What an institution pays: departments by the year, and full-access user seats on top.
 *
 * One file, read by the server (which decides what a payment is for and how much it must be)
 * and by the screens (which show the same numbers before anyone pays). A price the browser
 * works out is only ever a preview; the order is always priced again here, on the server.
 *
 * - A department costs less each the more are bought together: ₹9,990 for one, ₹7,990 each
 *   for five or more.
 * - The subscription includes five users: the librarian and four more.
 * - Beyond those, each extra user costs the rate for the band the institution's new total
 *   falls in — 6 to 100 users ₹2,490 each, down to ₹1,000 each from 1,000 users.
 * - Every purchase, departments or seats, runs twelve months from the day it is bought.
 * - GST is 18% on top of everything.
 */

export const GST_RATE = 0.18;

/** Users that come with a department subscription, the librarian included. */
export const INCLUDED_SEATS = 5;

/** Every purchase, of departments or of seats, lasts this long from the day it is made. */
export const TERM_MONTHS = 12;

/** Per-department yearly price by how many departments are bought together. */
export const DEPARTMENT_RATES: { minDepartments: number; rate: number }[] = [
  { minDepartments: 5, rate: 7990 },
  { minDepartments: 4, rate: 8490 },
  { minDepartments: 3, rate: 8990 },
  { minDepartments: 2, rate: 9490 },
  { minDepartments: 1, rate: 9990 }
];

/** Yearly price of each extra user, by the institution's total user count after the purchase. */
export const SEAT_BANDS: { upTo: number; rate: number; label: string }[] = [
  { upTo: 100, rate: 2490, label: '6–100 users' },
  { upTo: 250, rate: 1990, label: '101–250 users' },
  { upTo: 500, rate: 1490, label: '251–500 users' },
  { upTo: 999, rate: 1190, label: '501–999 users' },
  { upTo: Infinity, rate: 1000, label: '1,000+ users' }
];

/** The lowest per-department price, for "starting from" labels. */
export const STARTING_DEPARTMENT_RATE = DEPARTMENT_RATES[0].rate;

export function departmentRate(count: number): number {
  if (count < 1) return 0;
  return DEPARTMENT_RATES.find((tier) => count >= tier.minDepartments)!.rate;
}

export function seatRate(totalUsers: number): number {
  if (totalUsers <= INCLUDED_SEATS) return 0;
  return SEAT_BANDS.find((band) => totalUsers <= band.upTo)!.rate;
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

/**
 * The price of growing from `currentCapacity` seats to `totalUsers`.
 *
 * Only the added seats are charged, all at the rate of the band the new total falls in — the
 * same rule the prototype's calculator shows. An institution at 5 asking for 50 pays for 45 at
 * ₹2,490. Asking for no more than it already holds costs nothing.
 */
export function priceSeats(totalUsers: number, currentCapacity: number = INCLUDED_SEATS): PriceBreakdown {
  const total = Math.max(0, Math.floor(totalUsers));
  const added = Math.max(0, total - Math.max(INCLUDED_SEATS, currentCapacity));
  return withGst(added, added ? seatRate(total) : 0);
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
