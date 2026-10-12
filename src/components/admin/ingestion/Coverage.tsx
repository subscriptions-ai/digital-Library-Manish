import { useState } from 'react';
import { N, ago } from './format';

const SORTS = [
  ['name', 'Department A–Z'],
  ['books-asc', 'Lowest Books'],
  ['books-desc', 'Highest Books'],
  ['articles-asc', 'Lowest Articles'],
  ['articles-desc', 'Highest Articles'],
  ['failures-desc', 'Most failures'],
] as const;
type Sort = typeof SORTS[number][0];

const num = (v: any) => Number(v) || 0;

function sorted(rows: any[], sort: Sort) {
  const by = (key: string, dir: 1 | -1) => (a: any, b: any) => (num(a[key]) - num(b[key])) * dir || a.department.localeCompare(b.department);
  const out = rows.slice();
  switch (sort) {
    case 'books-asc': return out.sort(by('books', 1));
    case 'books-desc': return out.sort(by('books', -1));
    case 'articles-asc': return out.sort(by('articles', 1));
    case 'articles-desc': return out.sort(by('articles', -1));
    case 'failures-desc': return out.sort(by('recentFailures', -1));
    default: return out.sort((a, b) => a.department.localeCompare(b.department));
  }
}

/**
 * Every department with what it holds now, and how far each department's sweep of each source has reached.
 * A department with nothing is still listed — that is the one a person is looking for. Choosing a row filters Run activity to it.
 */
export function Coverage({ coverage, selected, onSelect }: { coverage: any[] | null; selected: string; onSelect: (department: string) => void }) {
  const [sort, setSort] = useState<Sort>('name');
  const rows = coverage ? sorted(coverage, sort) : [];

  return (
    <section className="card" aria-labelledby="coverage-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-5 py-4">
        <div>
          <h2 id="coverage-heading" className="text-base font-semibold text-ink">Coverage by department</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Books, Articles and Journals are what the catalogue holds now (Journals: full text accepted). “Open” counts search terms not yet walked to the end of the source. Select a department to see its run activity.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Sort by
          <select className="input h-9 w-auto py-0 text-[13px]" value={sort} onChange={e => setSort(e.target.value as Sort)}>
            {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      {coverage === null ? <div className="p-5" aria-busy="true"><span className="skeleton block h-5 w-full" /></div>
        : !coverage.length ? <p className="px-5 py-4 text-sm text-muted">No department has been reached yet.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2 font-semibold">Department</th>
                  <th className="px-3 py-2 text-right font-semibold">Books</th>
                  <th className="px-3 py-2 text-right font-semibold">Articles</th>
                  <th className="px-3 py-2 text-right font-semibold">Journals</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Items waiting for a person to decide">Needs review</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Runs that failed in the last 7 days">Recent failures</th>
                  <th className="px-3 py-2 text-right font-semibold">DOAJ open</th>
                  <th className="px-3 py-2 text-right font-semibold">DOAB open</th>
                  <th className="px-5 py-2 text-right font-semibold">Last swept</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map(c => {
                  const isSel = selected === c.department;
                  const empty = !num(c.books) && !num(c.articles) && !num(c.journals);
                  return (
                    <tr key={c.department} className={isSel ? 'bg-accent-soft' : 'hover:bg-surface-2'}>
                      <td className="px-5 py-2 font-medium text-ink">
                        <button type="button" className="text-left underline-offset-2 hover:underline focus-visible:underline" aria-pressed={isSel}
                          title={empty ? 'No catalogue content found for this department yet. Show its run activity.' : 'Show this department’s run activity'}
                          onClick={() => onSelect(c.department)}>{c.department}</button>
                        {empty && <span className="ml-2 text-[11.5px] font-normal text-muted">nothing held yet</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{N(c.books ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{N(c.articles ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{N(c.journals ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{N(c.needsReview ?? 0)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${num(c.recentFailures) ? 'font-semibold text-alarm' : ''}`}>{N(c.recentFailures ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.doaj ? `${N(c.doaj.termsOpen)} / ${N(c.doaj.terms)}` : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.doab ? `${N(c.doab.termsOpen)} / ${N(c.doab.terms)}` : '—'}</td>
                      <td className="px-5 py-2 text-right text-muted">{ago(c.doaj?.lastSweptAt || c.doab?.lastSweptAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
