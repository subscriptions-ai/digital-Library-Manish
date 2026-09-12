import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Sparkles, Check, Clock, Infinity as InfinityIcon, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAllowance, countdown, clockTime } from './ReadingClock';

/**
 * Membership: what this member has, and how to ask for more.
 *
 * No price appears here, and none should. Terms are agreed on a call; the form
 * starts that call. What the page owes the member instead is a straight account
 * of the limit they have run into and what lifting it means.
 */
export function ProMembership() {
  const { profile } = useAuth();
  const { allowance, msLeft, msUntil, refresh } = useAllowance();
  const [application, setApplication] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ organization: '', contact: '', designation: '', purpose: '' });

  const auth = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  useEffect(() => {
    setForm(f => ({
      ...f,
      organization: f.organization || (profile as any)?.organization || '',
      contact: f.contact || (profile as any)?.contact || '',
      designation: f.designation || (profile as any)?.designation || '',
    }));
  }, [profile]);

  useEffect(() => {
    fetch('/api/me/pro-application', { headers: auth })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setApplication(d?.application || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await fetch('/api/me/pro-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not send your application');
      setApplication(d.application);
      toast.success('Application sent — we will be in touch');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const pro = allowance && !allowance.timed;
  const waiting = application?.status === 'Pending';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Membership</p>
      <h1 className="mt-1 font-serif text-2xl text-ink sm:text-3xl">
        {pro ? 'You read without a limit' : 'Your free membership'}
      </h1>

      {/* ── where they stand ─────────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-rule bg-surface p-5">
        {pro ? (
          <div className="flex items-start gap-3">
            <InfinityIcon className="mt-0.5 shrink-0 text-accent" size={20} />
            <div>
              <p className="text-sm font-semibold text-ink">Pro membership is active</p>
              <p className="mt-1 text-sm text-muted">
                The whole library, for as long as you like. No sessions, no waiting.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {allowance?.state === 'running' ? <>This session ends in <span className="tabular-nums text-accent">{countdown(msLeft ?? 0)}</span></>
                  : allowance?.state === 'paused' ? <>{Math.round((allowance.remainingMs ?? 0) / 60_000)} minutes are kept for you</>
                  : allowance?.state === 'waiting' ? <>Next session at <span className="text-caution">{clockTime(allowance.nextOpensAt)}</span>{msUntil ? <> — in {countdown(msUntil)}</> : null}</>
                  : allowance?.state === 'spent' ? <>Today’s two hours are used</>
                  : <>Ready when you are</>}
              </p>
              <p className="font-mono text-xs text-faint">
                {Math.round((allowance?.usedTodayMs ?? 0) / 60_000)} of 120 min today
              </p>
            </div>

            <div className="mt-3 flex gap-1">
              {Array.from({ length: allowance?.sessionsPerDay ?? 4 }).map((_, i) => {
                const used = i < (allowance?.sessionsToday ?? 0);
                return <div key={i} className={`h-1.5 flex-1 rounded-full ${used ? 'bg-accent' : 'bg-rule'}`} />;
              })}
            </div>

            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-accent" />
                The whole library — every subject, every kind of material.</li>
              <li className="flex gap-2"><Clock size={15} className="mt-0.5 shrink-0 text-muted" />
                Half an hour at a time, four times a day, with two hours between sessions.</li>
              <li className="flex gap-2"><Clock size={15} className="mt-0.5 shrink-0 text-muted" />
                <span><b className="text-ink">The clock stops when you sign out</b> — closing the tab does not stop it,
                  and whatever is left of the session is kept for your next visit.</span></li>
            </ul>
          </>
        )}
      </div>

      {/* ── asking for more ──────────────────────────────────────────────── */}
      {!pro && !loading && (
        waiting ? (
          <div className="mt-5 rounded-2xl border border-accent bg-accent-soft p-5">
            <p className="text-sm font-semibold text-accent">Your application is with us</p>
            <p className="mt-1 text-sm text-muted">
              Sent {new Date(application.createdAt).toLocaleDateString()}. Someone will call you to agree the
              terms, and your reading limit lifts as soon as it is approved.
            </p>
          </div>
        ) : (
          <form onSubmit={apply} className="mt-5 rounded-2xl border border-rule bg-surface p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 shrink-0 text-accent" size={20} />
              <div>
                <h2 className="text-sm font-semibold text-ink">Apply for Pro</h2>
                <p className="mt-1 text-sm text-muted">
                  Pro removes the sessions entirely — read for as long as you like, whenever you like.
                  Tell us a little and we will call to agree the terms.
                </p>
              </div>
            </div>

            {application?.status === 'Rejected' && (
              <p className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-xs text-caution">
                A previous application was not taken forward
                {application.rejectionNote ? `: ${application.rejectionNote}` : '.'} You are welcome to apply again.
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {([
                ['organization', 'Organisation', 'College, hospital or company'],
                ['contact', 'Phone', 'So we can call you'],
                ['designation', 'Your role', 'Student, researcher, librarian…'],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="text-xs">
                  <span className="mb-1 block font-semibold text-muted">{label}</span>
                  <input
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={hint}
                    className="w-full rounded-lg border border-rule bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
              ))}
            </div>

            <label className="mt-3 block text-xs">
              <span className="mb-1 block font-semibold text-muted">What do you need it for?</span>
              <textarea
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                rows={3}
                placeholder="A thesis, a course, keeping up with a field…"
                className="w-full rounded-lg border border-rule bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>

            <button
              type="submit"
              disabled={sending}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              <Send size={15} /> {sending ? 'Sending…' : 'Send application'}
            </button>
            <p className="mt-2 text-xs text-faint">
              Nothing is charged here. We will agree everything with you on the call first.
            </p>
          </form>
        )
      )}
    </div>
  );
}
