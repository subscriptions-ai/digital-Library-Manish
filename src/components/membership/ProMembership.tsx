import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  Sparkles, Check, Clock, Infinity as InfinityIcon, Send, Receipt, History, Minus, Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAllowance, countdown, clockTime } from './ReadingClock';
import { MAX_INSTITUTION_USERS } from '../../lib/institutionPricing';
import { Badge, Button, Field, PageHeader, Skeleton, StatusBadge, buttonClass, friendlyError } from '../ui';

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

/**
 * One column of the comparison. It lives out here rather than inside
 * PlanComparison because a component declared in another's body is a new
 * component on every render, and React remounts it each time.
 */
function PlanCard({ title, tag, active, tone, items }: {
  title: string; tag: string; active: boolean; tone: 'free' | 'pro';
  items: { text: string; yes: boolean }[];
}) {
  return (
    <div className={`rounded-xl border p-5 ${active ? 'border-accent bg-accent-soft' : 'border-rule bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {tone === 'pro' ? <Sparkles size={16} className="text-accent" aria-hidden="true" /> : <Clock size={16} className="text-muted" aria-hidden="true" />}
          <h3 className="text-base font-semibold text-ink">{title}</h3>
        </div>
        {active && <Badge tone="accent">You are here</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">{tag}</p>
      <ul className="mt-4 space-y-2.5">
        {items.map(i => (
          <li key={i.text} className="flex gap-2.5 text-sm leading-snug">
            {i.yes
              ? <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-label="Included" />
              : <Minus size={16} className="mt-0.5 shrink-0 text-faint" aria-label="Limited" />}
            <span className={i.yes ? 'text-ink-2' : 'text-muted'}>{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Free beside Pro.
 *
 * A member on the free plan can read the whole library — the clock is the only
 * limit there is, and on the institution side, who may be added. So the two
 * columns say exactly that and nothing more: no invented feature, nothing about
 * price, and the line a reader actually meets mid-article stated first.
 */
function PlanComparison({ pro, institution, sessionsPerDay }: {
  pro: boolean; institution: boolean; sessionsPerDay: number;
}) {
  const hours = Math.round((sessionsPerDay * 30) / 60);
  type Row = { free: string; proText: string; freeHas: boolean };
  const rows: Row[] = [
    { freeHas: true, free: 'The whole library — every subject, every kind of material', proText: 'The whole library — the same, unchanged' },
    { freeHas: false, free: `Half an hour at a time, ${sessionsPerDay} times a day — ${hours} hours`, proText: 'No session clock — read for as long as the work takes' },
    { freeHas: false, free: 'Two hours between one session and the next', proText: 'Come and go as you please, all day' },
    { freeHas: true, free: 'The clock stops when you sign out; what is left is kept', proText: 'Nothing to keep — there is no clock' },
    ...(institution ? [
      { freeHas: false, free: 'Adding users needs a department subscription', proText: `Up to ${MAX_INSTITUTION_USERS.toLocaleString('en-IN')} users, at no extra charge` },
      { freeHas: false, free: 'Students cannot be added on this plan', proText: 'Students can be added to your account too' },
      { freeHas: false, free: 'Everyone you add reads in half-hour sessions', proText: 'Everyone you add reads without the clock' },
    ] as Row[] : []),
    { freeHas: true, free: 'Never expires, nothing to pay', proText: 'Runs for an agreed term, and can be renewed' },
  ];

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Users size={16} className="text-muted" aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Compare subscriptions</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlanCard title="Free Subscription" tag="What you have now" active={!pro} tone="free"
          items={rows.map(r => ({ text: r.free, yes: r.freeHas }))} />
        <PlanCard title="Premium Subscription" tag="What changes" active={pro} tone="pro"
          items={rows.map(r => ({ text: r.proText, yes: true }))} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Pro takes nothing away and adds no extra shelf: the library is the same on both.
        What it removes is the clock{institution ? ', for you and for everyone you add' : ''}.
      </p>
    </section>
  );
}

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
      toast.error(friendlyError(err, 'Could not send your application'));
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
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Until the membership arrives we do not know which of the two pages
          this is, so it waits rather than greeting a Pro member as free. */}
      {loading ? (
        <div className="space-y-6" role="status" aria-label="Loading">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="card card-pad space-y-3" aria-hidden="true">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : (
      <>
      <PageHeader
        className="mb-0"
        eyebrow="Subscription"
        title={pro ? 'You read without a limit' : 'Your Free Subscription'}
      />

      {/* ── 1. what you can read now ──────────────────────────────────────── */}
      <section className="card card-pad" aria-label="What you can read now">
        {pro ? (
          <div className="flex items-start gap-3">
            <InfinityIcon className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink">Premium Subscription is active</p>
              <p className="mt-1 text-sm text-muted">
                The whole library, for as long as you like. No sessions, no waiting.
              </p>
            </div>
          </div>
        ) : (
          <>
            <StatusBadge status="free-preview" className="mb-3" />
            {lapsed && (
              <p className="mb-4 rounded-lg border border-caution bg-caution-soft px-3 py-2 text-sm text-ink-2">
                Your {lapsed.planName || 'Premium Subscription'} ended on <b>{date(lapsed.endDate)}</b>, so you are back
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
              <p className="font-mono text-xs text-muted">
                {Math.round((allowance?.usedTodayMs ?? 0) / 60_000)} of 120 min today
              </p>
            </div>

            <div
              className="mt-3 flex gap-1"
              role="img"
              aria-label={`${allowance?.sessionsToday ?? 0} of ${allowance?.sessionsPerDay ?? 4} sessions used today`}
            >
              {Array.from({ length: allowance?.sessionsPerDay ?? 4 }).map((_, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${
                  i < (allowance?.sessionsToday ?? 0) ? 'bg-accent' : 'bg-rule'}`} />
              ))}
            </div>

            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                The whole library — every subject, every kind of material.</li>
              <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                Half an hour at a time, four times a day, with two hours between sessions.</li>
              <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                <span><b className="text-ink">The clock stops when you sign out</b> — closing the tab does not stop it,
                  and whatever is left of the session is kept for your next visit.</span></li>
            </ul>
          </>
        )}
      </section>

      {/* ── 2. how long it runs ───────────────────────────────────────────── */}
      <section className="card card-pad" aria-labelledby="membership-term">
        <h2 id="membership-term" className="text-xs font-semibold uppercase tracking-wider text-muted">How long it runs</h2>
        {current ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              {/* A Pro membership covers no particular department, so the plan's
                  own name is what it is called. Heading it with the department
                  left the first Pro member looking at a card with no title. */}
              <h3 className="type-card-title text-ink">{current.domainName || current.planName || 'Subscription'}</h3>
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
            <p className="mt-2 font-mono text-xs text-muted">
              {date(current.startDate)} — {date(current.endDate)}
            </p>
            {daysLeft(current.endDate) <= 30 && (
              <Link to="/contact" className={buttonClass('outline', 'sm', 'mt-3')}>
                Request renewal
              </Link>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            A Free Subscription does not expire. Your four sessions come back every day at midnight.
          </p>
        )}
      </section>

      {/* ── 3. what the two plans actually differ on ──────────────────────── */}
      <PlanComparison pro={pro} institution={inInstitution} sessionsPerDay={allowance?.sessionsPerDay ?? 4} />

      {/* ── 4. asking for more ────────────────────────────────────────────── */}
      {!pro && !loading && (
        waiting ? (
          <section className="rounded-xl border border-accent bg-accent-soft p-5" role="status">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">Your application is with us</p>
              <StatusBadge status="pending" />
            </div>
            <p className="mt-1 text-sm text-ink-2">
              Sent {date(waiting.createdAt)}. Someone will call you to agree the terms, and your reading
              limit lifts as soon as it is approved.
            </p>
          </section>
        ) : (
          <form onSubmit={apply} className="card card-pad">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
              <div>
                <h2 className="type-card-title text-ink">Apply for Pro</h2>
                <p className="mt-1 text-sm text-muted">
                  Pro removes the sessions entirely — read for as long as you like, whenever you like.
                  Tell us a little and we will call to agree the terms.
                </p>
              </div>
            </div>

            {rejected && (
              <p className="mt-4 rounded-lg border border-caution bg-caution-soft px-3 py-2 text-sm text-ink-2">
                A previous application was not taken forward
                {rejected.rejectionNote ? `: ${rejected.rejectionNote}` : '.'} You are welcome to apply again.
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([
                ['organization', 'Organisation', 'College, hospital or company'],
                ['contact', 'Phone', 'So we can call you'],
                ['designation', 'Your role', 'Student, researcher, librarian…'],
              ] as const).map(([key, label, hint]) => (
                <Field key={key} label={label}>
                  <input
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={hint}
                    className="input"
                  />
                </Field>
              ))}
            </div>

            <Field label="What do you need it for?" className="mt-4">
              <textarea
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                rows={3}
                placeholder="A thesis, a course, keeping up with a field…"
                className="input"
              />
            </Field>

            <Button type="submit" loading={sending} className="mt-5 w-full sm:w-auto">
              {!sending && <Send size={16} aria-hidden="true" />} {sending ? 'Sending…' : 'Send application'}
            </Button>
            <p className="mt-2 text-xs text-muted">
              Nothing is charged here. We will agree everything with you on the call first.
            </p>
          </form>
        )
      )}

      {/* ── 4. what came before ───────────────────────────────────────────── */}
      {(previous.length > 0 || applications.length > 0) && (
        <section className="card card-pad" aria-labelledby="membership-history">
          <h2 id="membership-history" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <History size={14} aria-hidden="true" /> What came before
          </h2>
          <ul className="mt-3 divide-y divide-rule">
            {previous.map((s: any) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span className="text-ink">{s.domainName || s.planName || 'Subscription'}</span>
                <span className="font-mono text-xs text-muted">
                  {date(s.startDate)} — {date(s.endDate)} · {s.status}
                </span>
              </li>
            ))}
            {applications.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span className="text-ink-2">Applied for {a.planType === 'Pro' ? 'Pro' : a.planType}</span>
                <span className="font-mono text-xs text-muted">{date(a.createdAt)} · {a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 5. billing, only if there has ever been any ───────────────────── */}
      {payments?.count > 0 && (
        inInstitution ? (
          <div className="card card-pad flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-ink">
              <Receipt size={16} className="text-muted" aria-hidden="true" />
              {payments.count} payment{payments.count > 1 ? 's' : ''} on record
            </span>
            <span className="text-xs text-muted">Ask us for a copy</span>
          </div>
        ) : (
          <Link
            to="/dashboard/invoices"
            className="card card-pad card-interactive flex flex-wrap items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 text-sm text-ink">
              <Receipt size={16} className="text-muted" aria-hidden="true" />
              {payments.count} payment{payments.count > 1 ? 's' : ''} on record
            </span>
            <span className="text-sm font-semibold text-accent">Invoices &amp; payments →</span>
          </Link>
        )
      )}
      </>
      )}
    </div>
  );
}
