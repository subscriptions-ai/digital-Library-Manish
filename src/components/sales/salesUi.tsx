import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRightLeft, Calendar, Info, MessageSquare, MoreVertical, Phone, Search, Mail,
  type LucideIcon,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Badge, MetricCard, type BadgeTone } from '../ui';

/**
 * The Sales Workspace's shared pieces.
 *
 * Every page here used to carry its own copy of the pipeline colours, its own
 * date format and its own filter markup, and they had drifted: the dashboard's
 * charts were indigo and purple, the leads page's badges were teal and amber,
 * and a note was stamped "12:05 PM - 9/5/2026" on one screen and
 * "9/5/2026, 12:05:41 PM" on another. They live here once.
 */

// ── The pipeline, in one place ──────────────────────────────────────────────

/**
 * A lead's stage as stored. `All` is the default a lead starts with — nobody has
 * triaged it yet — so it is *shown* as "New"; the stored value is untouched.
 */
export const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];
export const stageLabel = (s?: string) => (!s || s === 'All' ? 'New' : s);

/** How each stage reads as a badge. The word always carries the meaning; the tone helps the eye. */
const STAGE_TONE: Record<string, BadgeTone> = {
  All: 'neutral',
  Positive: 'accent',
  'In Progress': 'accent',
  Subscriber: 'success',
  'No Response': 'neutral',
  Negative: 'alarm',
  Repeated: 'caution',
};

/** The same meanings as chart colours — brand tokens only, so charts and badges agree. */
export const STAGE_COLOR: Record<string, string> = {
  Subscriber: 'var(--success)',
  Positive: 'var(--accent)',
  'In Progress': 'color-mix(in srgb, var(--accent) 55%, var(--surface))',
  All: 'var(--ink-2)',
  'No Response': 'var(--faint)',
  Negative: 'var(--alarm)',
  Repeated: 'var(--caution)',
};
/** Chart order: where a lead is going first, where it has stalled last. */
export const STAGE_ORDER = ['Subscriber', 'Positive', 'In Progress', 'All', 'No Response', 'Repeated', 'Negative'];

export function LeadStatusBadge({ status }: { status?: string }) {
  return <Badge tone={STAGE_TONE[status || ''] ?? 'neutral'} dot>{stageLabel(status)}</Badge>;
}

/** Leads in these stages are live; one that has not been touched for a week has gone quiet. */
export const LIVE_STAGES = ['Positive', 'In Progress'];
export const QUIET_AFTER_DAYS = 7;
export const isQuiet = (lead: { status?: string; updatedAt?: string }) =>
  LIVE_STAGES.includes(lead.status || '') && !!lead.updatedAt &&
  Date.now() - new Date(lead.updatedAt).getTime() > QUIET_AFTER_DAYS * 864e5;

// ── One way to write a date ─────────────────────────────────────────────────

/** 05 Sep 2026 · 12:05 PM — the only date-and-time format on these screens. */
export const formatStamp = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy · hh:mm a') : '—');
export const formatDay = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');

export function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 6e4) return 'just now';
  if (ms < 36e5) return `${Math.floor(ms / 6e4)}m ago`;
  if (ms < 864e5) return `${Math.floor(ms / 36e5)}h ago`;
  if (ms < 30 * 864e5) return `${Math.floor(ms / 864e5)}d ago`;
  return formatDay(iso);
}
export const relativeStrict = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** What to call a lead whose state was never recorded. */
export const NO_STATE = 'Not recorded';

export function interactionIcon(type: string): { icon: LucideIcon; tone: string } {
  switch (type) {
    case 'Call': return { icon: Phone, tone: 'bg-success-soft text-success' };
    case 'Email': return { icon: Mail, tone: 'bg-accent-soft text-accent' };
    case 'Meeting': return { icon: Calendar, tone: 'bg-surface-2 text-ink-2' };
    case 'StatusChange': return { icon: ArrowRightLeft, tone: 'bg-surface-2 text-ink-2' };
    default: return { icon: MessageSquare, tone: 'bg-caution-soft text-caution' };
  }
}

// ── Metrics ─────────────────────────────────────────────────────────────────

/**
 * A metric card that goes somewhere when it means something: a link to another
 * screen (`to`) or a shortcut that sets a filter on this one (`onSelect`).
 * Same shape as MetricCard; without either it is just a number.
 */
export function StatCard({ to, onSelect, selected, ...props }: {
  to?: string; onSelect?: () => void; selected?: boolean;
  label: ReactNode; value: ReactNode | null | undefined; context?: ReactNode; icon?: LucideIcon; loading?: boolean;
}) {
  const ring = 'group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  const card = <MetricCard className={`card-interactive h-full ${selected ? 'border-accent' : ''}`} {...props} />;
  if (to) return <Link to={to} className={ring}>{card}</Link>;
  if (onSelect) return <button type="button" onClick={onSelect} aria-pressed={selected} className={ring}>{card}</button>;
  return <MetricCard className="h-full" {...props} />;
}

