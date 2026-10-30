import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DOMAINS } from '../constants';
import { DepartmentCount, departmentCountSuffix, isEmptyDepartment } from './DepartmentCount';
import { Eyebrow, Heading, Figure, btnPrimary, n } from './HomePreview';

/**
 * The department explorer: every department on the left, and what the selected one holds on the right.
 *
 * It lived on the home page; it belongs on the Departments page, where somebody who has come to look at
 * departments will use it. Nothing about what it reads has changed: the figures come from
 * /api/library/department/:slug, the same answer the department's own page is built from.
 */

type DepartmentDetail = {
  domain: string; slug: string; articles: number; books: number; authors: number;
  firstYear: number | null; lastYear: number | null;
  journals: { id: string; title: string; publisherName: string | null; articleCount: number }[];
  publishers: { name: string; journals: number }[];
  /** How many publishers there are; `publishers` is the biggest fifty. */
  publisherTotal?: number;
};

/** The departments, A to Z, as the navigation menu lists them. */
export const DEPARTMENTS_AZ = [...DOMAINS].sort((a, b) => a.name.localeCompare(b.name));

/**
 * "2017–2026", from the years the department's articles actually carry. Shown only when both ends are
 * plausible years; a range that cannot be trusted is left out rather than printed.
 */
export function publicationRange(first?: number | null, last?: number | null): string | null {
  const ceiling = new Date().getFullYear() + 1;
  const ok = (y: unknown): y is number => typeof y === 'number' && Number.isInteger(y) && y >= 1800 && y <= ceiling;
  if (!ok(first) || !ok(last) || first > last) return null;
  return first === last ? String(first) : `${first}–${last}`;
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function DepartmentExplorer({ totals, selectedId, onSelect }: {
  /** Items held per department name, from the catalogue's own count; null until it has arrived. */
  totals: Record<string, number> | null;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [cache, setCache] = useState<Record<string, DepartmentDetail>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const dept = DOMAINS.find(d => d.id === selectedId) ?? DEPARTMENTS_AZ[0];
  const d = cache[dept.id];
  const total = totals ? totals[dept.name] : undefined;
  const empty = isEmptyDepartment(total, totals !== null);
  const range = publicationRange(d?.firstYear, d?.lastYear);
  const loading = !d && failed !== dept.id;

  useEffect(() => {
    if (cache[dept.id]) return;
    let live = true;
    setFailed(null);
    // Five journals are all this panel names, so five is all it asks for; the department's own page reads the rest, a page at a time.
    fetch(`/api/library/department/${encodeURIComponent(dept.id)}?limit=5`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(body => {
        if (!live) return;
        if (!body?.domain || !Array.isArray(body.journals)) throw new Error('shape');
        setCache(c => ({ ...c, [dept.id]: body }));
      })
      .catch(() => { if (live) setFailed(dept.id); });
    return () => { live = false; };
  }, [dept.id, attempt, cache]);

  // Up and Down walk the list, so a keyboard user is not made to Tab through twenty-nine buttons.
  const walk = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };

  // This list is about holdings, so it names only journals that hold articles; a catalogued journal with none is on the department's own page.
  const top = d ? d.journals.filter(j => j.articleCount > 0).sort((a, b) => b.articleCount - a.articleCount).slice(0, 5) : [];

  return (
    <section id="explorer" aria-labelledby="explorer-heading" className="scroll-mt-24 border-y section-spacing"
      style={{ borderColor: 'var(--np-line)', background: 'var(--np-soft)' }}>
      <div className="container-public">
        <Eyebrow>Core departments</Eyebrow>
        <Heading className="max-w-3xl"><span id="explorer-heading">Explore the collection department by department.</span></Heading>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
          Choose a department to see what it holds — how many articles and books, which journals carry
          the most, and how far back it reaches.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Phones: a dropdown. The list is for screens that can show it beside the panel. */}
          <div className="md:hidden">
            <label htmlFor="explorer-select" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: 'var(--np-body)' }}>Choose a department</label>
            <select id="explorer-select" value={dept.id} onChange={e => onSelect(e.target.value)}
              className={`w-full rounded-xl border bg-surface px-3.5 py-3 text-[15px] ${focusRing}`}
              style={{ borderColor: 'var(--np-line)', color: 'var(--np-ink)' }}>
              {DEPARTMENTS_AZ.map(x => (
                <option key={x.id} value={x.id}>
                  {x.name}{departmentCountSuffix(totals ? totals[x.name] : undefined, totals !== null)}
                </option>
              ))}
            </select>
          </div>

          <ul aria-label="Departments" onKeyDown={walk}
            className="m-0 hidden max-h-[560px] list-none overflow-y-auto rounded-xl border bg-surface p-2 md:block"
            style={{ borderColor: 'var(--np-line)' }}>
            {DEPARTMENTS_AZ.map(x => {
              const active = x.id === dept.id;
              const count = totals ? totals[x.name] : undefined;
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => onSelect(x.id)} aria-pressed={active} aria-current={active ? 'true' : undefined}
                    className={`block w-full cursor-pointer rounded-xl border-l-[3px] px-3.5 py-3 text-left transition-colors hover:bg-[color:var(--np-soft)] ${focusRing} focus-visible:outline-offset-[-2px]`}
                    style={active ? { background: 'var(--t1-bg)', borderColor: 'var(--t1-ink)' } : { borderColor: 'transparent' }}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="np-strong truncate text-[13.5px]"
                        style={{ color: active ? 'var(--t1-ink)' : 'var(--np-ink)' }}>{x.name}</span>
                      <DepartmentCount count={count} loaded={totals !== null} className="text-[11.5px] text-[color:var(--np-body)]" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0 overflow-hidden rounded-xl border bg-surface" style={{ borderColor: 'var(--np-line)' }} aria-live="polite">
            <div className="px-5 py-6 text-white sm:px-6 sm:py-7"
              style={{ background: 'linear-gradient(120deg, var(--np-navy) 0%, var(--np-navy-2) 70%, #23336b 100%)' }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Department</p>
              <h3 className="np-display mt-2 break-words text-[26px] leading-tight text-white sm:text-[30px]">{dept.name}</h3>
              <p className="mt-2 text-[13.5px] text-white/70">
                {empty ? 'New department — nothing on the shelf yet'
                  : typeof total === 'number' ? <>{n(total)} items held</>
                  : totals ? null : 'Reading the catalogue…'}
                {range ? <>{empty || typeof total === 'number' ? ' · ' : ''}articles published {range}</> : null}
              </p>
            </div>

            <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: 'var(--np-line)' }}>
              {[
                // Not the number of journals: it is the smallest figure here and
                // the least of what a department actually amounts to.
                ['Research Articles', d?.articles], ['Books', d?.books],
                ['Authors', d?.authors], ['Publishers', d ? (d.publisherTotal ?? d.publishers.length) : undefined],
              ].map(([label, value]) => (
                <div key={label as string} className="min-w-0 border-r px-4 py-4 last:border-r-0 sm:px-5" style={{ borderColor: 'var(--np-line)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--np-body)' }}>{label}</p>
                  <p className="np-display mt-1 text-[20px]" style={{ color: 'var(--np-ink)' }}>
                    {loading ? <span className="inline-block h-4 w-12 animate-pulse rounded" style={{ background: 'var(--np-line)' }} />
                      : <Figure value={value as number | undefined} settled />}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--np-body)' }}>
                Journals with the most articles held here
              </p>
              {/* The figure beside each journal is what this library holds of it, counted from the shelf. It is
                  not the journal's own output: ingestion takes a limited number of articles per journal. */}
              <p className="mt-1 text-[12px]" style={{ color: 'var(--np-body)' }}>
                Counts are the articles held in this library, not a journal's complete output.
              </p>

              {failed === dept.id ? (
                <div role="alert" className="mt-4 rounded-lg border px-4 py-3 text-[13.5px]" style={{ borderColor: 'var(--np-line)', color: 'var(--np-ink)' }}>
                  This department's details could not be loaded.{' '}
                  <button type="button" onClick={() => { setFailed(null); setAttempt(a => a + 1); }}
                    className={`rounded font-semibold text-accent underline ${focusRing}`}>Try again</button>
                </div>
              ) : loading ? (
                <ul className="mt-3 list-none p-0" aria-hidden="true">
                  {[0, 1, 2, 3].map(k => <li key={k} className="py-3"><div className="h-5 animate-pulse rounded" style={{ background: 'var(--np-line)' }} /></li>)}
                </ul>
              ) : top.length === 0 ? (
                <p className="mt-4 text-[13.5px]" style={{ color: 'var(--np-body)' }}>No journals with published articles are held in this department yet.</p>
              ) : (
                <ul className="mt-3 list-none divide-y p-0" style={{ borderColor: 'var(--np-line)' }}>
                  {top.map(j => (
                    <li key={j.id} className="flex items-baseline justify-between gap-4 border-t py-2.5 first:border-t-0" style={{ borderColor: 'var(--np-line)' }}>
                      <Link to={`/library/journal/${j.id}`} className={`min-w-0 truncate rounded text-[13.5px] hover:underline ${focusRing}`} style={{ color: 'var(--np-ink)' }}>{j.title}</Link>
                      <span className="shrink-0 text-[12px]" style={{ color: 'var(--np-body)' }}>{n(j.articleCount)} held</span>
                    </li>
                  ))}
                </ul>
              )}

              <Link to={`/domain/${dept.id}`} className={`${btnPrimary} mt-6 max-w-full`} style={{ background: 'var(--np-action)' }}>
                <span className="min-w-0 truncate">Explore {dept.name}</span> <ArrowRight size={15} aria-hidden="true" className="shrink-0" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
