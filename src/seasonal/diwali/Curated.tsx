import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DOMAINS } from '../../constants';
import { DepartmentCount } from '../../components/DepartmentCount';
import { isDiwaliActive } from './isDiwaliActive';

/**
 * "Light of Knowledge" — a short, hand-picked shelf for the festival.
 *
 * The list is curated on purpose: four departments worth a look over the
 * holiday, and the four that have only just opened, so somebody arriving on the
 * home page can find them without reading the whole A-to-Z. It is the only
 * place in this feature where department names are named, and they are named by
 * id and resolved against DOMAINS — a department that is renamed or removed
 * drops out of the row instead of leaving a dead card behind.
 *
 * The figure on each card is the shared one, so a department with an empty
 * shelf says "New" here exactly as it does everywhere else.
 *
 * The eyebrow and heading repeat two small components from the home page rather
 * than importing them: the home page imports this section, and importing back
 * out of it would make the two modules depend on each other.
 */

const CURATED_IDS = [
  'ayurveda', 'law', 'arts', 'management',
  'paramedical-sciences', 'radiology', 'medical-laboratory-technology', 'optometry-ophthalmology',
];

type DeptTotal = { name: string; total: number };

export function DiwaliCurated({ depts, loaded }: { depts: DeptTotal[]; loaded: boolean }) {
  if (!isDiwaliActive()) return null;

  const picked = CURATED_IDS
    .map(id => DOMAINS.find(d => d.id === id))
    .filter((d): d is (typeof DOMAINS)[number] => Boolean(d));
  if (!picked.length) return null;

  const byName: Record<string, number> = {};
  for (const row of depts) byName[row.name] = row.total;

  return (
    <section aria-labelledby="dw-curated-heading" className="container-public section-spacing border-t"
      style={{ borderColor: 'var(--np-line)' }}>
      <p className="inline-flex items-center gap-2 rounded-full bg-[color:var(--np-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--np-body)]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--np-amber)' }} />
        This Diwali
      </p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 id="dw-curated-heading" className="np-display mt-4 text-[30px] leading-[1.15] sm:text-[38px]"
            style={{ color: 'var(--np-ink)' }}>Light of Knowledge</h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--np-body)' }}>
            A few departments to open over the festival — including the ones that have just joined the library.
          </p>
        </div>
        <Link to="/departments"
          className="btn btn-lg shrink-0 self-start border text-[color:var(--np-ink)] sm:self-auto dw-card-edge"
          style={{ background: 'transparent' }}>
          All departments <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-8 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {picked.map(d => (
          <li key={d.id}>
            <Link to={`/domain/${d.id}`}
              className="dw-card-edge flex h-full min-h-14 items-baseline justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span className="np-strong min-w-0 break-words text-[14px]" style={{ color: 'var(--np-ink)' }}>{d.name}</span>
              <DepartmentCount count={byName[d.name]} loaded={loaded} className="text-[12px] text-[color:var(--np-body)]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
