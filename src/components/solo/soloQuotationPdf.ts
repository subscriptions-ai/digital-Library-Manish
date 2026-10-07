import { COMPANY_DETAILS } from '../../config';
import { referenceQuote } from '../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../lib/quotation/quotationPdf';
import { SOLO_TERM_MONTHS, SOLO_RATE_STANDARD, SOLO_RATE_BULK, SOLO_BULK_THRESHOLD, type SoloPrice } from '../../lib/soloPricing';

/**
 * A quotation a Solo Learner can keep or pass to whoever is paying.
 *
 * It states Solo Learner pricing and nothing else: the institution rate card and the
 * institution quotation are separate and are not used here. It is drawn by the same renderer
 * as every other quotation (see lib/quotation), so the letterhead, tax split, remittance
 * details, UPI QR, terms and signature match.
 *
 * Like the institution download it is a reference, not a stored record, and the price is
 * confirmed again by the server at payment.
 */

export type SoloQuotationInput = {
  name?: string;
  email?: string;
  state?: string | null;
  departments: string[];
  price: SoloPrice;
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export async function downloadSoloQuotation(q: SoloQuotationInput) {
  const { price } = q;
  const render = referenceQuote({
    prefix: 'STMQ-S',
    title: 'Premium Subscription (Solo Learner)',
    subtitle: `${SOLO_TERM_MONTHS}-month subscription pricing in INR`,
    subject: 'subscriber',
    customer: { name: q.name || 'Solo Learner', email: q.email, state: q.state },
    departments: q.departments,
    deptRate: price.rate,
    lineTitle: 'Department Subscription (Solo Learner)',
    lineSub: `Full access to each subscribed department for ${SOLO_TERM_MONTHS} months from the date of activation.`,
    subscriptionType: 'Premium Solo Learner',
    duration: `${SOLO_TERM_MONTHS} months from activation`,
    users: 'Your own account (1 user)',
    base: price.subtotal, gst: price.gst, total: price.total,
    period: `The subscription runs for ${SOLO_TERM_MONTHS} months from the date of activation.`,
    compact: true,
    entitlement: [
      { lead: 'Includes:', text: `Full access to each subscribed department for ${SOLO_TERM_MONTHS} months from the date of activation.` },
      { lead: 'Account:', text: 'The subscription is for your own account and is not shared with other users.' },
    ],
    pricing: [
      {
        lead: 'Pricing:',
        text: `${inr(SOLO_RATE_STANDARD)} per department per year for 1-${SOLO_BULK_THRESHOLD - 1} departments; ${inr(SOLO_RATE_BULK)} per department per year for ${SOLO_BULK_THRESHOLD} or more, on every department. Applied here: ${price.bulkApplied ? `${SOLO_BULK_THRESHOLD}+ department rate` : 'standard rate'}.`,
      },
    ],
    extra: [
      { lead: 'Payment:', text: `Pay online from your Subscription page, or by bank transfer or UPI using the details above, then write to ${COMPANY_DETAILS.email} with the quotation number and the transfer reference.` },
    ],
  });
  await downloadQuotationPdf(render, 'STM_Digital_Library_Solo_Subscription_Quotation.pdf');
}
