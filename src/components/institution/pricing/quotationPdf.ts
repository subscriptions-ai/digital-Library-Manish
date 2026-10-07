import { COMPANY_DETAILS } from '../../../config';
import { MAX_INSTITUTION_USERS, TERM_MONTHS } from '../../../lib/institutionPricing';
import { referenceQuote } from '../../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../../lib/quotation/quotationPdf';

/**
 * A quotation a librarian can take to their finance office.
 *
 * It carries the same numbers the screen showed — the server's quote when there was one —
 * and says plainly that the price is confirmed again at payment. It is drawn by the same
 * renderer as every other quotation (see lib/quotation), so the letterhead, tax split,
 * remittance details, UPI QR, terms and signature are identical to the ones sales sends.
 *
 * Tax is shown the way an invoice shows it: CGST + SGST within Delhi, IGST outside it. When
 * the customer's state is not known the split is not guessed: the total is shown as GST and
 * the place of supply is asked for.
 */

export type QuotationInput = {
  institution?: string;
  /** The contact's name and email, shown as "Attn". */
  contactName?: string;
  contactEmail?: string;
  /** Where the customer is, which decides CGST + SGST or IGST. */
  customerState?: string | null;
  customerGstin?: string | null;
  /** Kept for callers that still pass one pre-built line. */
  preparedFor?: string;
  title: string;
  /** Compact label/value rows under the subject: departments, period. */
  summary?: [string, string][];
  /** Which pricing slab applied, already worded, shown beside the totals. */
  slabNote?: string;
  lines: { description: string; quantity: number; rate: number }[];
  /** The departments bought; they share one rate, so they are shown as one subscription line. */
  departments?: string[];
  base: number;
  gst: number;
  total: number;
  notes: string[];
  fileName: string;
};

// Display only: a word typed in lower case gets a capital, anything already
// capitalised (an acronym, a name like "McGill") is left as it was typed.
const titleCase = (s: string) =>
  s.replace(/\S+/g, w => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w));

export async function downloadQuotation(q: QuotationInput) {
  // Every department is bought at the same rate, so the quotation has one subscription line
  // and lists the departments beneath it.
  const rate = q.lines[0]?.rate ?? 0;
  const departments = q.departments?.length
    ? q.departments
    : q.lines.map(l => l.description.replace(/^Department subscription:\s*/, '').replace(/\s*\(\d+ months\)$/, ''));
  const render = referenceQuote({
    prefix: 'STMQ',
    title: q.title,
    subtitle: `${TERM_MONTHS}-month subscription pricing in INR`,
    subject: 'institution',
    customer: {
      name: titleCase(q.institution || 'Your institution'),
      contact: q.contactName ? titleCase(q.contactName) : (q.preparedFor || ''),
      email: q.contactEmail,
      state: q.customerState,
      gstin: q.customerGstin,
    },
    departments,
    deptRate: rate,
    lineTitle: 'Premium Department Subscription',
    lineSub: `Full access to each subscribed department for ${TERM_MONTHS} months from the date of activation.`,
    subscriptionType: 'Premium Institutional',
    duration: `${TERM_MONTHS} months from activation`,
    users: `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users, no extra charge`,
    base: q.base, gst: q.gst, total: q.total,
    period: `The subscription runs for ${TERM_MONTHS} months from the date of activation.`,
    entitlement: [
      {
        lead: 'User Entitlement:',
        text: `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users on the institution's account, at no extra charge. For more, please contact ${COMPANY_DETAILS.email}.`,
      },
    ],
    pricing: [
      ...(q.slabNote ? [{ lead: 'Pricing Slab:', text: q.slabNote }] : []),
      ...q.notes.map(text => ({ text })),
    ],
  });
  await downloadQuotationPdf(render, q.fileName);
}
