import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, MailX } from 'lucide-react';

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
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-16">
      <Helmet><title>Email preferences — STM Digital Library</title></Helmet>
      <div className="rounded-2xl border border-rule bg-surface p-8 shadow-sm">
        {state === 'loading' && (
          <p className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" /> One moment…</p>
        )}

        {state === 'gone' && (
          <>
            <h1 className="font-serif text-[26px] font-medium text-ink">This link is no longer valid</h1>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              It may have been used already, or the account may have been closed. If you are still
              getting mail you did not ask for, reply to any of it and a person will stop it.
            </p>
            <Link to="/" className="mt-6 inline-block text-[14px] font-semibold text-accent hover:underline">Go to the library</Link>
          </>
        )}

        {state === 'ready' && !optedOut && (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"><MailX size={20} /></span>
            <h1 className="mt-4 font-serif text-[26px] font-medium text-ink">Stop update emails?</h1>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              We will stop sending <b className="text-ink">{email}</b> news about the library, new
              features and membership. <br />
              <span className="text-ink-2">Aapke OTP, receipt aur account se judi zaroori mails phir bhi aayengi.</span>
            </p>
            <button onClick={() => change(false)} disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[14px] font-semibold text-surface hover:opacity-90 disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />} Unsubscribe me
            </button>
          </>
        )}

        {state === 'ready' && optedOut && (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"><CheckCircle2 size={20} /></span>
            <h1 className="mt-4 font-serif text-[26px] font-medium text-ink">Done — no more update emails</h1>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              <b className="text-ink">{email}</b> will not get news or membership mail from us.
              Anything you ask for yourself — a verification code, a receipt — still arrives.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => change(true)} disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-rule-2 px-5 py-3 text-[14px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60">
                {busy && <Loader2 size={15} className="animate-spin" />} Actually, keep me subscribed
              </button>
              <Link to="/" className="inline-flex items-center rounded-xl bg-ink px-5 py-3 text-[14px] font-semibold text-surface hover:opacity-90">
                Go to the library
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
