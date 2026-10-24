import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DOMAINS } from '../constants';
import { DEPARTMENTS_AZ, DepartmentExplorer } from './DepartmentExplorer';
import { useDepartmentTotals } from './HomePreviewChrome';
import { Eyebrow, Heading, n } from './HomePreview';

/**
 * /departments — the home of the department explorer.
 *
 * The hero says what the page is; the index is every department as an ordinary link to its own page
 * (so the whole list is crawlable without running a line of this page's script); the explorer lets a
 * reader look inside one department before deciding to open it. The title, description and canonical come
 * from the route's own entry in publicSeo, the same one the server writes into the page it sends.
 */

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function DepartmentsPage() {
  const totals = useDepartmentTotals();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');

  // The chosen department lives in the address (?department=nursing), so a link to it works and Back behaves.
  const asked = params.get('department');
  const selectedId = DOMAINS.some(d => d.id === asked) ? (asked as string) : DEPARTMENTS_AZ[0].id;
  const select = (id: string) => setParams(prev => { const next = new URLSearchParams(prev); next.set('department', id); return next; }, { replace: true });

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => DEPARTMENTS_AZ.filter(d => !needle || d.name.toLowerCase().includes(needle)), [needle]);

  return (
    <>
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Departments</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">
            Explore academic resources by subject area.
          </p>
          {totals && (
            <p className="on-dark-2 mt-3 text-sm">{n(totals.total)} items across {totals.count} departments</p>
          )}
        </div>
      </section>

      <section aria-labelledby="dept-index-heading" className="container-public section-spacing">
        <Eyebrow>All departments</Eyebrow>
        <Heading className="max-w-3xl"><span id="dept-index-heading">Find a department</span></Heading>

        <form role="search" onSubmit={e => e.preventDefault()} className="relative mt-6 max-w-md">
          <label htmlFor="dept-search" className="sr-only">Search departments</label>
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--np-body)' }} />
          <input id="dept-search" type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search departments" autoComplete="off"
            className={`w-full rounded-xl border bg-surface py-3 pl-10 pr-3.5 text-[15px] ${focusRing}`}
            style={{ borderColor: 'var(--np-line)', color: 'var(--np-ink)' }} />
        </form>

        <ul className="mt-6 grid list-none grid-cols-1 gap-x-5 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(d => {
            const count = totals?.byName[d.name];
            return (
              <li key={d.id}>
                <Link to={`/domain/${d.id}`}
                  className={`flex min-h-11 items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-[14px] hover:bg-[color:var(--np-soft)] hover:text-accent ${focusRing} focus-visible:outline-offset-[-2px]`}
                  style={{ color: 'var(--np-ink)' }}>
                  <span className="min-w-0 break-words">{d.name}</span>
                  {typeof count === 'number' && count > 0 && <span className="tnum shrink-0 text-[12px]" style={{ color: 'var(--np-body)' }}>{n(count)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <p role="status" className="mt-4 text-[13.5px]" style={{ color: 'var(--np-body)' }}>
          {shown.length === 0 ? `No department matches “${query.trim()}”.` : ''}
        </p>
      </section>

      <DepartmentExplorer totals={totals ? totals.byName : null} selectedId={selectedId} onSelect={select} />
    </>
  );
}
