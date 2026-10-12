import { BookOpen, FileText, Library, Loader2, Settings2, Zap } from 'lucide-react';
import { Button } from '../../ui';
import { clock, N } from './format';

/**
 * The Source step of the one-off import: every approved source, grouped by what it brings in, with how it is doing
 * right now and the two ways to use it — Quick Import (a bounded batch, straight away) or Configure (the five-step wizard).
 */

export type SourceCard = {
  id: string; label: string; group: 'Journals' | 'Articles' | 'Books'; description: string; badge: 'Recommended' | 'Fallback' | null;
  limit: number; unitLabel: string; confirm: string;
  state: 'healthy' | 'running' | 'cooling' | 'rate_limited' | 'unavailable'; until: string | null; detail: string | null;
  quota: { archivesLeft: number; archivesPerDay: number } | null;
  runningJobId: string | null; canQuickImport: boolean; blockedBy: string | null;
  last: { at: string; checked?: number; added?: number } | null;
};

export type Kind = 'all' | 'Journals' | 'Articles' | 'Books';
const FILTERS: [Kind, string][] = [['all', 'All'], ['Journals', 'Journals'], ['Articles', 'Articles'], ['Books', 'Books']];
const GROUPS: SourceCard['group'][] = ['Journals', 'Articles', 'Books'];
const ICON = { Journals: Library, Articles: FileText, Books: BookOpen };

/** What a card says about the source's state, and in what tone. Words as well as colour, so it never relies on colour alone. */
function health(s: SourceCard): { label: string; tone: string; note: string | null } {
  const at = s.until ? clock(s.until) : null;
  switch (s.state) {
    case 'running': return { label: 'Running', tone: 'badge-accent', note: s.detail };
    case 'rate_limited': return { label: 'Rate limited', tone: 'badge-caution', note: at ? `retry ${at}` : 'retry later' };
    case 'cooling': return { label: 'Cooling down', tone: 'badge-caution', note: at ? `${s.detail ? `${s.detail} · ` : ''}retry ${at}` : s.detail };
    case 'unavailable': return { label: 'Unavailable', tone: 'badge-alarm', note: s.detail };
    default: return { label: 'Healthy', tone: 'badge-success', note: null };
  }
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
                const isSelected = selected === s.id;
                const quickBlocked = !s.canQuickImport;
                return (
                  <li key={s.id} className={`flex flex-col rounded-xl border p-3.5 ${isSelected ? 'border-accent bg-accent-soft' : 'border-rule bg-surface'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[14px] font-semibold text-ink">{s.label}</span>
                      {s.badge && <span className={`badge ${s.badge === 'Recommended' ? 'badge-accent' : 'badge-neutral'}`}>{s.badge}</span>}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{s.description}</p>

                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      <span className={`badge badge-dot ${h.tone}`}>{h.label}</span>
                      {h.note && <span>{h.note}</span>}
                      {s.id === 'ncbi' && s.quota && <span>{N(s.quota.archivesLeft)} of {N(s.quota.archivesPerDay)} daily archives left</span>}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => onQuick(s)} disabled={quickBlocked || starting !== null}
                        loading={starting === s.id} aria-label={`Quick Import ${s.label}`}
                        title={quickBlocked ? (s.blockedBy || h.note || h.label) : `Up to ${N(s.limit)} ${s.unitLabel}`}>
                        {s.state === 'running' && s.runningJobId ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
                        Quick Import
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onConfigure(s)} aria-label={`Configure ${s.label}`} disabled={starting !== null}>
                        <Settings2 size={14} aria-hidden="true" /> Configure
                      </Button>
                    </div>
                    {quickBlocked && (
                      <p className="mt-2 text-[12px] text-muted">
                        Quick Import disabled{s.blockedBy ? ` — ${s.blockedBy}` : h.note ? ` — ${h.label.toLowerCase()}, ${h.note}` : ` — ${h.label.toLowerCase()}`}.
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
