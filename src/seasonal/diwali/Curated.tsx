import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DOMAINS } from '../../constants';
import { DepartmentCount } from '../../components/DepartmentCount';
import { diwaliLevel } from './isDiwaliActive';
import { BigDiya, CornerMandala, MarigoldGarland } from './art';

/**
 * "Light of Knowledge" — a short, hand-picked shelf for the festival, on a warm
 * ground, with a lamp burning over the heading and a garland along each edge.
 *
 * The list is curated on purpose: four departments worth a look over the
 * holiday, and the four that have only just opened, so somebody arriving on the
 * home page can find them without reading the whole A-to-Z. It is the only
 * place in this feature where department names are named, and they are named by
 * id and resolved against DOMAINS — a department that is renamed or removed
 * drops out of the row instead of leaving a dead card behind.
 *
 * The figure on each card is the shared one, so a department with an empty
 * shelf says "New" here exactly as it does everywhere else. The cards' content
 * and links are untouched by the dressing: it is a border, a corner and a
 * ground.
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
  const level = diwaliLevel();
  if (!level) return null;

  const picked = CURATED_IDS
    .map(id => DOMAINS.find(d => d.id === id))
    .filter((d): d is (typeof DOMAINS)[number] => Boolean(d));
  if (!picked.length) return null;

  const byName: Record<string, number> = {};
  for (const row of depts) byName[row.name] = row.total;

  return (
    <section aria-labelledby="dw-curated-heading" className={`dw-curated dw-level-${level}`}>
      {level === 'peak' && <MarigoldGarland className="dw-garland dw-garland-top" />}
      <div className="dw-curated-glow" aria-hidden="true" />

      <div className="container-public section-spacing relative">
        <div className="dw-curated-head">
          <BigDiya className="dw-curated-diya" />
          <p className="dw-curated-eyebrow">This Diwali</p>
          <h2 id="dw-curated-heading" className="np-display dw-curated-title">Light of Knowledge</h2>
          <span className="dw-shimmer" aria-hidden="true" />
          <p className="dw-curated-sub">
            A few departments to open over the festival — including the ones that have just joined the library.
          </p>
          <Link to="/departments" className="dw-curated-cta">
            All departments <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-8 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {picked.map(d => (
            <li key={d.id}>
              <Link to={`/domain/${d.id}`} className="dw-card">
                <CornerMandala className="dw-card-corner" />
                <span className="np-strong min-w-0 break-words text-[14px]" style={{ color: 'var(--np-ink)' }}>{d.name}</span>
                <DepartmentCount count={byName[d.name]} loaded={loaded} className="text-[12px] text-[color:var(--np-body)]" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {level === 'peak' && <MarigoldGarland className="dw-garland dw-garland-bottom" />}
    </section>
  );
}
