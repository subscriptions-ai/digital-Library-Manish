import { N, ago } from './format';

/** How far each department's sweep of each source has reached — the answer to "how much is left". */
export function Coverage({ coverage }: { coverage: any[] | null }) {
  return (
    <section className="card" aria-labelledby="coverage-heading">
      <div className="border-b border-rule px-5 py-4">
        <h2 id="coverage-heading" className="text-base font-semibold text-ink">Coverage by department</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">“Open” counts search terms not yet walked to the end of the source.</p>
      </div>
      {coverage === null ? <div className="p-5" aria-busy="true"><span className="skeleton block h-5 w-full" /></div>
        : !coverage.length ? <p className="px-5 py-4 text-sm text-muted">No department has been reached yet.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr><th className="px-5 py-2 font-semibold">Department</th><th className="px-3 py-2 text-right font-semibold">Journals held</th><th className="px-3 py-2 text-right font-semibold">Books held</th><th className="px-3 py-2 text-right font-semibold">DOAJ open</th><th className="px-3 py-2 text-right font-semibold">DOAB open</th><th className="px-5 py-2 text-right font-semibold">Last swept</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {coverage.map(c => (
                  <tr key={c.department}>
                    <td className="px-5 py-2 font-medium text-ink">{c.department}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{N(c.journalsHeld)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{N(c.booksHeld)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.doaj ? `${N(c.doaj.termsOpen)} / ${N(c.doaj.terms)}` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.doab ? `${N(c.doab.termsOpen)} / ${N(c.doab.terms)}` : '—'}</td>
                    <td className="px-5 py-2 text-right text-muted">{ago(c.doaj?.lastSweptAt || c.doab?.lastSweptAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
