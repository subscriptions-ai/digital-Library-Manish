/**
 * What a Solo Learner pays: departments, by the year.
 *
 * This is deliberately its own file. Institutions have their own rate card in
 * institutionPricing.ts and nothing here reads or reuses it — the two have different business
 * rules and must be free to change separately.
 *
 * - 1 to 4 departments: ₹4,990 each, per year.
 * - 5 or more: ₹3,990 each, per year — and the lower rate applies to ALL of them, not just the
 *   fifth onwards.
 * - Every purchase runs twelve months from the day it is bought.
 * - GST is 18% on top: CGST + SGST for a customer in the state we are registered in, IGST
 *   elsewhere. When the customer's state is not known the split is not guessed.
 *
 * Read by the server, which decides what a payment is for and how much it must be, and by the
 * screens, which show the same numbers before anyone pays. A price the browser works out is only
 * ever a preview; the order is always priced again on the server.
 */
import { GST_RATE, COMPANY_STATE } from './gstUtils';

export const SOLO_RATE_STANDARD = 4990;
export const SOLO_RATE_BULK = 3990;
/** From this many departments, the bulk rate applies to every one of them. */
export const SOLO_BULK_THRESHOLD = 5;
export const SOLO_TERM_MONTHS = 12;

export const SOLO_FOUR_DEPT_MESSAGE = `Add one more department to unlock the ₹3,990 per department annual rate.`;

export type SoloGstSplit = 'cgst-sgst' | 'igst' | 'unknown';

export type SoloPrice = {
  count: number;
  /** Rate per department, per year. 0 when nothing is selected. */
  rate: number;
  subtotal: number;
  gst: number;
  /** Only meaningful when gstSplit is 'cgst-sgst'. */
  cgst: number;
  sgst: number;
  igst: number;
  gstSplit: SoloGstSplit;
  total: number;
  /** The 5+ rate is being applied. */
  bulkApplied: boolean;
  /** Departments still to add to reach the bulk rate: 1 at four departments, else 0. */
  toUnlockBulk: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function soloRateFor(count: number): number {
  const n = Math.floor(count);
  if (n < 1) return 0;
  return n >= SOLO_BULK_THRESHOLD ? SOLO_RATE_BULK : SOLO_RATE_STANDARD;
}

/** Where the GST goes: within the state we are registered in, or outside it. */
export function soloGstSplit(customerState?: string | null): SoloGstSplit {
  const state = (customerState || '').trim().toLowerCase();
  if (!state) return 'unknown';
  return state === COMPANY_STATE.toLowerCase() ? 'cgst-sgst' : 'igst';
}

export function calculateSoloSubscriptionPrice(count: number, opts: { state?: string | null } = {}): SoloPrice {
  const n = Math.max(0, Math.floor(count || 0));
  const rate = soloRateFor(n);
  const subtotal = n * rate;
  const gst = round2(subtotal * GST_RATE);
  const gstSplit = soloGstSplit(opts.state);
  const cgst = gstSplit === 'cgst-sgst' ? round2(gst / 2) : 0;
  const sgst = gstSplit === 'cgst-sgst' ? round2(gst - cgst) : 0;
  const igst = gstSplit === 'igst' ? gst : 0;
  return {
    count: n,
    rate,
    subtotal,
    gst,
    cgst,
    sgst,
    igst,
    gstSplit,
    total: round2(subtotal + gst),
    bulkApplied: n >= SOLO_BULK_THRESHOLD,
    toUnlockBulk: n === SOLO_BULK_THRESHOLD - 1 ? 1 : 0,
  };
}
