import { BookOpen, FileText, Library, Loader2, Settings2, Zap } from 'lucide-react';
import { Button } from '../../ui';
import { ago, clock, N } from './format';

/**
 * The Source step of the one-off import: every approved source, grouped by what it brings in, with how it is doing
 * right now and the two ways to use it — Quick Import (a bounded batch, straight away) or Configure (the five-step wizard).
 */

type Batch = { at: string; checked: number; added: number; held: number; enriched: number; sentToReview: number; skipped?: number; recordFailures?: number; requestFailures?: number; outcome: string };
export type Availability = { kind: 'available' | 'probe' | 'running' | 'quota' | 'exhausted' | 'cooling' | 'rate_limited' | 'unavailable' | 'not_connected'; label: string; until: string | null; detail: string | null };

export type SourceCard = {
  id: string; label: string; group: 'Journals' | 'Articles' | 'Books'; description: string; badge: 'Recommended' | 'Fallback' | null;
  limit: number; unitLabel: string; confirm: string;
  role?: string | null; tier?: string | null;
  state: 'healthy' | 'degraded' | 'running' | 'cooling' | 'rate_limited' | 'unavailable' | 'not_connected'; until: string | null; detail: string | null;
  /** How the source is doing, from its failures alone. A quota, an exhausted rest or a Quick Import on it never change this. */
  healthState?: 'healthy' | 'degraded' | 'rate_limited' | 'cooling' | 'unavailable' | 'not_connected';
  /** Whether it can be asked right now, and when it can be again. */
  availability?: Availability;
  health?: { state: string; failures: number; threshold: number; until: string | null; lastError: string | null; reason?: string | null; lastErrorKind?: string | null; lifetimeFailures?: number };
  yield?: 'productive' | 'low' | 'exhausted' | null;
  lastBatch?: Batch | null;
  /** The last batch that gave something, kept after later empty ones. */
  lastProductiveBatch?: Batch | null;
  /** When it was set aside as exhausted, and when it is due to be tried again. */
  exhaustedAt?: string | null; refreshAfter?: string | null;
  quota: { archivesLeft: number; archivesPerDay: number } | null;
  runningJobId: string | null; canQuickImport: boolean; blockedBy: string | null;
  last: { at: string; checked?: number; added?: number } | null;
};

export type Kind = 'all' | 'Journals' | 'Articles' | 'Books';
const FILTERS: [Kind, string][] = [['all', 'All'], ['Journals', 'Journals'], ['Articles', 'Articles'], ['Books', 'Books']];
const GROUPS: SourceCard['group'][] = ['Journals', 'Articles', 'Books'];
const ICON = { Journals: Library, Articles: FileText, Books: BookOpen };
/** These journal sources have a Quick Import but no step-by-step preview yet; the button says so rather than opening something that cannot work. */
const NO_WIZARD = new Set(['road', 'crossrefjournals', 'openalexsources']);

/** The health badge: how the source is doing, from its failures. Words as well as colour, so it never relies on colour alone. */
function health(s: SourceCard): { label: string; tone: string } {
  switch (s.healthState ?? (s.state === 'running' ? 'healthy' : s.state)) {
    case 'rate_limited': return { label: 'Rate limited', tone: 'badge-caution' };
    case 'cooling': return { label: 'Cooling down', tone: 'badge-caution' };
    case 'unavailable': return { label: 'Unavailable', tone: 'badge-alarm' };
    case 'degraded': return { label: 'Degraded', tone: 'badge-caution' };
    case 'not_connected': return { label: 'Not connected', tone: 'badge-neutral' };
    default: return { label: 'Healthy', tone: 'badge-success' };
  }
}

/** Availability is a separate question from health: a healthy source can be over its daily quota, or resting because it has nothing new. */
function availabilityLine(s: SourceCard): { text: string; tone: string } | null {
  const a = s.availability;
  // A failing source is already described by its Health line (reason and retry time); this line is for the other reasons it cannot be asked.
  if (!a || a.kind === 'available' || a.kind === 'cooling' || a.kind === 'rate_limited' || a.kind === 'unavailable') return null;
  const at = a.until ? clock(a.until) : null;
  const text = a.kind === 'probe' ? 'Test request due — one request will check whether it has recovered'
    : a.kind === 'running' ? `Running now${a.detail ? ` — ${a.detail}` : ''}`
    : a.kind === 'not_connected' ? `Not connected${a.detail ? ` — ${a.detail}` : ''}`
    : `${a.label}${at ? ` · ${a.kind === 'exhausted' ? 'tried again after' : 'retry'} ${at}` : ''}`;
  return { text, tone: a.kind === 'quota' || a.kind === 'exhausted' || a.kind === 'running' ? 'text-muted' : 'text-ink-2' };
}

/** Checked, added, held, review, skipped — and provider request failures on their own, never folded into the record figures. */
function batchLine(b: Batch) {
  return `Checked ${N(b.checked)} · Added ${N(b.added)} · Held ${N(b.held)} · Review ${N(b.sentToReview)} · Skipped ${N(b.skipped ?? 0)} · Provider request failures ${N(b.requestFailures ?? 0)}`;
}

