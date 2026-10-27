import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../../ui';
import type { BadgeTone } from '../../ui';
import { api } from './api';
import { N } from './format';

/**
 * Where every journal of DOAJ's file ended, with each count a button that opens the exact journals behind it.
 *
 * "Already held" is not "public": a journal is on the public catalogue only when its status is Accepted or MetadataOnly AND it holds a published article.
 * So the held journals are split by what they are now, and the ones the public cannot see yet are named instead of being folded into one number.
 * Reading only: opening a list changes nothing, and nothing here changes a status.
 */

export type DoajBreakdownData = {
  checked: number; new: number; heldPublic: number; heldNoArticles: number; heldReview: number; heldRejected: number;
  skippedConflicting: number; skipped: { unusable: number; sameTitle: number; ambiguous: number; listedTwice: number };
  outsideScope: number; beyondLimit: number; titleDiffers: number; heldByStatus: Record<string, number>;
};

type Row = {
  doaj: { title: string; issn: string; eissn: string }; matchedBy: 'issn' | 'eissn' | 'both' | null; titleDiffers: boolean;
  journals: { id: string; title: string; issn: string | null; eissn: string | null; status: string; department: string | null; publishedArticles: number; public: boolean }[];
};

const STATUS_TONE: Record<string, BadgeTone> = { Accepted: 'success', MetadataOnly: 'accent', NeedsReview: 'caution', Draft: 'caution', Rejected: 'alarm' };
const BY: Record<string, string> = { issn: 'ISSN', eissn: 'e-ISSN', both: 'ISSN and e-ISSN' };

export const CATEGORY_LABEL: Record<string, string> = {
  new: 'New', heldPublic: 'Already held — public, with articles', heldNoArticles: 'Already held — public, no published article yet', heldReview: 'Already held — draft or review',
  heldRejected: 'Already held — rejected', ambiguous: 'Identifiers match two held journals', listedTwice: 'Listed twice in the file', sameTitle: 'Same title, different ISSN',
  unusable: 'No usable ISSN or title', outsideScope: 'New, outside the departments asked for', beyondLimit: 'New, past the limit', titleDiffers: 'Matched by ISSN, but the title differs',
};

function Count({ label, value, hint, cat, open, onOpen, disabled }: { label: string; value: number; hint?: string; cat: string; open: string | null; onOpen: (c: string) => void; disabled: boolean }) {
  const can = !disabled && value > 0;
  const body = (
    <>
      <span className="block text-lg font-semibold tabular-nums text-ink">{N(value)}</span>
      <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] normal-case leading-snug tracking-normal text-muted">{hint}</span>}
    </>
  );
  return can
    ? <button type="button" onClick={() => onOpen(cat)} aria-pressed={open === cat} aria-label={`${N(value)} ${label}. Show these journals`}
        className={`bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-solid)] ${open === cat ? 'bg-accent-soft' : ''}`}>{body}</button>
    : <div className="bg-surface px-3.5 py-3">{body}</div>;
}

