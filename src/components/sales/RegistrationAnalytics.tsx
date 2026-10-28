import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users, CalendarDays, BadgeCheck, TrendingUp, TrendingDown, Minus, RefreshCw, Info, ArrowRight, UserX, CreditCard } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { EmptyState, ErrorState, Skeleton, Button, buttonClass } from '../ui';
import { istDay } from '../../lib/registrationWindows';
import { AXIS_TICK, DataNote, FilterChips, StatCard } from './salesUi';
import { fmtDay, fmtIstTime, fmtNum, getJson, SUB_LABEL, SUB_ORDER, type Growth, type Summary } from './registrationApi';

type RangeKey = 'today' | '7d' | '30d' | 'custom';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 Days' }, { key: '30d', label: 'Last 30 Days' }, { key: 'custom', label: 'Custom Range' },
];
const RANGE_NAME: Record<RangeKey, string> = { today: 'Today', '7d': 'the last 7 days', '30d': 'the last 30 days', custom: 'the selected range' };

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
      <p className={`flex items-center gap-1.5 text-sm font-semibold ${up ? 'text-success' : down ? 'text-alarm' : 'text-muted'}`}>
        <Icon size={16} aria-hidden="true" />
        <span>{up ? '+' : ''}{g.pct}%</span>
        <span className="font-normal text-muted">vs {prevLabel} ({g.delta > 0 ? '+' : ''}{g.delta})</span>
      </p>
    );
  }
  // A percentage over zero would read as infinite; say what happened instead.
  if (g.kind === 'new') {
    return <p className="flex items-center gap-1.5 text-sm font-semibold text-success"><TrendingUp size={16} aria-hidden="true" />+{g.delta}<span className="font-normal text-muted">— none in {prevLabel}, so no percentage</span></p>;
  }
  return <p className="flex items-center gap-1.5 text-sm text-muted"><Minus size={16} aria-hidden="true" />No registrations in either period</p>;
}

const DayTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="font-semibold text-ink">{fmtDay(p.day, true)}</p>
      <p className="mt-0.5 text-ink-2">{p.count} {p.count === 1 ? 'registration' : 'registrations'}</p>
    </div>
  );
};

