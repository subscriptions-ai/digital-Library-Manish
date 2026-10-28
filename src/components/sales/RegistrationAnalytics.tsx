import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users, CalendarDays, BadgeCheck, TrendingUp, TrendingDown, Minus, RefreshCw, Info, ArrowRight, CreditCard, ShieldCheck } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { EmptyState, Skeleton, Button, buttonClass } from '../ui';
import { istDay } from '../../lib/registrationWindows';
import { AXIS_TICK, DataNote, FilterChips, StatCard } from './salesUi';
import {
  ApiErrorState, asApiError, DemoBadge, fmtDay, fmtIstTime, fmtNum, getJson, PAID_EXPLAINER, SUB_LABEL, SUB_ORDER,
  type ApiError, type Growth, type Summary,
} from './registrationApi';

type RangeKey = 'today' | '7d' | '30d' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 Days' }, { key: '30d', label: 'Last 30 Days' }, { key: 'custom', label: 'Custom Range' },
];
const RANGE_NAME: Record<RangeKey, string> = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days', custom: 'in the selected range' };

/** A short explanation that opens on hover and on keyboard focus, so it is not a mouse-only title attribute. */
function InfoTip({ label, children, align = 'left' }: { label: string; children: React.ReactNode; align?: 'left' | 'right' }) {
  // `hidden` (display: none) while closed, so a tooltip near the page edge cannot widen the page; the side it opens toward keeps it on screen.
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={label} className="rounded-full text-faint hover:text-ink-2 focus-visible:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Info size={14} aria-hidden="true" />
      </button>
      <span role="tooltip" className={`pointer-events-none absolute top-full z-30 mt-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-rule bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-2 shadow-[var(--shadow-pop)] group-hover:block group-focus-within:block ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {children}
      </span>
    </span>
  );
}

function GrowthLine({ g, prevLabel }: { g: Growth; prevLabel: string }) {
  if (g.kind === 'pct') {
    const up = g.pct > 0, down = g.pct < 0;
    const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
    return (
      <p className={`flex flex-wrap items-center gap-x-1.5 text-sm font-semibold ${up ? 'text-success' : down ? 'text-alarm' : 'text-muted'}`}>
        <Icon size={16} aria-hidden="true" />
        <span>{up ? '+' : ''}{g.pct}%</span>
        <span className="font-normal text-muted">vs {prevLabel} ({g.delta > 0 ? '+' : ''}{g.delta})</span>
      </p>
    );
  }
  // A percentage over zero would read as infinite; say what happened instead.
  if (g.kind === 'new') {
    return <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-success"><TrendingUp size={16} aria-hidden="true" />+{g.delta}<span className="font-normal text-muted">— none in {prevLabel}, so no percentage</span></p>;
  }
  return <p className="flex items-center gap-1.5 text-sm text-muted"><Minus size={16} aria-hidden="true" />No registrations in either period</p>;
}

/** Exact value on hover or focus: the day, and the count itself. */
const DayTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="font-semibold text-ink">{fmtDay(p.day, true)}</p>
      <p className="mt-0.5 text-ink-2"><b className="tabular-nums text-ink">{p.count}</b> {p.count === 1 ? 'registration' : 'registrations'}</p>
    </div>
  );
};

/**
 * `dashboard`: the sales dashboard's section (registrations, verification, subscriptions, conversion).
 * `platform`: the Registered Users page's "Platform Overview — All Members": the four fixed-window counts, the filtered daily chart with its
 * comparison, and a compact engagement summary with the reconciliation against the Admin Users screen. Both read the one summary endpoint.
 */
export function RegistrationAnalytics({ variant = 'dashboard' }: { variant?: 'dashboard' | 'platform' }) {
  const platform = variant === 'platform';
  const [range, setRange] = useState<RangeKey>('30d');
  const today = istDay(new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (key: RangeKey, custom: { from: string; to: string } | null, refresh = false) => {
    const id = ++seq.current;
    setBusy(true); setError(null);
    try {
      const qs = new URLSearchParams({ range: key });
      if (key === 'custom' && custom) { qs.set('from', custom.from); qs.set('to', custom.to); }
      if (refresh) qs.set('refresh', '1');
      const d = await getJson<Summary>(`/api/sales/registrations/summary?${qs}`);
      if (id !== seq.current) return;           // a newer request has gone out; this answer is stale
      setData(d); setRangeError(null);
    } catch (e) {
      if (id !== seq.current) return;
      const err = asApiError(e);
      // A bad custom range is the user's to fix and keeps the figures on screen; anything else is a failed load.
      if (err.kind === 'invalid') setRangeError(err.message || 'That range cannot be used.');
      else setError(err);
    } finally {
      if (id === seq.current) { setLoading(false); setBusy(false); }
    }
  }, []);

  useEffect(() => { if (range !== 'custom') load(range, null); }, [range, load]);

  const applyCustom = () => {
    if (!from || !to) { setRangeError('Choose both a start and an end date.'); return; }
    if (from > to) { setRangeError('The start date must be on or before the end date.'); return; }
    setApplied({ from, to });
    load('custom', { from, to });
  };

  const heading = (demo?: boolean) => (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="reg-h" className="text-xs font-semibold uppercase tracking-wider text-muted">{platform ? 'Platform Overview — All Members' : 'User registrations'}</h2>
          <span className="badge badge-neutral">All members</span>
          {demo && <DemoBadge />}
        </div>
        <p className="mt-1 text-sm text-muted">{platform ? 'Every registered member on the platform, not only the ones assigned to you. Counts only; dates are in IST.' : 'Every registered customer account, not only your leads. Dates are in IST.'}</p>
      </div>
      {data && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted" aria-live="polite">Last updated <time dateTime={data.generatedAt}>{fmtIstTime(data.generatedAt)}</time></p>
          <Button variant="outline" size="sm" onClick={() => load(range, applied, true)} disabled={busy} aria-label="Refresh registration figures">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
          </Button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <section aria-label="User registrations" className="space-y-4" role="status">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[124px] rounded-xl" />)}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-[96px] rounded-xl" />)}</div>
        <Skeleton className="h-[360px] rounded-xl" />
      </section>
    );
  }
  if (error && !data) {
    return (
      <section aria-labelledby="reg-h" className="space-y-3">
        {heading()}
        <div className="card"><ApiErrorState error={error} subject="Registration figures" onRetry={() => load(range, applied)} /></div>
      </section>
    );
  }
  if (!data) return null;

  const { cards, selected, series, subscriptions: subs, conversion } = data;
  const prevLabel = `${fmtDay(data.previous.fromDay)}${data.previous.fromDay === data.previous.toDay ? '' : ` – ${fmtDay(data.previous.toDay)}`}`;
  const selLabel = data.range.fromDay === data.range.toDay ? fmtDay(data.range.fromDay, true) : `${fmtDay(data.range.fromDay)} – ${fmtDay(data.range.toDay, true)}`;
  const rangeKey = (data.range.key as RangeKey) || range;
  const pctOf = (n: number, whole: number) => (whole > 0 ? Math.round((n / whole) * 100) : 0);
  const peak = Math.max(1, ...series.map(s => s.count));
  // Thin the x-axis labels so a year of days stays legible, and more so on a phone.
  const tickEvery = Math.max(0, Math.ceil(series.length / (typeof window !== 'undefined' && window.innerWidth < 640 ? 4 : 8)) - 1);
  const verification = [
    { name: 'Verified', value: cards.verified, color: 'var(--success)' },
    { name: 'Not verified', value: cards.unverified, color: 'var(--faint)' },
  ];

  return (
    <section aria-labelledby="reg-h" className="space-y-4">
      {heading(data.demo)}

      {cards.total === 0 ? (
        <div className="card"><EmptyState icon={Users} title="No registered members yet" description="Registrations appear here as soon as members sign up." /></div>
      ) : (
        <>
          {/* Fixed windows: these four do not follow the filter below. */}
          {platform ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total Registered Users" value={fmtNum(cards.total)} icon={Users} context="All members · all time" />
              <StatCard label="Registered Today" value={fmtNum(cards.today)} icon={UserPlus} context="All members · since 12:00 AM IST" />
              <StatCard label="Registered Last 7 Days" value={fmtNum(cards.last7)} icon={CalendarDays} context="All members · 7 days incl. today" />
              <StatCard label="Registered Last 30 Days" value={fmtNum(cards.last30)} icon={CalendarDays} context="All members · 30 days incl. today" />
            </div>
          ) : (<>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Registered Users" value={fmtNum(cards.total)} icon={Users} context="All members · all time" />
            <StatCard label="Registered Today" value={fmtNum(cards.today)} icon={UserPlus} context="All members · since 12:00 AM IST" />
            <StatCard label="Last 30 Days" value={fmtNum(cards.last30)} icon={CalendarDays} context="All members · 30 days incl. today" />
            <StatCard label="Verified Users" value={fmtNum(cards.verified)} icon={BadgeCheck}
              context={`All members · all time · ${pctOf(cards.verified, cards.total)}% of all`} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="metric-label">Last 7 Days</p>
              <p className="metric-value mt-1">{fmtNum(cards.last7)}</p>
              <p className="metric-context mt-1">All members · 7 days incl. today</p>
            </div>
            <Link to="/sales/registered-users" className="card card-pad card-interactive block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <p className="metric-label flex items-center gap-1.5">
                Without Active Subscription
                <InfoTip label="How this is counted">
                  Registered members who hold no running subscription: none ever, trial only, expired or cancelled. Running access of any kind (paid, via an institution, or granted by an administrator) is not counted here.
                </InfoTip>
              </p>
              <p className="metric-value mt-1">{fmtNum(subs.withoutActive)}</p>
              <p className="metric-context mt-1">All members · all time · {pctOf(subs.withoutActive, cards.total)}% of all</p>
            </Link>
            <div className="card card-pad">
              <p className="metric-label">Growth vs previous period</p>
              <div className="mt-2"><GrowthLine g={selected.growth} prevLabel={prevLabel} /></div>
              <p className="metric-context mt-1">All members · selected period ({selLabel})</p>
            </div>
          </div>
          </>)}

          {/* Everything in this card follows the filter. */}
          <div className="card card-pad space-y-5" aria-busy={busy}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="card-title flex flex-wrap items-center gap-2">Daily registrations <span className="badge badge-accent">Selected period</span></h3>
                <p className="mt-1 text-sm text-muted">
                  {selLabel} IST · {data.range.days} {data.range.days === 1 ? 'day' : 'days'} · all members
                </p>
              </div>
              <FilterChips label="Registration period" value={range} onChange={k => setRange(k as RangeKey)} options={RANGES} />
            </div>

            {range === 'custom' && (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="field sm:w-44">
                  <label htmlFor="reg-from" className="field-label">From (IST)</label>
                  <input id="reg-from" type="date" className="input" value={from} max={today} onChange={e => setFrom(e.target.value)} />
                </div>
                <div className="field sm:w-44">
                  <label htmlFor="reg-to" className="field-label">To (IST)</label>
                  <input id="reg-to" type="date" className="input" value={to} max={today} onChange={e => setTo(e.target.value)} />
                </div>
                <Button onClick={applyCustom} disabled={busy}>Apply range</Button>
                {rangeError && <p role="alert" className="text-sm text-alarm sm:pb-2">{rangeError}</p>}
              </div>
            )}
            {range !== 'custom' && rangeError && <p role="alert" className="text-sm text-alarm">{rangeError}</p>}
            {error && (
              <p role="alert" className="rounded-lg border border-rule bg-alarm-soft px-3 py-2 text-sm text-ink-2">
                The figures could not be refreshed — showing the last ones that loaded. <button type="button" className="font-semibold text-accent hover:underline" onClick={() => load(range, applied)}>Retry</button>
              </p>
            )}

            {platform ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="metric-label">Registered {RANGE_NAME[rangeKey]}</p>
                  <p className="metric-value mt-1">{fmtNum(selected.registrations)}</p>
                  <p className="metric-context mt-1">{selLabel}</p>
                </div>
                <div>
                  <p className="metric-label">Previous equivalent period</p>
                  <p className="metric-value mt-1">{fmtNum(selected.previousRegistrations)}</p>
                  <p className="metric-context mt-1">{prevLabel}</p>
                </div>
                <div>
                  <p className="metric-label">Change</p>
                  <div className="mt-2"><GrowthLine g={selected.growth} prevLabel={prevLabel} /></div>
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <p className="metric-label">Registered {RANGE_NAME[rangeKey]}</p>
                <p className="metric-value mt-1">{fmtNum(selected.registrations)}</p>
              </div>
              <div>
                <p className="metric-label">Verified in this period</p>
                <p className="metric-value mt-1">{fmtNum(selected.verified)}</p>
                <p className="metric-context mt-1">{selected.registrations ? `${pctOf(selected.verified, selected.registrations)}% of this period` : 'No registrations'}</p>
              </div>
              <div>
                <p className="metric-label">Previous period</p>
                <p className="metric-value mt-1">{fmtNum(selected.previousRegistrations)}</p>
                <p className="metric-context mt-1">{prevLabel}</p>
              </div>
              <div>
                <p className="metric-label flex items-center gap-1.5">
                  Registration → Paid
                  <InfoTip label="How conversion is calculated" align="right">
                    <b className="font-semibold text-ink">Formula:</b> members who registered in this period and became paid subscribers by the end of it ÷ all members who registered in this period.
                    <br /><b className="font-semibold text-ink">Cutoff:</b> {fmtDay(data.range.toDay, true)}, end of day IST. Only payment-linked subscriptions count, so this is a lower bound.
                  </InfoTip>
                </p>
                {conversion.available === true ? (
                  <>
                    <p className="metric-value mt-1">{conversion.ratePct === null ? '—' : `${conversion.ratePct}%`}</p>
                    <p className="metric-context mt-1">{conversion.cohort ? `${conversion.converted} of ${conversion.cohort} registered in this period` : 'Nobody registered in this period'}</p>
                  </>
                ) : (
                  <>
                    <p className="metric-value mt-1">—</p>
                    <p className="metric-context mt-1">Unavailable: {(conversion as { reason: string }).reason}</p>
                  </>
                )}
              </div>
            </div>
            )}

            <div style={{ height: 260 }} role="img"
              aria-label={`Daily registrations from ${fmtDay(data.range.fromDay, true)} to ${fmtDay(data.range.toDay, true)}: ${selected.registrations} in total${selected.registrations ? `, busiest day ${peak}` : ''}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ left: -12, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--rule)" />
                  <XAxis dataKey="day" tickFormatter={d => fmtDay(d)} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={tickEvery} minTickGap={12} />
                  <YAxis allowDecimals={false} domain={[0, peak < 4 ? 4 : 'auto']} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                  <Tooltip cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }} content={<DayTooltip />} />
                  <Line type="linear" dataKey="count" stroke="var(--accent)" strokeWidth={2.25} isAnimationActive={false}
                    dot={series.length <= 45 ? { r: 3, fill: 'var(--accent)', strokeWidth: 0 } : false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {selected.registrations === 0 && (
              <p className="text-center text-sm text-muted">No registrations in this period. Days with none are shown as zero.</p>
            )}
          </div>

          {platform ? <EngagementSummary data={data} /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Verification: the same eligible members as the cards above, all time — Verified + Not verified = Total Registered Users. */}
            <div className="card card-pad lg:col-span-2">
              <h3 className="card-title flex items-center gap-2"><ShieldCheck size={16} className="text-accent" aria-hidden="true" />Verification</h3>
              <p className="mt-1 text-sm text-muted"><span className="badge badge-neutral mr-2">All members</span>All time</p>
              <div className="mt-3" style={{ height: 96 }} role="img"
                aria-label={`Verified ${cards.verified} of ${cards.total} members, ${pctOf(cards.verified, cards.total)} percent; not verified ${cards.unverified}.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={verification} layout="vertical" margin={{ left: 0, right: 64, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide domain={[0, Math.max(1, cards.total)]} />
                    <YAxis dataKey="name" type="category" width={92} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} formatter={(v: number, _n: string, p: any) => [`${fmtNum(v)} (${pctOf(v, cards.total)}%)`, p.payload.name]} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false}>
                      {verification.map(v => <Cell key={v.name} fill={v.color} />)}
                      <LabelList dataKey="value" position="right" formatter={(v: number) => `${fmtNum(v)} · ${pctOf(v, cards.total)}%`} style={{ fill: 'var(--ink)', fontSize: 12, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted">{fmtNum(cards.verified)} + {fmtNum(cards.unverified)} = {fmtNum(cards.total)} registered members.</p>
            </div>

            {/* Subscriptions: a different question from the lead pipeline, so a different label and scope. */}
            <div className="card card-pad lg:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="card-title flex items-center gap-2"><CreditCard size={16} className="text-accent" aria-hidden="true" />Subscriptions</h3>
                  <p className="mt-1 text-sm text-muted"><span className="badge badge-neutral mr-2">All members</span>Today's state of every registered account</p>
                </div>
                <div className="text-right">
                  <p className="metric-label flex items-center justify-end gap-1.5">
                    Payment-linked Paid Subscribers
                    <InfoTip label="What counts as payment-linked paid" align="right">{PAID_EXPLAINER}</InfoTip>
                  </p>
                  <p className="metric-value">{fmtNum(subs.activePaid)}</p>
                </div>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {SUB_ORDER.map(s => (
                  <li key={s} className="flex items-center gap-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink-2">{SUB_LABEL[s]}</span>
                    <span className="font-semibold tabular-nums text-ink">{fmtNum(subs[s])}</span>
                    <span className="w-10 text-right text-xs tabular-nums text-muted">{pctOf(subs[s], cards.total)}%</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
                <DataNote>"Subscribed Leads" above counts your own leads marked Subscriber — a sales status, not a payment.</DataNote>
                <Link to="/sales/registered-users" className={buttonClass('outline', 'sm')}>View my registered users <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </section>
  );
}


/** One compact pair: two counts of the same registered members that add up to the total, with a bar to show the split. */
function SplitStat({ title, a, b, total, tone }: { title: string; a: { label: string; value: number }; b: { label: string; value: number }; total: number; tone: string }) {
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return (
    <div className="min-w-0">
      <p className="metric-label">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div><p className="text-2xl font-bold leading-none tabular-nums text-ink">{fmtNum(a.value)}</p><p className="mt-1 text-xs text-muted">{a.label} · {pct(a.value)}%</p></div>
        <div><p className="text-2xl font-bold leading-none tabular-nums text-ink">{fmtNum(b.value)}</p><p className="mt-1 text-xs text-muted">{b.label} · {pct(b.value)}%</p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${a.label} ${a.value} of ${total}, ${pct(a.value)} percent; ${b.label} ${b.value}.`}>
        <div className="h-full rounded-full" style={{ width: `${pct(a.value)}%`, background: tone }} />
      </div>
    </div>
  );
}

