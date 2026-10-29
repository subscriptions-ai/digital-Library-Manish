import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Info, Layers, Lock, Search } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, Field, PageHeader, Skeleton, buttonClass } from '../ui';
import { countdown, useAllowance, useProPath } from '../membership/ReadingClock';
import { browseStateFor, libraryHref } from '../../lib/libraryParams';
import { countsLine, summariseAccess, type AccessInfo } from '../../lib/accessSummary';

/**
 * "My Content Access": the departments an account can open and, inside each, what the catalogue holds for each content type.
 *
 * Shared by the reader dashboard and the institution dashboard; only the address of the library differs (`browseBase`). Every Browse link is
 * built from the same parameters the library reads back (src/lib/libraryParams.ts), so the department, the content type and the shelf the
 * items are actually on reach the results intact.
 *
 * Two counts are shown and each is named. "In the catalogue" is every record the library describes. "Readable here" is the part whose full
 * text is held in this library AND open to this account; a record that links out to its publisher, or that is a catalogue entry only, is in
 * the first number and not the second. Nothing here changes what anyone may open.
 */

type Module = { contentType: string; collection: 'new' | 'archived'; total: number; readable: number; external: number; metadata: number; newCount: number; legacyCount: number; hasAccess: boolean };
type Dept = { name: string; total: number; modules: Module[] };
type Overview = { access: AccessInfo; departments: Dept[] };

export function AccessOverview({ browseBase }: { browseBase: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const proPath = useProPath();
  const { allowance, msUntil } = useAllowance();

  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    fetch('/api/user/library-overview', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d: Overview) => { if (!Array.isArray(d?.departments)) throw new Error('shape'); setData(d); })
      .catch(e => { if (e?.name !== 'AbortError') setFailed(true); });
    return () => ctl.abort();
  }, [retry]);

  const summary = useMemo(() => summariseAccess(data?.access ?? null, allowance), [data, allowance]);
  const shown = useMemo(() => (data?.departments ?? []).filter(d => d.name.toLowerCase().includes(search.trim().toLowerCase())), [data, search]);

  const header = (
    <PageHeader
      className="!mb-0"
      title={<span className="flex items-center gap-3"><Layers className="shrink-0 text-accent" size={28} aria-hidden="true" /> My Content Access</span>}
      description="The departments you can open, and what the catalogue holds in each. Browse to see the records."
    />
  );

  if (failed) return (
    <div className="mx-auto max-w-6xl space-y-6">{header}
      <div className="card"><ErrorState description="We could not load your access right now. Nothing about your access has changed. Please try again." onRetry={() => { setData(null); setRetry(n => n + 1); }} /></div>
    </div>
  );

  if (!data) return (
    <div className="mx-auto max-w-6xl space-y-6" role="status" aria-label="Loading your access">
      {header}
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
    </div>
  );

  const toneCls = summary.tone === 'success' ? 'border-success/40 bg-success-soft' : summary.tone === 'caution' ? 'border-caution/40 bg-caution-soft' : 'border-rule bg-surface-2';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {header}

      {summary.headline && (
        <section aria-label="How your access works" className={`rounded-xl border px-4 py-3 ${toneCls}`}>
          <p className="text-sm font-semibold text-ink">{summary.headline}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{summary.detail}</p>
          {summary.reading && (
            <p className="mt-0.5 text-[13px] text-ink-2">
              {summary.reading}
              {allowance?.state === 'waiting' && typeof msUntil === 'number' && msUntil > 0 && <span className="tnum"> ({countdown(msUntil)} to go)</span>}
            </p>
          )}
          {data.access.timed && !data.access.staff && (
            <Link to={proPath} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">See subscription options <ArrowRight size={13} aria-hidden="true" /></Link>
          )}
        </section>
      )}

      <p className="flex items-start gap-1.5 text-[13px] text-muted">
        <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span><b className="font-semibold text-ink-2">In the catalogue</b> counts every record described here. <b className="font-semibold text-ink-2">Readable here</b> counts those whose full text is held in this library and open to you; others lead to the publisher’s page or are catalogue entries only.</span>
      </p>

      <Field label="Search departments" className="max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
          <input type="search" placeholder="e.g. Nursing" className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </Field>

      {data.departments.length === 0 ? (
        <div className="card">
          <EmptyState icon={Layers} title="No departments are available to this account" description="There is nothing in the catalogue for the departments on this account yet, or no department has been selected." action={<Link to={proPath} className={buttonClass('outline', 'sm')}>See subscription options</Link>} />
        </div>
      ) : shown.length === 0 ? (
        <div className="card"><EmptyState icon={Search} title="No departments match this search" action={<Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>} /></div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {shown.map(dept => {
            const readableForYou = dept.modules.reduce((n, m) => n + (m.hasAccess ? m.readable : 0), 0);
            return (
              <li key={dept.name} className="card flex flex-col overflow-hidden">
                {/* Actions sit under the text, on the left: the help and feedback buttons are fixed to the right edge of the screen and would cover one there. */}
                <div className="border-b border-rule px-5 py-4">
                  <h2 className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">{dept.name}</h2>
                  <p className="tnum mt-0.5 text-[13px] text-muted">{countsLine(dept.total, readableForYou)}</p>
                  <Link to={libraryHref(browseBase, { domain: dept.name })} className={buttonClass('primary', 'sm', 'mt-3')} aria-label={`Browse all content in ${dept.name}`}>
                    Browse all <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
                <ul className="divide-y divide-rule">
                  {dept.modules.map(m => {
                    const readableHere = m.hasAccess ? m.readable : 0;
                    return (
                      <li key={`${m.contentType}-${m.collection}`} className="px-5 py-3">
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${m.hasAccess ? 'text-ink' : 'text-muted'}`}>{m.contentType}{m.collection === 'archived' && <span className="font-normal text-muted"> · Archived shelf</span>}</p>
                          <p className="tnum mt-0.5 text-xs text-muted">
                            {m.total.toLocaleString('en-IN')} in the catalogue · {readableHere.toLocaleString('en-IN')} readable here
                            {m.hasAccess && m.external > 0 ? ` · ${m.external.toLocaleString('en-IN')} at the source` : ''}
                            {m.hasAccess && m.metadata > 0 ? ` · ${m.metadata.toLocaleString('en-IN')} metadata only` : ''}
                          </p>
                        </div>
                        {m.hasAccess ? (
                          <Link to={libraryHref(browseBase, browseStateFor(m, dept.name))} className={buttonClass('outline', 'sm', 'mt-2')} aria-label={`Browse ${m.contentType} in ${dept.name}`}>
                            Browse {m.contentType} <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        ) : (
                          <Badge tone="neutral" className="mt-2" title="Your plan does not include this content type for this department"><Lock size={12} aria-hidden="true" /> Not in your plan</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-xs text-faint"><BookOpen size={12} aria-hidden="true" /> Counts are refreshed every few minutes.</p>
    </div>
  );
}
