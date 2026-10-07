/**
 * A Solo Learner's subscription as the server sees it, and the one way to pay for more of it.
 *
 * Prices here are previews. Whatever the server quotes is the price, and what a payment
 * activates is read back from the order the server wrote, never from this browser. These routes
 * are separate from the institution's and refuse anyone who did not register as a Solo Learner.
 */
import type { SoloPrice } from '../../lib/soloPricing';

export type SoloPlan = {
  name?: string;
  email?: string;
  state?: string | null;
  /** Staff have granted whole-library access: there is nothing left to buy. */
  wholeLibrary: boolean;
  departments: { name: string; endDate: string }[];
  /** When the last subscription ran out, if none is running and one has. */
  lapsedOn?: string | null;
  allDepartments: string[];
};

/** Fired after a purchase, so the sidebar card and every open screen read the plan again. */
export const SOLO_PLAN_CHANGED = 'solo-plan-changed';

export type SoloQuote = { departments: string[]; price: SoloPrice };

const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export async function fetchSoloPlan(): Promise<SoloPlan | null> {
  try {
    const res = await fetch('/api/me/subscribe/plan', { headers: authHeaders() });
    if (!res.ok) return null;
    // `await` keeps a body that is not JSON (an old server answering with the app's HTML page)
    // inside this try, so the screen gets null instead of a rejection nobody handles.
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSoloQuote(departments: string[]): Promise<{ quote?: SoloQuote; error?: string }> {
  try {
    const res = await fetch('/api/me/subscribe/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ departments }),
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
  const res = await fetch('/api/me/subscribe/checkout/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || 'Payment could not be verified.' };
  return { ok: true, endDate: data?.endDate };
}

export type SoloPaymentResult =
  | { status: 'paid'; endDate?: string }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

/**
 * Orders the departments on the server, takes the payment, and has the server verify it.
 * Without Razorpay keys (local development) the server hands back a mock order, and the payment
 * window is skipped: the order goes straight to verification.
 */
export async function payForSoloSubscription(
  departments: string[],
  who: { name?: string; email?: string; description: string },
): Promise<SoloPaymentResult> {
  let order: any;
  try {
    const res = await fetch('/api/me/subscribe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ departments }),
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

  return new Promise<SoloPaymentResult>((resolve) => {
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