export function RegistrationAnalytics() {
  const [range, setRange] = useState<RangeKey>('30d');
  const today = istDay(new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch (e: any) {
      if (id !== seq.current) return;
      // A bad custom range is the user's to fix and keeps the figures on screen; anything else is a failed load.
      if (key === 'custom') setRangeError(e?.message && !/^\d+$/.test(e.message) ? e.message : 'The range could not be loaded.');
      else setError('We could not load the registration figures.');
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

  if (loading) {
    return (
      <section aria-label="User registrations" className="space-y-4" role="status">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[124px] rounded-xl" />)}</div>
        <Skeleton className="h-[320px] rounded-xl" />
      </section>
    );
  }
  if (error && !data) {
    return (
      <section aria-labelledby="reg-h" className="space-y-3">
        <h2 id="reg-h" className="text-xs font-semibold uppercase tracking-wider text-muted">User registrations · All members</h2>
        <div className="card"><ErrorState title="Registration figures could not be loaded" description={error} onRetry={() => load(range, applied)} /></div>
      </section>
    );
  }
  if (!data) return null;

  const { cards, selected, series, subscriptions: subs, conversion } = data;
  const prevLabel = `${fmtDay(data.previous.fromDay)}${data.previous.fromDay === data.previous.toDay ? '' : ` – ${fmtDay(data.previous.toDay)}`}`;
  const selLabel = data.range.fromDay === data.range.toDay ? fmtDay(data.range.fromDay, true) : `${fmtDay(data.range.fromDay)} – ${fmtDay(data.range.toDay, true)}`;
  const rangeKey = (data.range.key as RangeKey) || range;
  const pctOf = (n: number, whole: number) => (whole > 0 ? Math.round((n / whole) * 100) : 0);
  const none = cards.total === 0;
  const peak = Math.max(1, ...series.map(s => s.count));
  // Thin the x-axis labels so a year of days stays legible.
  const tickEvery = Math.max(0, Math.ceil(series.length / (typeof window !== 'undefined' && window.innerWidth < 640 ? 4 : 8)) - 1);

  return (
    <section aria-labelledby="reg-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reg-h" className="text-xs font-semibold uppercase tracking-wider text-muted">User registrations</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="badge badge-neutral mr-2">All members</span>
            Every registered customer account, not only your leads. Dates are in IST.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted" aria-live="polite">Last updated <time dateTime={data.generatedAt}>{fmtIstTime(data.generatedAt)}</time></p>
          <Button variant="outline" size="sm" onClick={() => load(range, applied, true)} disabled={busy} aria-label="Refresh registration figures">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      {none ? (
        <div className="card"><EmptyState icon={Users} title="No registered members yet" description="Registrations appear here as soon as members sign up." /></div>
      ) : (
        <>
          {/* Fixed windows: these four do not follow the filter below. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Registered Users" value={fmtNum(cards.total)} icon={Users} context="All members · all time" />
            <StatCard label="New Registrations Today" value={fmtNum(cards.today)} icon={UserPlus} context="All members · since 12:00 AM IST" />
            <StatCard label="New in Last 30 Days" value={fmtNum(cards.last30)} icon={CalendarDays} context="All members · 30 days incl. today" />
            <StatCard label="Verified Users" value={fmtNum(cards.verified)} icon={BadgeCheck}
              context={`All members · ${pctOf(cards.verified, cards.total)}% of all registered`} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="metric-label">Last 7 Days</p>
              <p className="metric-value mt-1">{fmtNum(cards.last7)}</p>
              <p className="metric-context mt-1">All members · 7 days incl. today</p>
            </div>
            <Link to="/sales/registered-users" className="card card-pad card-interactive block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <p className="metric-label flex items-center gap-1.5">
                Without an Active Subscription
                <InfoTip label="How this is counted">
                  Registered members who hold no running subscription: none ever, trial only, expired or cancelled. Running access of any kind (paid, via an institution, or granted by an administrator) is not counted here.
                </InfoTip>
              </p>
              <p className="metric-value mt-1">{fmtNum(subs.withoutActive)}</p>
              <p className="metric-context mt-1">All members · {pctOf(subs.withoutActive, cards.total)}% of all registered</p>
            </Link>
            <div className="card card-pad">
              <p className="metric-label">Growth vs previous period</p>
              <div className="mt-2"><GrowthLine g={selected.growth} prevLabel={prevLabel} /></div>
              <p className="metric-context mt-1">All members · follows the range below</p>
            </div>
          </div>

          {/* Everything below follows the filter. */}
          <div className="card card-pad space-y-5" aria-busy={busy}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="card-title">Daily registrations</h3>
                <p className="mt-1 text-sm text-muted">{selLabel} · {data.range.days} {data.range.days === 1 ? 'day' : 'days'} · all members</p>
              </div>
              <FilterChips label="Registration period" value={range} onChange={k => setRange(k as RangeKey)} options={RANGES} />
            </div>

            {range === 'custom' && (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="field sm:w-44">
                  <label htmlFor="reg-from" className="field-label">From</label>
                  <input id="reg-from" type="date" className="input" value={from} max={today} onChange={e => setFrom(e.target.value)} />
                </div>
                <div className="field sm:w-44">
                  <label htmlFor="reg-to" className="field-label">To</label>
                  <input id="reg-to" type="date" className="input" value={to} max={today} onChange={e => setTo(e.target.value)} />
                </div>
                <Button onClick={applyCustom} disabled={busy}>Apply range</Button>
                {rangeError && <p role="alert" className="text-sm text-alarm sm:pb-2">{rangeError}</p>}
              </div>
            )}
            {range !== 'custom' && rangeError && <p role="alert" className="text-sm text-alarm">{rangeError}</p>}
            {error && <p role="alert" className="text-sm text-alarm">{error} Showing the last figures that loaded.</p>}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <p className="metric-label">Registrations in {RANGE_NAME[rangeKey]}</p>
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
                    <br /><b className="font-semibold text-ink">Cutoff:</b> {fmtDay(data.range.toDay, true)}, end of day IST. Paid means a subscription bought through a recorded payment; administrator grants and offline payments that were never linked are not counted, so this is a lower bound.
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

            <div style={{ height: 260 }} role="img"
              aria-label={`Daily registrations from ${fmtDay(data.range.fromDay, true)} to ${fmtDay(data.range.toDay, true)}: ${selected.registrations} in total, busiest day ${peak === 1 && selected.registrations === 0 ? 'none' : peak}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--rule)" />
                  <XAxis dataKey="day" tickFormatter={d => fmtDay(d)} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={tickEvery} minTickGap={12} />
                  <YAxis allowDecimals={false} domain={[0, peak < 4 ? 4 : 'auto']} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<DayTooltip />} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {selected.registrations === 0 && (
              <p className="text-center text-sm text-muted">No registrations in this period. Days with none are shown as zero.</p>
            )}
          </div>

          {/* Subscriptions: a different question from the lead pipeline, so a different label and scope. */}
          <div className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="card-title flex items-center gap-2"><CreditCard size={16} className="text-accent" aria-hidden="true" />Subscriptions</h3>
                <p className="mt-1 text-sm text-muted"><span className="badge badge-neutral mr-2">All members</span>Today's state of every registered account</p>
              </div>
              <div className="text-right">
                <p className="metric-label flex items-center justify-end gap-1.5">
                  Active Paid Subscribers
                  <InfoTip label="What counts as paid" align="right">
                    Members holding a running subscription they bought through a recorded Paid payment. Trials, expired and cancelled subscriptions are never counted. Access granted by an administrator, Pro approvals and offline payments that were not linked to the subscription are shown separately, because nothing records that they were paid.
                  </InfoTip>
                </p>
                <p className="metric-value">{fmtNum(subs.activePaid)}</p>
              </div>
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {SUB_ORDER.map(s => (
                <li key={s} className="flex items-center gap-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-2">{SUB_LABEL[s]}</span>
                  <span className="font-semibold tabular-nums text-ink">{fmtNum(subs[s])}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted">{pctOf(subs[s], cards.total)}%</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
              <DataNote>The lead-pipeline "Subscribed Leads" count above is your own leads marked Subscriber. It is a sales status, not a payment, and is not the same number.</DataNote>
              <Link to="/sales/registered-users" className={buttonClass('outline', 'sm')}><UserX size={14} aria-hidden="true" /> View my registered users <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
