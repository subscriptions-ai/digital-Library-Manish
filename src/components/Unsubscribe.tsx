import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, MailX } from 'lucide-react';
import { Button, buttonClass } from './ui';

/**
 * One click out of marketing mail, with no login.
 *
 * A link in an email is opened by whoever is holding the phone, which is why
 * it carries a token rather than an address: there is nothing here to guess,
 * and nothing to learn about anyone else. The page says plainly what stops and
 * what does not, and it can be undone on the spot by the person who did it.
 */
export function Unsubscribe() {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [email, setEmail] = useState('');
  const [optedOut, setOptedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/unsubscribe/${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setEmail(d.email); setOptedOut(!!d.alreadyOut); setState('ready'); })
      .catch(() => setState('gone'));
  }, [token]);

  const change = async (resubscribe: boolean) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/public/unsubscribe/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resubscribe }),
      });
      if (!r.ok) throw new Error();
      setOptedOut(!resubscribe);
    } catch {
      setState('gone');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-public flex min-h-[70vh] max-w-xl flex-col justify-center py-16">
      <Helmet><title>Email preferences — STM Digital Library</title></Helmet>
      <div className="card p-6 sm:p-8">
        {state === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> One moment…</p>
        )}

        {state === 'gone' && (
          <>
            <h1 className="text-2xl font-bold text-ink">This link is no longer valid</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              It may have been used already, or the account may have been closed. If you are still
              getting mail you did not ask for, reply to any of it and a person will stop it.
            </p>
            <Link to="/" className={buttonClass('brand', 'md', 'mt-6')}>Go to the library</Link>
          </>
        )}

        {state === 'ready' && !optedOut && (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true"><MailX size={20} /></span>
            <h1 className="mt-4 text-2xl font-bold text-ink">Stop update emails?</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              We will stop sending <b className="text-ink">{email}</b> news about the library, new
              features and membership. <br />
              <span className="text-ink-2">Your OTP, receipt and other essential account mails will still reach you.</span>
            </p>
            <Button variant="brand" className="mt-6" onClick={() => change(false)} loading={busy}>
              Unsubscribe me
            </Button>
          </>
        )}

        {state === 'ready' && optedOut && (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft text-success" aria-hidden="true"><CheckCircle2 size={20} /></span>
            <h1 className="mt-4 text-2xl font-bold text-ink">Done — no more update emails</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              <b className="text-ink">{email}</b> will not get news or membership mail from us.
              Anything you ask for yourself — a verification code, a receipt — still arrives.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => change(true)} loading={busy}>
                Actually, keep me subscribed
              </Button>
              <Link to="/" className={buttonClass('brand')}>
                Go to the library
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
