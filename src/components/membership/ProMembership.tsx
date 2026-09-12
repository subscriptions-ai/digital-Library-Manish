import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Sparkles, Check, Clock, Infinity as InfinityIcon, Send, Receipt, History } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAllowance, countdown, clockTime } from './ReadingClock';

/**
 * Membership: everything about this member's account, in one place.
 *
 * There used to be two pages. "Membership" said what they could read;
 * "My Subscriptions" said what they had bought. For a free member the second
 * was always empty — a blank screen and a button to the public contact form —
 * and for a Pro member the two described the same thing from different sides.
 * They were never two subjects. Subscription is the record; membership is what
 * the record grants, and only one of those is the member's word for it.
 *
 * So it reads in the order a member wonders about it: what can I read now, how
 * long does it last, what came before, and what have I paid.
 */

const date = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const daysLeft = (end: string) =>
  Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 864e5));

export function ProMembership() {
  const { profile } = useAuth();
  // The page is reached from two shells. Invoices only exist under /dashboard,
  // and that shell sends an Institution account straight home — so from the
  // institution side the payment record is stated rather than linked.
  const inInstitution = useLocation().pathname.startsWith('/institution');
  const { allowance, msLeft, msUntil } = useAllowance();
  const [membership, setMembership] = useState<any>(null);
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

  const load = () => fetch('/api/me/membership', { headers: auth })
    .then(r => (r.ok ? r.json() : null))
    .then(setMembership)
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

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
      toast.success('Application sent — we will be in touch');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const pro = membership?.plan === 'Pro';
  const current = membership?.current;
  const lapsed = membership?.lapsed;
  const applications: any[] = membership?.applications || [];
  const waiting = applications.find(a => a.status === 'Pending');
  const rejected = !waiting && applications.find(a => a.status === 'Rejected');
  const previous: any[] = membership?.previous || [];
  const payments = membership?.payments;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Membership</p>
        <h1 className="mt-1 font-serif text-2xl text-ink sm:text-3xl">
          {pro ? 'You read without a limit' : 'Your free membership'}
        </h1>
      </div>

      {/* ── 1. what you can read now ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-rule bg-surface p-5">
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
            {lapsed && (
              <p className="mb-4 rounded-lg bg-caution-soft px-3 py-2 text-[12.5px] text-caution">
                Your {lapsed.planName || 'Pro membership'} ended on <b>{date(lapsed.endDate)}</b>, so you are back
                on the free allowance. Nothing has been taken away — the whole library is still yours to read,
                half an hour at a time.
              </p>
            )}
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
              {Array.from({ length: allowance?.sessionsPerDay ?? 4 }).map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${
                  i < (allowance?.sessionsToday ?? 0) ? 'bg-accent' : 'bg-rule'}`} />
              ))}
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
      </section>

      {/* ── 2. how long it runs ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-rule bg-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">How long it runs</p>
        {current ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              {/* A Pro membership covers no particular department, so the plan's
                  own name is what it is called. Heading it with the department
                  left the first Pro member looking at a card with no title. */}
              <h2 className="text-lg font-semibold text-ink">{current.domainName || current.planName || 'Membership'}</h2>
              <p className="font-mono text-xs text-muted">{daysLeft(current.endDate)} days left</p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rule">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, Math.max(0, Math.round(
                  ((Date.now() - new Date(current.startDate).getTime()) /
                   (new Date(current.endDate).getTime() - new Date(current.startDate).getTime())) * 100)))}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-faint">
              {date(current.startDate)} — {date(current.endDate)}
            </p>
            {daysLeft(current.endDate) <= 30 && (
              <Link to="/contact" className="mt-3 inline-block rounded-lg border border-rule px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2">
                Request renewal
              </Link>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            A free membership does not expire. Your four sessions come back every day at midnight.
          </p>
        )}
      </section>

      {/* ── 3. asking for more ────────────────────────────────────────────── */}
      {!pro && !loading && (
        waiting ? (
          <section className="rounded-2xl border border-accent bg-accent-soft p-5">
            <p className="text-sm font-semibold text-accent">Your application is with us</p>
            <p className="mt-1 text-sm text-muted">
              Sent {date(waiting.createdAt)}. Someone will call you to agree the terms, and your reading
              limit lifts as soon as it is approved.
            </p>
          </section>
        ) : (
          <form onSubmit={apply} className="rounded-2xl border border-rule bg-surface p-5">
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

            {rejected && (
              <p className="mt-3 rounded-lg bg-caution-soft px-3 py-2 text-xs text-caution">
                A previous application was not taken forward
                {rejected.rejectionNote ? `: ${rejected.rejectionNote}` : '.'} You are welcome to apply again.
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

      {/* ── 4. what came before ───────────────────────────────────────────── */}
      {(previous.length > 0 || applications.length > 0) && (
        <section className="rounded-2xl border border-rule bg-surface p-5">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            <History size={12} /> What came before
          </p>
          <ul className="mt-3 divide-y divide-rule">
            {previous.map((s: any) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="text-ink">{s.domainName || s.planName || 'Membership'}</span>
                <span className="font-mono text-xs text-faint">
                  {date(s.startDate)} — {date(s.endDate)} · {s.status}
                </span>
              </li>
            ))}
            {applications.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="text-muted">Applied for {a.planType === 'Pro' ? 'Pro' : a.planType}</span>
                <span className="font-mono text-xs text-faint">{date(a.createdAt)} · {a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 5. billing, only if there has ever been any ───────────────────── */}
      {payments?.count > 0 && (
        inInstitution ? (
          <div className="flex items-center justify-between rounded-2xl border border-rule bg-surface p-5">
            <span className="flex items-center gap-2 text-sm text-ink">
              <Receipt size={16} className="text-muted" />
              {payments.count} payment{payments.count > 1 ? 's' : ''} on record
            </span>
            <span className="font-mono text-xs text-faint">Ask us for a copy</span>
          </div>
        ) : (
          <Link
            to="/dashboard/invoices"
            className="flex items-center justify-between rounded-2xl border border-rule bg-surface p-5 hover:bg-surface-2"
          >
            <span className="flex items-center gap-2 text-sm text-ink">
              <Receipt size={16} className="text-muted" />
              {payments.count} payment{payments.count > 1 ? 's' : ''} on record
            </span>
            <span className="font-mono text-xs text-muted">Invoices &amp; payments →</span>
          </Link>
        )
      )}
    </div>
  );
}
