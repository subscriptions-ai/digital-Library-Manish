/**
 * The institution's plan as the server sees it, and the one way to pay for more of it.
 *
 * Prices here are previews. Whatever the server quotes is the price, and what a payment
 * activates is read back from the order the server wrote, never from this browser.
 */

import type { InstitutionPlanSnapshot } from '../../../lib/quotation/quotationModel';

export type InstitutionPlan = {
  unlimitedSeats: boolean;
  hasSubscription: boolean;
  departments: { name: string; endDate: string }[];
  /** capacity and available are null on a plan made before seat pricing: no cap. */
  seats: { capacity: number | null; used: number; available: number | null; included: number; extra: number };
  seatPurchases: { seats: number; rate: number; startDate: string; endDate: string }[];
  allDepartments: string[];
};

export type ServerPrice = { quantity: number; rate: number; base: number; gst: number; total: number };

export type PurchaseBody =
  | { kind: 'departments'; departments: string[] }
  | { kind: 'seats'; totalUsers: number };

export type Quote = {
  kind: 'departments' | 'seats'; departments?: string[]; totalUsers?: number; price: ServerPrice;
  /** What the rate was decided from: the departments already held, and the total after this purchase. */
  existingDepartments?: string[]; totalAfter?: number;
};

/**
 * Asks the server for the quotation: it prices the purchase from the institution's own plan,
 * stores the quotation, and returns the snapshot the PDF is drawn from.
 */
export async function requestQuotation(body: PurchaseBody): Promise<{ quotation?: InstitutionPlanSnapshot; error?: string }> {
  try {
    const res = await fetch('/api/institution/quotation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || 'Could not prepare the quotation.' };
    return { quotation: data.quotation };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

/** Fired after a purchase, so the rail, the clock and every open screen read the plan again. */
export const PLAN_CHANGED = 'institution-plan-changed';

const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export async function fetchPlan(): Promise<InstitutionPlan | null> {
  const res = await fetch('/api/institution/plan', { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchQuote(body: PurchaseBody): Promise<{ quote?: Quote; error?: string }> {
  try {
    const res = await fetch('/api/institution/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || 'Could not price this.' };
    return { quote: data };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

let razorpayScript: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  if (!razorpayScript) {
    razorpayScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => { razorpayScript = null; reject(new Error('Could not load the payment window.')); };
      document.body.appendChild(s);
    });
  }
  return razorpayScript;
}

async function verify(payload: Record<string, string | undefined>): Promise<{ ok: boolean; endDate?: string; error?: string }> {
  const res = await fetch('/api/institution/checkout/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || 'Payment could not be verified.' };
  return { ok: true, endDate: data?.endDate };
}

export type PaymentResult =
  | { status: 'paid'; endDate?: string }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

/**
 * Orders the purchase on the server, takes the payment, and has the server verify it.
 *
 * Without Razorpay keys (local development) the server hands back a mock order, and the
 * payment window is skipped: the order goes straight to verification.
 */
export async function payForPurchase(
  body: PurchaseBody,
  who: { name?: string; email?: string; description: string },
): Promise<PaymentResult> {
  let order: any;
  try {
    const res = await fetch('/api/institution/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    order = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'failed', error: order?.error || 'Could not start the payment.' };
  } catch {
    return { status: 'failed', error: 'Could not reach the server.' };
  }

  if (order.isMock) {
    const v = await verify({ razorpay_order_id: order.id });
    return v.ok ? { status: 'paid', endDate: v.endDate } : { status: 'failed', error: v.error! };
  }

  try {
    await loadRazorpay();
  } catch (e: any) {
    return { status: 'failed', error: e.message };
  }

  return new Promise<PaymentResult>((resolve) => {
    const rzp = new (window as any).Razorpay({
      key: order.razorpayKey,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.id,
      name: 'STM Digital Library',
      description: who.description,
      prefill: { name: who.name, email: who.email },
      theme: { color: '#0b6e72' },
      handler: async (resp: any) => {
        const v = await verify({
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
        });
        resolve(v.ok ? { status: 'paid', endDate: v.endDate } : { status: 'failed', error: v.error! });
      },
      modal: { ondismiss: () => resolve({ status: 'cancelled' }) },
    });
    rzp.on?.('payment.failed', (r: any) => resolve({ status: 'failed', error: r?.error?.description || 'The payment did not go through.' }));
    rzp.open();
  });
}
