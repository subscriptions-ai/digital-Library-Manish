import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, GitBranch } from 'lucide-react';
import { Badge, type BadgeTone } from '../../ui';
import { api } from './api';
import { N, ago } from './format';
import { InfoTip } from './InfoTip';

/**
 * Three read-only panels about throughput: where the pipeline stands, what is waiting for a person (with a way straight to it), and how efficiently each
 * provider turns what it looks at into catalogue growth. Every number comes from the server's own counts of the catalogue or the run log; where something is
 * not tracked it is said so rather than shown as zero.
 */

function usePolled<T = any>(path: string, refreshKey: unknown, every = 30_000) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => { const r = await api<T>(path); if (!alive) return; if (r.ok) { setData(r.data); setFailed(false); } else setFailed(true); };
    load(); const t = setInterval(load, every);
    return () => { alive = false; clearInterval(t); };
  }, [path, refreshKey, every]);
  return { data, failed };
}

const STAGE_TONE: Record<string, BadgeTone> = { running: 'success', waiting: 'caution', idle: 'neutral', inline: 'neutral' };
const STAGE_WORD: Record<string, string> = { running: 'Running', waiting: 'Queued', idle: 'Clear', inline: 'In each turn' };

export function PipelineStrip({ refreshKey }: { refreshKey: unknown }) {
  const { data, failed } = usePolled<any>('/api/admin/ingest/pipeline', refreshKey);
  return (
    <section className="card card-pad" aria-labelledby="pipeline-heading">
      <h2 id="pipeline-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><GitBranch size={13} aria-hidden="true" /> Pipeline</h2>
      {!data ? (
        failed ? <p role="status" className="mt-3 text-[12.5px] text-muted">The pipeline could not be read just now, so nothing is shown rather than a zero.</p> : <span aria-hidden="true" className="skeleton mt-3 block h-24 w-full" />
      ) : (
        <ol className="mt-3 divide-y divide-rule/60 text-[13px]">
          {data.stages.map((s: any) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium text-ink">{s.label}</span>
                {s.detail && <span className="block truncate text-[11.5px] text-muted">{s.detail}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {s.count != null && s.state !== 'inline' && <b className="tabular-nums text-ink">{N(s.count)}</b>}
                <Badge tone={STAGE_TONE[s.state] || 'neutral'}>{STAGE_WORD[s.state] || s.state}</Badge>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11.5px] text-muted">Counts are the real size of each backlog. “Ready to publish” is not shown: an approval publishes at once, so there is no such queue to count.</p>
    </section>
  );
}

const reviewHref = (type: string, source?: string | null) => {
  const tab = type === 'Books' ? 'ingested' : 'articles';
  return `/admin/review?tab=${tab}${source ? `&source=${encodeURIComponent(source)}` : ''}`;
};

export function ReviewQueueCard({ refreshKey }: { refreshKey: unknown }) {
  const { data, failed } = usePolled<any>('/api/admin/ingest/review-queue', refreshKey);
  const lead = data ? [...data.byContentType].filter((c: any) => c.reviewable && c.awaiting > 0).sort((a: any, b: any) => b.awaiting - a.awaiting)[0] : null;
  // The department-classification analysis, if one has been run. Nothing is shown for it until then: no estimate stands in for a measurement.
  const cls = usePolled<any>('/api/admin/review/classification/summary?brief=1', refreshKey, 60_000).data?.summary ?? null;
  return (
    <section className="card card-pad" aria-labelledby="review-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><ClipboardCheck size={13} aria-hidden="true" /> Awaiting review</h2>
        {lead && <Link to={reviewHref(lead.type)} className="btn btn-primary btn-sm">Review now</Link>}
      </div>
      {!data ? (
        failed ? <p role="status" className="mt-3 text-[12.5px] text-muted">The review queue could not be read just now.</p> : <span aria-hidden="true" className="skeleton mt-3 block h-24 w-full" />
      ) : data.awaiting === 0 ? (
        <p className="mt-3 text-[13px] text-ink-2">Nothing the engine has found is waiting for a person.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-4">
            <div><dt className="text-[11px] text-muted">Waiting</dt><dd className="text-xl font-semibold tabular-nums text-ink">{N(data.awaiting)}</dd></div>
            <div><dt className="text-[11px] text-muted">New today</dt><dd className="text-xl font-semibold tabular-nums text-ink">{N(data.newToday)}</dd></div>
            <div><dt className="text-[11px] text-muted">Oldest waiting</dt><dd className="text-xl font-semibold tabular-nums text-ink">{data.oldestDays != null ? (data.oldestDays < 1 ? 'today' : `${N(data.oldestDays)} d`) : '—'}</dd></div>
          </dl>
          <ul className="mt-3 divide-y divide-rule/60 text-[12.5px]">
            {data.byContentType.filter((c: any) => c.awaiting > 0).map((c: any) => (
              <li key={c.type} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5">
                <span><b className="text-ink">{c.type}</b> <span className="text-muted">· {N(c.awaiting)} waiting · {N(c.newToday)} new today{c.oldestAt ? ` · oldest ${ago(c.oldestAt)}` : ''}</span></span>
                {c.reviewable
                  ? <span className="flex gap-3"><Link to={reviewHref(c.type)} className="font-semibold text-accent hover:underline">Review {c.type.toLowerCase()}</Link>{c.type === 'Books' && <Link to="/admin/review?tab=auto" className="font-semibold text-accent hover:underline">Auto classify</Link>}</span>
                  : <span className="text-muted">no review screen yet</span>}
              </li>
            ))}
          </ul>
          {cls && (
            <div className="mt-2 rounded-lg border border-rule p-2.5 text-[12.5px]" aria-label="Department classification of the books waiting">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <b className="text-ink">Department classification</b>
                <span className="text-muted">{N(cls.analysed)} books analysed {ago(cls.finishedAt)} · classifier {cls.classifier ?? 'v1'} · analysis only</span>
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
                {([['High confidence', 'high'], ['Medium confidence', 'medium'], ['Low confidence', 'low'], ['Unclassifiable', 'unclassifiable']] as const).map(([label, k]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-semibold tabular-nums text-ink">{N(cls.tiers[k])}</dd></div>
                ))}
              </dl>
              <p className="mt-1 text-muted">High-confidence assignments available: <b className="text-ink">{N(cls.tiers.high)}</b> <span>(under the provisional rule; none has been applied, and this analysis assigns and publishes nothing).</span></p>
            </div>
          )}
          <details className="mt-2 group">
            <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">By provider</summary>
            <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-2">
              {data.byProvider.map((p: any) => (
                <li key={`${p.type}-${p.source}`} className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-0.5">
                  <span className="min-w-0 truncate"><span className="text-muted">{p.type} · </span>{p.source || 'all sources'}</span>
                  <span className="shrink-0 tabular-nums">
                    <b className="text-ink">{N(p.awaiting)}</b>
                    {p.source && p.type !== 'Journals' ? <> · <Link to={reviewHref(p.type, p.source)} className="font-semibold text-accent hover:underline">Review</Link></> : null}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <p className="mt-2 text-[11.5px] text-muted">Counted from the catalogue. Nothing here is published until a person approves it; uncertain rights are never approved automatically.</p>
        </>
      )}
    </section>
  );
}

const QUALITY: Record<string, { label: string; tone: BadgeTone }> = {
  highly_productive: { label: 'Highly productive', tone: 'success' },
  productive: { label: 'Productive', tone: 'success' },
  low_yield: { label: 'Low yield', tone: 'caution' },
  caught_up: { label: 'Caught up', tone: 'neutral' },
  unavailable: { label: 'Unavailable', tone: 'alarm' },
};
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

export function ProviderYield({ state, refreshKey }: { state: any; refreshKey: unknown }) {
  const { data, failed } = usePolled<any>('/api/admin/ingest/provider-yield?hours=24', refreshKey, 60_000);
  const rot: any[] = state?.status?.rotation?.providers || [];
  const standing = (source: string) => rot.find(p => p.label === source)?.quality ?? null;
  const t = data?.total;
  return (
    <section className="card card-pad" aria-labelledby="yield-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="yield-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Provider efficiency — last 24 hours</h2>
        {t && <p className="text-[12px] text-muted">Overall unique yield <b className="tabular-nums text-ink">{pct(t.uniqueYieldPct)}</b> · enrichment yield <b className="tabular-nums text-ink">{pct(t.enrichmentYieldPct)}</b></p>}
      </div>
      {!data ? (
        failed ? <p role="status" className="mt-3 text-[12.5px] text-muted">Provider efficiency could not be read just now.</p> : <span aria-hidden="true" className="skeleton mt-3 block h-32 w-full" />
      ) : data.providers.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-2">No provider has run in the last 24 hours.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[12px]">
            <thead className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              <tr className="text-[10px]">
                <th colSpan={5} />
                <th colSpan={3} className="border-b border-rule/60 px-1.5 pb-0.5 text-center">Duplicates</th>
                <th colSpan={2} className="border-b border-rule/60 px-1.5 pb-0.5 text-center">Failures</th>
                <th colSpan={3} />
              </tr>
              <tr>
                <th className="py-1.5 pr-2">Provider</th><th className="px-1.5">Standing</th><th className="px-1.5 text-right">Checked</th><th className="px-1.5 text-right">New</th>
                <th className="px-1.5 text-right">Review</th>
                <th className="px-1.5 text-right">Unchanged</th><th className="px-1.5 text-right">Enriched</th><th className="px-1.5 text-right">Conflicting</th>
                <th className="px-1.5 text-right">Writes</th><th className="px-1.5 text-right">Source</th>
                <th className="px-1.5 text-right">Unique %<InfoTip label="Unique yield">New records (published or sent to review) divided by the candidates looked at, over the runs that recorded how many they looked at. A source that mostly returns what we already hold scores low.</InfoTip></th>
                <th className="px-1.5 text-right">Enrich. %<InfoTip label="Enrichment yield">Held records completed from this source divided by the candidates looked at. Only empty descriptive fields are filled; licence, file link, access and status are never changed.</InfoTip></th>
                <th className="pl-1.5 text-right">Last new</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {data.providers.map((p: any) => {
                const q = QUALITY[standing(p.source)];
                return (
                  <tr key={`${p.group}-${p.source}`}>
                    <td className="py-1.5 pr-2"><span className="text-muted">{p.group} · </span><span className="font-medium text-ink">{p.source}</span></td>
                    <td className="px-1.5">{q ? <Badge tone={q.tone}>{q.label}</Badge> : <span className="text-muted">—</span>}</td>
                    <td className="px-1.5 text-right tabular-nums">{p.checked ? N(p.checked) : '—'}</td>
                    <td className="px-1.5 text-right tabular-nums font-semibold text-ink">{N(p.newPublished)}</td>
                    <td className="px-1.5 text-right tabular-nums">{N(p.review)}</td>
                    <td className="px-1.5 text-right tabular-nums">{N(p.duplicateUnchanged)}</td>
                    <td className="px-1.5 text-right tabular-nums">{N(p.duplicateEnriched)}</td>
                    <td className="px-1.5 text-right tabular-nums">{N(p.duplicateConflicting)}</td>
                    <td className={`px-2 text-right tabular-nums ${p.failedWrites ? 'font-semibold text-alarm' : ''}`}>{N(p.failedWrites)}</td>
                    <td className="px-1.5 text-right tabular-nums">{N(p.providerFailures)}</td>
                    <td className="px-1.5 text-right tabular-nums">{pct(p.uniqueYieldPct)}</td>
                    <td className="px-1.5 text-right tabular-nums">{pct(p.enrichmentYieldPct)}</td>
                    <td className="whitespace-nowrap pl-1.5 text-right text-muted">{p.lastProductiveAt ? ago(p.lastProductiveAt) : 'none'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted">Ingestion activity in the window, from the run log — not what the catalogue holds. “Failures · Writes” are records the catalogue could not store; “Failures · Source” are requests a provider did not answer, and are never counted as failed writes. Yield percentages use only runs that recorded how much they looked at (older article and journal runs did not); “—” means none did.</p>
    </section>
  );
}
