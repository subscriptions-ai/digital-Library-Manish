import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Building2, Search, Users } from 'lucide-react';

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
  const [q, setQ] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch('/api/library/institutions')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d?.institutions && setData(d))
      .catch(() => {});
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

  const kinds = [...(data?.byKind?.University ? ['University'] : []), 'All',
    ...KIND_ORDER.filter(k => k !== 'University' && data?.byKind?.[k]),
    ...Object.keys(data?.byKind || {}).filter(k => !KIND_ORDER.includes(k))];

  return (
    <div className="np bg-surface" style={{ color: 'var(--np-body)' }}>
      <Helmet>
        <title>The institutions who read here — STM Digital Library</title>
        <meta name="description" content="Colleges, universities and institutes whose faculty, researchers and students read on the STM Digital Library." />
      </Helmet>

      <section className="px-5 py-14 text-white"
        style={{ background: 'linear-gradient(120deg, var(--np-navy) 0%, var(--np-navy-2) 70%, #23336b 100%)' }}>
        <div className="mx-auto max-w-6xl">
          <Link to="/home-preview" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/70 hover:text-white">
            <ArrowLeft size={15} /> Back
          </Link>
          <h1 className="np-display mt-5 text-[32px] leading-tight sm:text-[42px]">
            The institutions whose people read here.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75">
            Universities, colleges and institutes put their faculty, researchers and students on the
            library — the whole department on one account, however many of them there are.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {kinds.map(k => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className="np-strong rounded-full px-4 py-2 text-[12.5px] transition-colors"
                style={kind === k
                  ? { background: 'var(--np-navy)', color: '#fff' }
                  : { border: '1px solid var(--np-line)', color: 'var(--np-ink)' }}>
                {k === 'All' ? 'All of them' : plural(k, 2)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-xl border px-4 py-2.5 sm:w-72"
            style={{ borderColor: 'var(--np-line)' }}>
            <Search size={15} style={{ color: 'var(--np-body)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an institution"
              className="w-full bg-transparent text-[13.5px] outline-none"
              style={{ color: 'var(--np-ink)' }} />
          </label>
        </div>

        {!data && <div className="mt-10 h-64 animate-pulse rounded-2xl" style={{ background: 'var(--np-soft)' }} />}

        {data && rows.length === 0 && (
          <p className="mt-10 text-[14.5px]" style={{ color: 'var(--np-body)' }}>
            Nothing matches “{q}”.
          </p>
        )}

        {groups.map(([k, list]) => (
          <div key={k} className="mt-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--np-body)' }}>
              {plural(k, 2)} <span style={{ color: 'var(--np-ink)' }}>{n(list.length)}</span>
            </p>
            <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-3"
              style={{ background: 'var(--np-line)', borderColor: 'var(--np-line)' }}>
              {list.map(i => (
                <div key={i.name} className="flex items-center gap-3 bg-surface px-5 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'var(--t6-bg)', color: 'var(--t6-ink)' }}>
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="np-strong block truncate text-[13.5px]" style={{ color: 'var(--np-ink)' }}>{i.name}</span>
                    <span className="block text-[11.5px]" style={{ color: 'var(--np-body)' }}>{i.kind}</span>
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

        <div className="mt-12 rounded-2xl border p-6" style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
          <p className="np-strong text-[15px]" style={{ color: 'var(--np-ink)' }}>
            <Users size={15} className="mr-2 inline" /> Is your institution not on this list?
          </p>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed">
            Put your faculty and students on the library on one account.
          </p>
          <Link to="/for-institutions"
            className="np-strong mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] text-white"
            style={{ background: 'var(--np-navy)' }}>
            For institutions
          </Link>
        </div>
      </section>
    </div>
  );
}