/**
 * Engagement of the registered members, and how the total is reached from the Admin Users screen. The reconciliation is the answer to "why does
 * Admin → Users say a different number": that screen lists every row of the User table, this page counts customers.
 */
function EngagementSummary({ data }: { data: Summary }) {
  const { cards, engagement: e, reconciliation: r } = data;
  const parts = [
    { label: 'Staff and administrator accounts', value: r.staff },
    { label: 'Demo accounts', value: r.demo },
    { label: 'In the deletion queue or deleted', value: r.removed },
    { label: 'Anonymised accounts', value: r.anonymised },
  ];
  return (
    <div className="card card-pad space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="card-title flex items-center gap-2"><ShieldCheck size={16} className="text-accent" aria-hidden="true" />Engagement</h3>
        <span className="badge badge-neutral">All members</span><span className="badge badge-neutral">All time</span>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SplitStat title="Email verification" a={{ label: 'Verified', value: cards.verified }} b={{ label: 'Unverified', value: cards.unverified }} total={cards.total} tone="var(--success)" />
        <SplitStat title="Reading" a={{ label: 'Have read content', value: e.haveRead }} b={{ label: 'Never opened content', value: e.neverOpened }} total={cards.total} tone="var(--accent)" />
      </div>
      <DataNote>
        "Have read" means the member opened an item in the reader. Signing in, searching or looking at a record page does not count.
      </DataNote>
      <details className="group rounded-lg border border-rule bg-surface-2/50 px-3 py-2 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Info size={14} aria-hidden="true" /> How this compares with the Admin Users page
        </summary>
        <div className="mt-3 space-y-3 text-xs text-ink-2">
          <p>The Admin Users page lists every account in the system, staff included. This page counts registered members only, so the two differ by exactly the accounts below.</p>
          <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
            <li className="flex items-center justify-between gap-3 px-3 py-2"><span>All accounts (Admin Users total)</span><b className="tabular-nums text-ink">{fmtNum(r.allAccounts)}</b></li>
            {parts.map(p => <li key={p.label} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-muted">− {p.label}</span><span className="tabular-nums">{fmtNum(p.value)}</span></li>)}
            <li className="flex items-center justify-between gap-3 bg-accent-soft px-3 py-2"><span className="font-semibold text-ink">= Total Registered Users</span><b className="tabular-nums text-ink">{fmtNum(r.registered)}</b></li>
          </ul>
          <p>
            Admin Users shows {fmtNum(r.allAccountsVerified)} verified and {fmtNum(r.allAccountsHaveRead)} who have read something across all {fmtNum(r.allAccounts)} accounts;
            across the {fmtNum(r.registered)} registered members they are {fmtNum(cards.verified)} and {fmtNum(e.haveRead)}.
            Accounts an institution added are members and are included ({fmtNum(r.institutionMembers)} of them belong to an institution).
          </p>
        </div>
      </details>
    </div>
  );
}