/** `added`: given for a finished run, whose counts describe the file as it was when the run began. */
export function DoajBreakdown({ breakdown: b, previewId, added }: { breakdown: DoajBreakdownData; previewId: string | null; added?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const noList = !previewId;
  const heldTotal = b.heldPublic + b.heldNoArticles + b.heldReview + b.heldRejected;
  const c = (label: string, value: number, cat: string, hint?: string) => <Count key={cat} label={label} value={value} hint={hint} cat={cat} open={open} onOpen={x => setOpen(open === x ? null : x)} disabled={noList} />;

  return (
    <div className="mt-5" aria-label="Where every journal in the file ended">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-surface px-3.5 py-3"><dd className="text-lg font-semibold tabular-nums text-ink">{N(b.checked)}</dd><dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Checked</dt></div>
        {c('New', b.new, 'new', added == null ? 'Would be added' : `${N(added)} added by this run`)}
        {c('Held — public, with articles', b.heldPublic, 'heldPublic', 'On the public catalogue, with published articles')}
        {c('Held — public, no article yet', b.heldNoArticles, 'heldNoArticles', 'On the public catalogue; no published article yet')}
        {c('Held — draft / review', b.heldReview, 'heldReview', 'Waiting for a person; not public')}
        {c('Held — rejected', b.heldRejected, 'heldRejected', 'Never shown')}
      </dl>
      <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
        {c('Same title, other ISSN', b.skipped.sameTitle, 'sameTitle', 'Left for a person; never imported')}
        {c('No usable ISSN / title', b.skipped.unusable, 'unusable', 'Cannot be catalogued')}
        {c('Match two held journals', b.skipped.ambiguous, 'ambiguous', 'Its ISSN and e-ISSN belong to different journals')}
        {c('Listed twice in file', b.skipped.listedTwice, 'listedTwice', 'Counted once')}
      </dl>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
        <b>{N(heldTotal)}</b> of the {N(b.checked)} journals are already held; <b>{N(b.skippedConflicting)}</b> were skipped or are in conflict. A journal is public only when it is Accepted or Metadata Only
        <i> and</i> has a published article, so a held journal can be in the database without being on the public site.
        {b.titleDiffers > 0 && <> <button type="button" className="font-medium text-accent underline underline-offset-2" onClick={() => setOpen(open === 'titleDiffers' ? null : 'titleDiffers')}>{N(b.titleDiffers)} matched by ISSN but with a different title</button> are worth a look.</>}
        {(b.outsideScope > 0 || b.beyondLimit > 0) && <> Not counted above: {N(b.outsideScope)} new outside the departments chosen, {N(b.beyondLimit)} new past the limit.</>}
      </p>
      {added != null && <p className="mt-1 text-[12px] text-muted">These counts describe DOAJ’s file as it was when this run began, before the {N(added)} journals it added.</p>}
      {noList && <p className="mt-1 text-[12px] text-muted">The journals behind these counts are not available for this run.</p>}
      {open && previewId && <DoajJournalList key={open} previewId={previewId} category={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function DoajJournalList({ previewId, category, onClose }: { previewId: string; category: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [data, setData] = useState<{ total: number; rows: Row[]; take: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await api(`/api/admin/ingest/doaj-catalogue/inspect?previewId=${encodeURIComponent(previewId)}&category=${encodeURIComponent(category)}&page=${page}&take=25${term ? `&q=${encodeURIComponent(term)}` : ''}`);
    setLoading(false);
    if (!r.ok) { setError(r.data?.error || 'The journals could not be read.'); setData(null); return; }
    setData(r.data);
  }, [previewId, category, page, term]);
  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.take)) : 1;
  const label = CATEGORY_LABEL[category] || category;

  return (
    <section className="mt-3 rounded-xl border border-rule bg-surface-2 p-3.5 sm:p-4" aria-label={`Journals: ${label}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-ink">{label}{data ? <span className="ml-1.5 font-normal text-muted">({N(data.total)})</span> : null}</h3>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
      <form className="mt-2.5 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setTerm(q.trim()); }} role="search">
        <label className="sr-only" htmlFor="doaj-find">Find by title or ISSN</label>
        <input id="doaj-find" className="input max-w-xs" placeholder="Title or ISSN" value={q} onChange={e => setQ(e.target.value)} />
        <Button type="submit" variant="outline" size="sm">Find</Button>
        {term && <Button type="button" variant="outline" size="sm" onClick={() => { setQ(''); setTerm(''); setPage(1); }}>Clear</Button>}
      </form>

      {error && <p role="alert" className="mt-3 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{error}</p>}
      {loading && !data && <p role="status" className="mt-3 text-[13px] text-muted">Reading the journals…</p>}
      {data && data.rows.length === 0 && <p className="mt-3 text-[13px] text-muted">No journals{term ? ' match that search' : ''}.</p>}

      {data && data.rows.length > 0 && (
        <ul className={`mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface ${loading ? 'opacity-60' : ''}`}>
          {data.rows.map((r, i) => (
            <li key={`${r.doaj.issn}-${i}`} className="px-3.5 py-3 text-[13px]">
              <p className="break-words font-medium text-ink">{r.doaj.title || '(no title)'}</p>
              <p className="mt-0.5 text-[12px] text-muted">DOAJ · ISSN <span className="tabular-nums">{r.doaj.issn || '—'}</span> · e-ISSN <span className="tabular-nums">{r.doaj.eissn || '—'}</span>{r.matchedBy ? ` · matched on ${BY[r.matchedBy]}` : ''}</p>
              {r.journals.map(j => (
                <div key={j.id} className="mt-2 rounded-md bg-surface-2 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONE[j.status] || 'neutral'}>{j.status}</Badge>
                    <Badge tone={j.public ? 'success' : 'neutral'}>{j.public ? 'Public' : 'Not public'}</Badge>
                    {r.titleDiffers && <Badge tone="caution">Title differs</Badge>}
                  </div>
                  <p className="mt-1 break-words text-ink">{j.title}</p>
                  <p className="text-[12px] text-muted">
                    ISSN <span className="tabular-nums">{j.issn || '—'}</span> · e-ISSN <span className="tabular-nums">{j.eissn || '—'}</span> · {j.department || 'No department'} ·{' '}
                    {j.publishedArticles ? `${N(j.publishedArticles)} published article${j.publishedArticles === 1 ? '' : 's'}` : 'no published article'}
                  </p>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="tabular-nums">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted">Statuses are read now, from the catalogue. Nothing here changes a journal.</p>
    </section>
  );
}