export function SourceCards({ sources, failed, onRetry, filter, onFilter, selected, onQuick, onConfigure, starting }: {
  sources: SourceCard[] | null; failed: boolean; onRetry: () => void; filter: Kind; onFilter: (k: Kind) => void; selected: string | null;
  onQuick: (s: SourceCard) => void; onConfigure: (s: SourceCard) => void; starting: string | null;
}) {
  return (
    <div>
      <div className="segmented" role="group" aria-label="Show sources for">
        {FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => onFilter(id)}>{label}</button>)}
      </div>

      {!sources && failed && (
        <div role="alert" className="mt-4 rounded-xl border border-rule bg-alarm-soft p-4">
          <p className="text-[13px] font-semibold text-ink">The sources could not be loaded.</p>
          <p className="mt-1 text-[12.5px] text-ink-2">The server did not return the source list. If the server was started before this update, restart it and try again. Nothing has been imported.</p>
          <div className="mt-3"><Button variant="outline" size="sm" onClick={onRetry}>Try again</Button></div>
        </div>
      )}
      {!sources && !failed && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{[0, 1, 2].map(i => <span key={i} className="skeleton block h-36 w-full" />)}</div>}

      {sources && GROUPS.filter(g => filter === 'all' || filter === g).map(g => {
        const list = sources.filter(s => s.group === g);
        if (!list.length) return null;
        const Icon = ICON[g];
        return (
          <section key={g} className="mt-5" aria-labelledby={`src-${g}`}>
            <h3 id={`src-${g}`} className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
              <Icon size={14} aria-hidden="true" /> {g}
            </h3>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(s => {
                const h = health(s);
                const avail = availabilityLine(s);
                const isSelected = selected === s.id;
                const quickBlocked = !s.canQuickImport;
                return (
                  <li key={s.id} className={`flex flex-col rounded-xl border p-3.5 ${isSelected ? 'border-accent bg-accent-soft' : 'border-rule bg-surface'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[14px] font-semibold text-ink">{s.label}</span>
                      {s.badge && <span className={`badge ${s.badge === 'Recommended' ? 'badge-accent' : 'badge-neutral'}`}>{s.badge}</span>}
                    </div>
                    {s.role && <p className="mt-0.5 text-[11.5px] font-medium uppercase tracking-wide text-muted">{s.role}</p>}
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{s.description}</p>

                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      <span className="font-medium text-ink-2">Health</span>
                      <span className={`badge badge-dot ${h.tone}`}>{h.label}</span>
                      {s.healthState && s.healthState !== 'healthy' && s.healthState !== 'not_connected' && s.health?.reason && <span>Reason: {s.health.reason}</span>}
                      {s.healthState && s.healthState !== 'healthy' && s.healthState !== 'not_connected' && s.health?.until && <span>Retry: {clock(s.health.until)}</span>}
                    </p>
                    {avail && (
                      <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] ${avail.tone}`}>
                        <span className="font-medium text-ink-2">Availability</span>
                        <span>{avail.text}</span>
                        {s.id === 'ncbi' && s.quota && <span>{N(s.quota.archivesLeft)} of {N(s.quota.archivesPerDay)} daily archives left</span>}
                      </p>
                    )}
                    {!avail && s.id === 'ncbi' && s.quota && <p className="mt-1 text-[12px] text-muted"><span className="font-medium text-ink-2">Availability</span> {N(s.quota.archivesLeft)} of {N(s.quota.archivesPerDay)} daily archives left</p>}
                    {/* Health and yield are different things: a source can be perfectly healthy and give nothing new. */}
                    {(s.yield || (s.health && (s.health.failures > 0 || (s.health.lifetimeFailures ?? 0) > 0))) && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                        {s.yield && !(s.yield === 'exhausted' && s.availability?.kind === 'exhausted') && <span className={`badge ${s.yield === 'productive' ? 'badge-success' : 'badge-neutral'}`}>{s.yield === 'productive' ? 'Productive' : s.yield === 'low' ? 'Low yield' : 'Exhausted for now'}</span>}
                        {s.health && s.health.failures > 0 && <span>{s.health.failures} consecutive failure{s.health.failures === 1 ? '' : 's'}</span>}
                        {s.health && (s.health.lifetimeFailures ?? 0) > 0 && <span title="Every failed request this source has ever had; it is never reset">{N(s.health.lifetimeFailures)} lifetime request failure{s.health.lifetimeFailures === 1 ? '' : 's'}</span>}
                      </p>
                    )}
                    {s.lastBatch && <p className="mt-1.5 text-[12px] text-muted">Last batch: {batchLine(s.lastBatch)}</p>}
                    {s.lastProductiveBatch && s.lastBatch && s.lastProductiveBatch.at !== s.lastBatch.at && (
                      <p className="mt-0.5 text-[12px] text-muted">Last productive batch ({ago(s.lastProductiveBatch.at)}): {N(s.lastProductiveBatch.added)} added / {N(s.lastProductiveBatch.checked)} checked</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => onQuick(s)} disabled={quickBlocked || starting !== null}
                        loading={starting === s.id} aria-label={`Quick Import ${s.label}`}
                        title={quickBlocked ? (s.blockedBy || avail?.text || h.label) : `Up to ${N(s.limit)} ${s.unitLabel}`}>
                        {s.state === 'running' && s.runningJobId ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
                        Quick Import
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onConfigure(s)} aria-label={`Configure ${s.label}`} disabled={starting !== null || NO_WIZARD.has(s.id)}
                        title={NO_WIZARD.has(s.id) ? 'The step-by-step import is not available for this source yet. Quick Import runs the same review-first batch.' : undefined}>
                        <Settings2 size={14} aria-hidden="true" /> Configure
                      </Button>
                    </div>
                    {quickBlocked && (
                      <p className="mt-2 text-[12px] text-muted">
                        Quick Import disabled — {s.blockedBy ? s.blockedBy : avail ? avail.text : `${h.label.toLowerCase()}${s.health?.until ? ` · retry ${clock(s.health.until)}` : ''}`}.{['rate_limited', 'cooling', 'unavailable'].includes(s.availability?.kind || s.state) ? ' Healthy sources carry on in the engine.' : ''}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
