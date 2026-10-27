import { useEffect, useState } from 'react';
import { Route } from 'lucide-react';
import { Badge } from '../../ui';
import { api } from '../ingestion/api';
import { N, exactTime } from '../ingestion/format';

/**
 * Future-ingestion routing: what happens to a Book the harvest has just written. A High-confidence Book is given its suggested department and stays a Draft;
 * Medium, Low and Unclassifiable Books wait in the review queue as before. Nothing is published and nothing historical is touched. Read-only here: the switch
 * is a deployment setting of its own (not the historical assignment gate), and the numbers are the server's own counts.
 */

type Tally = { classified: number; routedHigh: number; mediumQueued: number; lowQueued: number; unclassifiableQueued: number; skipped: number; races: number; failed: number; skippedReasons: Record<string, number> };

const ROWS: [keyof Tally, string][] = [
  ['classified', 'Classified'], ['routedHigh', 'Routed to a department (High)'], ['mediumQueued', 'Medium, in the review queue'], ['lowQueued', 'Low, in the review queue'],
  ['unclassifiableQueued', 'Unclassifiable, in the review queue'], ['skipped', 'Skipped (protected or changed)'], ['races', 'Assignment races (the other change stood)'],
];

export function IngestRouting() {
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let alive = true; api('/api/admin/review/routing').then(r => { if (!alive) return; if (r.ok) setData(r.data); else setFailed(true); }); return () => { alive = false; }; }, []);

  const c = data?.config, s = data?.stats;
  const th = c?.thresholds;
  return (
    <section className="card card-pad" aria-label="Future ingestion routing">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Route size={15} aria-hidden="true" /> Future ingestion routing <Badge tone={c?.ready ? 'success' : 'neutral'}>{c ? (c.ready ? 'On' : c.enabled ? 'Not ready' : 'Off') : '…'}</Badge></h3>
      <p className="mt-0.5 max-w-2xl text-[12.5px] text-ink-2">New books that the next imports write as Drafts are classified once. A High-confidence book gets its suggested department and stays a Draft for review; Medium, Low and Unclassifiable books go to the review queue unchanged. It never publishes, never changes licence, access or rights, and never touches books already in the library.</p>
      {failed && <p role="alert" className="mt-2 text-[12.5px] text-alarm">Could not load future ingestion routing.</p>}
      {c && !c.ready && <p role="status" className="mt-3 rounded-lg border border-rule bg-surface-2 p-2.5 text-[12.5px] text-ink-2">{c.message} New books keep going to the review queue exactly as before.</p>}
      {c?.ready && <p className="mt-2 text-[11.5px] text-muted">Classifier {c.classifier}{th ? ` · High — score ≥ ${th.highMinScore}, margin ≥ ${th.highMinMargin}${th.highRequiresCode ? ', controlled code + title/subject' : ''}` : ''}</p>}

      {c && !s && <p className="mt-3 text-[12.5px] text-muted">No new books have been routed yet.</p>}
      {s && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Newly ingested books</th><th className="text-right font-medium">Today</th><th className="text-right font-medium">7 days</th><th className="text-right font-medium">All time</th></tr></thead>
              <tbody>
                {ROWS.map(([k, label]) => (
                  <tr key={k} className="border-t border-rule/60"><td className="py-1 text-ink-2">{label}</td>
                    <td className="text-right tabular-nums text-ink">{N(s.today[k])}</td><td className="text-right tabular-nums text-ink">{N(s.last7[k])}</td><td className="text-right tabular-nums text-ink">{N(s.totals[k])}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(s.byProvider || {}).length > 0 && (
            <p className="mt-2 text-[11.5px] text-muted">By provider (routed / classified): {Object.entries(s.byProvider as Record<string, Tally>).map(([p, t]) => `${p} ${N(t.routedHigh)} / ${N(t.classified)}`).join(' · ')}</p>
          )}
          <p className="mt-1 text-[11.5px] text-muted">Counting since {s.since ? exactTime(s.since) : 'the start'}{s.lastRunAt ? ` · last routed ${exactTime(s.lastRunAt)}` : ''}</p>
        </>
      )}
    </section>
  );
}
