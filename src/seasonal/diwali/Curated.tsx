import { useEffect, useRef, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DOMAINS } from '../../constants';
import { DepartmentCount } from '../../components/DepartmentCount';
import { diwaliLevel } from './isDiwaliActive';
import { BigDiya, CornerMandala, MarigoldGarland } from './art';
import { usePauseOffscreen } from './pauseOffscreen';

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
 *
 * The cards rise into place one after another the first time the row scrolls
 * into view. They are visible by default, and stay that way unless every
 * condition for the reveal holds: an IntersectionObserver to wake them, motion
 * not turned down, a level that still moves (not fade), and the row starting
 * below the fold — a row already on screen is never hidden to be shown again.
 * Only then does the list get data-reveal="armed". That is decided in the
 * observer's first report, which carries the row's position for free: asking
 * for it during the first render instead forced a whole-page layout in the
 * middle of it, on the home page's first paint. Being below the fold, the row
 * is not on screen to be seen going from shown to hidden.
 * It is a data attribute set on the node, not a class in the JSX, so a later
 * render of this component cannot put the cards back to hidden.
 */

const CURATED_IDS = [
  'ayurveda', 'law', 'arts', 'management',
  'paramedical-sciences', 'radiology', 'medical-laboratory-technology', 'optometry-ophthalmology',
];

type DeptTotal = { name: string; total: number };

export function DiwaliCurated({ depts, loaded }: { depts: DeptTotal[]; loaded: boolean }) {
  const level = diwaliLevel();
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  usePauseOffscreen(section, level);

  useEffect(() => {
    const el = list.current;
    if (!el || level === 'fade' || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let first = true;
    const io = new IntersectionObserver(([entry]) => {
      if (first) {
        first = false;
        // Already on screen: leave it be. Below the fold: hide it to reveal later.
        if (entry.boundingClientRect.top < window.innerHeight) { io.disconnect(); return; }
        el.dataset.reveal = 'armed';
        return;
      }
      if (!entry.isIntersecting) return;
      el.dataset.reveal = 'in';
      io.disconnect();
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [level]);

  if (!level) return null;

  const picked = CURATED_IDS
    .map(id => DOMAINS.find(d => d.id === id))
    .filter((d): d is (typeof DOMAINS)[number] => Boolean(d));
  if (!picked.length) return null;

  const byName: Record<string, number> = {};
  for (const row of depts) byName[row.name] = row.total;

  return (
    <section ref={section} aria-labelledby="dw-curated-heading" className={`dw-curated dw-level-${level}`}>
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

        <ul ref={list} className="dw-cards mt-8 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {picked.map((d, i) => (
            <li key={d.id} className="dw-card-item" style={{ '--dw-i': i } as CSSProperties}>
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