/** One thing that wants doing. Zero reads as done, not as an empty box. */
export function AttentionTile({ to, label, count, context, icon: Icon }: {
  to: string; label: string; count: number | null; context: string; icon: LucideIcon;
}) {
  const clear = count === 0;
  return (
    <Link to={to}
      className="card card-interactive group flex items-start gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${clear ? 'bg-surface-2 text-faint' : 'bg-caution-soft text-caution'}`} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-bold leading-none tabular-nums text-ink">{count === null ? '—' : count}</span>
          <span className="truncate text-sm font-semibold text-ink">{label}</span>
        </span>
        <span className="mt-1 block text-xs text-muted">{count === 0 ? 'All clear' : context}</span>
      </span>
    </Link>
  );
}

// ── Filters ─────────────────────────────────────────────────────────────────

export function FilterBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end ${className}`}>{children}</div>;
}

export function SearchField({ id, label = 'Search', value, onChange, placeholder }: {
  id: string; label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="field min-w-0 sm:min-w-[16rem] sm:flex-1">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input id={id} type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input pl-9" />
      </div>
    </div>
  );
}

export function SelectField({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="field sm:w-48">
      <label htmlFor={id} className="field-label">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className="input">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** Pills with a count inside. `aria-pressed` carries the selection, not just the fill. */
export function FilterChips({ options, value, onChange, label }: {
  options: { key: string; label: string; count?: number }[]; value: string; onChange: (key: string) => void; label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={on}
            className={`flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 ${
              on ? 'border-accent bg-accent text-accent-on' : 'border-rule bg-surface text-ink-2 hover:bg-surface-2'}`}>
            {o.label}
            {o.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${on ? 'bg-white/20 text-accent-on' : 'bg-surface-2 text-muted'}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A removable note that a filter came from somewhere else, such as a dashboard tile. */
export function ActiveFilter({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-rule bg-accent-soft px-3 py-2 text-sm text-ink-2">
      <Info size={14} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      <button type="button" onClick={onClear} className="shrink-0 text-xs font-semibold text-accent hover:underline">Clear</button>
    </div>
  );
}

/** A line about the data itself — what is missing, and what that does to the figures above. */
export function DataNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
      <Info size={14} className="mt-px shrink-0 text-faint" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ── The row menu ────────────────────────────────────────────────────────────

export type MenuItem = { label: string; icon?: LucideIcon; to?: string; href?: string; onSelect?: () => void; hidden?: boolean };

/**
 * A compact "more" menu. It is positioned against the viewport rather than its
 * row, because a table's scroll container would clip a menu opened on the last
 * row; and it closes on Escape, on an outside click and on any scroll.
 */
export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const shown = items.filter(i => !i.hidden);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  const toggle = () => {
    if (open) return close();
    const r = trigger.current!.getBoundingClientRect();
    const width = 208, height = shown.length * 40 + 12;
    setPos({
      left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8),
      top: r.bottom + height + 8 > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const at = list.indexOf(document.activeElement as HTMLElement);
        list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }
      if (e.key === 'Tab') close();
    };
    const away = () => close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open, close]);

  const itemClass = 'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:outline-none';

  return (
    <div onClick={e => e.stopPropagation()}>
      <button ref={trigger} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open}
        aria-label={label} data-tip="More actions" className="tip btn btn-ghost btn-sm btn-icon">
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={label} style={{ position: 'fixed', top: pos.top, left: pos.left, width: 208 }}
          className="z-[120] overflow-hidden rounded-xl border border-rule bg-surface py-1.5 shadow-[var(--shadow-pop)]">
          {shown.map(it => {
            const inner = <>{it.icon && <it.icon size={15} className="shrink-0 text-faint" aria-hidden="true" />}{it.label}</>;
            if (it.href) return <a key={it.label} role="menuitem" href={it.href} onClick={() => close()} className={itemClass}>{inner}</a>;
            return (
              <button key={it.label} role="menuitem" type="button" className={itemClass}
                onClick={() => { close(); if (it.to) navigate(it.to); it.onSelect?.(); }}>
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────────

/** One tooltip for every chart in the workspace. */
export function ChartTooltip({ active, payload, label, unit = 'leads' }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="font-semibold text-ink">{label ?? row.name}</p>
      <p className="mt-0.5 text-muted"><span className="font-semibold tabular-nums text-ink">{row.value}</span> {unit}</p>
    </div>
  );
}

/** The axis text every chart shares. */
export const AXIS_TICK = { fill: 'var(--muted)', fontSize: 12 } as const;
