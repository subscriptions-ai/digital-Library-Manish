/**
 * The figure beside a department's name, and what stands in for it when that
 * department holds nothing yet.
 *
 * /api/library/stats counts with a GROUP BY, so a department with an empty
 * shelf is absent from the answer rather than present with a zero. Both cases
 * used to render nothing at all: the row carried a blank where every other row
 * carried a number, which reads as a count that is still loading and never
 * arrives. A department we have not filled yet now says so.
 *
 * `loaded` is what separates "the shelf is empty" from "the counts have not
 * arrived". Before they arrive nothing is shown, because "New" would be a claim
 * about a shelf nobody has read. The rule is the same for every department —
 * no name is special-cased, so a department added tomorrow is covered by it.
 */

const n = (x: number) => x.toLocaleString('en-IN');

/** True when the catalogue has answered and this department holds nothing. */
export const isEmptyDepartment = (count: number | undefined, loaded: boolean) =>
  loaded && !(typeof count === 'number' && count > 0);

const NEW_BADGE =
  'inline-flex shrink-0 items-center rounded-full bg-accent-soft px-1.5 py-px ' +
  'text-[10px] font-semibold uppercase tracking-[0.06em] text-accent';

/**
 * `className` styles the number, so each surface keeps the size and colour it
 * already used; the badge is the same everywhere, because "new" means the same
 * thing on all of them.
 */
export function DepartmentCount({ count, loaded, className = '' }: {
  count?: number;
  loaded: boolean;
  className?: string;
}) {
  if (!loaded) return null;
  if (typeof count === 'number' && count > 0) {
    return <span className={`tnum shrink-0 ${className}`}>{n(count)}</span>;
  }
  return <span className={NEW_BADGE}>New</span>;
}

/**
 * The same thing for a place that can only hold text — the phone's department
 * `<select>`, whose options cannot carry an element.
 */
export function departmentCountSuffix(count: number | undefined, loaded: boolean): string {
  if (!loaded) return '';
  return typeof count === 'number' && count > 0 ? ` (${n(count)})` : ' (New)';
}
