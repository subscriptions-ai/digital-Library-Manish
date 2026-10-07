import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Building2, Search, Users } from 'lucide-react';
import { Button, EmptyState, Skeleton, buttonClass } from './ui';

/**
 * Every institution whose people read here, on a page of its own.
 *
 * The preview page used to print all of them in one wall — at 141 and growing
 * that is a list nobody reads. It now shows the first eighteen and sends the
 * rest here, where they can be filtered by kind and searched by name.
 *
 * Universities come first throughout. They are what a visitor is looking for
 * when they ask who else is on this, and sorting by size alone buried them
 * under whichever institute happened to sign up the most people.
 */

type Row = { name: string; kind: string; members: number };
type Payload = { total: number; members: number; byKind: Record<string, number>; institutions: Row[] };

const KIND_ORDER = ['University', 'College', 'Institute', 'School', 'Organisation'];
const plural = (word: string, count: number) =>
  count === 1 ? word : /y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
const n = (x: number) => x.toLocaleString('en-IN');

const rank = (k: string) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? 99 : i; };

export function InstitutionsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch('/api/library/institutions')
      .then(r => (r.ok ? r.json() : null))
      .then(d => Array.isArray(d?.institutions) && setData(d))
      .catch(() => {})
      .finally(() => setSettled(true));
  }, []);

  // Universities first, and selected when the page opens.
  const kind = chosen ?? (data?.byKind?.University ? 'University' : 'All');
  const setKind = setChosen;

  const rows = useMemo(() => {
    const all = [...(data?.institutions || [])].sort(
      (a, b) => rank(a.kind) - rank(b.kind) || b.members - a.members || a.name.localeCompare(b.name));
    const term = q.trim().toLowerCase();
    return all
      .filter(i => kind === 'All' || i.kind === kind)
      .filter(i => !term || i.name.toLowerCase().includes(term));
  }, [data, kind, q]);

  // Under each kind's own heading, so a reader can stop at the universities.
  const groups = useMemo(() => {
    const by = new Map<string, Row[]>();
    for (const r of rows) (by.get(r.kind) || by.set(r.kind, []).get(r.kind)!).push(r);
    return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [rows]);

  const kinds = [...KIND_ORDER.filter(k => data?.byKind?.[k]),
    ...Object.keys(data?.byKind || {}).filter(k => !KIND_ORDER.includes(k)), 'All'];

  return (
    <div className="np bg-surface" style={{ color: 'var(--np-body)' }}>
      <Helmet>
        <title>The institutions who read here — STM Digital Library</title>
        <meta name="description" content="Colleges, universities and institutes whose faculty, researchers and students read on the STM Digital Library." />
      </Helmet>

      <section className="bg-navy">
        <div className="container-public py-12 sm:py-16">
          <Link to="/" className="on-dark-2 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
          <h1 className="on-dark mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            The institutions whose people read here.
          </h1>
          <p className="on-dark-2 mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">
            Universities, colleges and institutes put their faculty, researchers and students on the
            library through institutional access.
          </p>
        </div>
      </section>

      <section className="container-public py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind of institution">
            {kinds.map(k => (
              <button key={k} type="button" onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`btn btn-sm rounded-full ${kind === k ? 'btn-brand' : 'btn-outline'}`}>
                {k === 'All' ? 'All of them' : plural(k, 2)}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <label htmlFor="institution-search" className="sr-only">Find an institution</label>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input id="institution-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find an institution"
              className="input pl-9" />
          </div>
        </div>

        {!data && settled && <p className="mt-6 text-muted">Institution information is temporarily unavailable.</p>}
        {!data && !settled && (
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading institutions">
            {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        )}

        {data && rows.length === 0 && (
          <EmptyState
            className="mt-6"
            icon={Search}
            title={`Nothing matches “${q}”.`}
            action={q ? <Button variant="outline" size="sm" onClick={() => setQ('')}>Clear search</Button> : undefined}
          />
        )}

        {groups.map(([k, list]) => (
          <div key={k} className="mt-10">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
              {plural(k, 2)}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
              {list.map(i => (
                <div key={i.name} className="flex items-center gap-3 bg-surface px-4 py-4 sm:px-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink" title={i.name}>{i.name}</span>
                    <span className="block text-xs text-muted">{i.kind}</span>
                  </span>
                </div>
              ))}
              {/* A part-filled last row would otherwise show the grid's own
                  grey through the gap, which reads as broken tiles. */}
              {Array.from({ length: (3 - list.length % 3) % 3 }).map((_, f) => (
                <div key={`w${f}`} className="hidden bg-surface lg:block" />
              ))}
              {Array.from({ length: (2 - list.length % 2) % 2 }).map((_, f) => (
                <div key={`n${f}`} className="hidden bg-surface sm:block lg:hidden" />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-12 rounded-xl border border-rule bg-surface-2 p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Users size={16} aria-hidden="true" className="text-accent" /> Is your institution not on this list?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            Put your faculty and students on the library on one account.
          </p>
          <Link to="/for-institutions" className={buttonClass('brand', 'md', 'mt-4')}>
            For institutions
          </Link>
        </div>
      </section>
    </div>
  );
}
