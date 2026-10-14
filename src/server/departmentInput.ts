import { resolveCanonicalDepartment } from '../lib/departmentRegistry.js';

/**
 * New records get an official department, or none.
 *
 * Used on the routes that create or edit catalogue records by hand or by file. A department typed or imported in a
 * known spelling ("Physiotheraphy", " medical sciences ") is stored as the official name. One the registry does not
 * know is refused with a message that names it, instead of being stored: a free-text value is how "Medical sciences"
 * and "Biotechnology" got into the catalogue in the first place. Nothing is guessed, and an empty department stays empty.
 */
export type DepartmentFix = { rewrites: number; problems: { where: string; value: string }[] };

const FIELDS = ['domain', 'department'] as const;

function fixRecord(rec: any, where: string, out: DepartmentFix, unchanged?: string | null) {
  if (!rec || typeof rec !== 'object') return;
  for (const f of FIELDS) {
    const v = rec[f];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) continue;
    // Editing an old record whose department is one the registry does not know: leaving it as it is is not a new typo.
    if (unchanged != null && v === unchanged) continue;
    const r = resolveCanonicalDepartment(v);
    if (r.status === 'unresolved') { out.problems.push({ where, value: String(v) }); continue; }
    if (rec[f] !== r.name) { rec[f] = r.name; out.rewrites++; }
  }
}

/** Rewrites the department fields of a request body in place (the body itself, and each of `items`). */
export function normaliseBodyDepartments(body: any, unchanged?: string | null): DepartmentFix {
  const out: DepartmentFix = { rewrites: 0, problems: [] };
  fixRecord(body, 'the department', out, unchanged);
  if (body && Array.isArray(body.items)) body.items.forEach((it: any, i: number) => fixRecord(it, `row ${i + 1}`, out));
  return out;
}

/** Express middleware: official departments in, or a 400 that lists every value that is not one. */
export function requireOfficialDepartments(req: any, res: any, next: any) {
  return respond(normaliseBodyDepartments(req.body), res, next);
}

/**
 * The same for an edit: sending back the department the record already has is always allowed, so an old record filed
 * under a value the registry does not know can still have its other fields corrected.
 */
export const requireOfficialDepartmentsOnEdit = (current: (req: any) => Promise<string | null | undefined>) =>
  async (req: any, res: any, next: any) => {
    let keep: string | null | undefined = null;
    try { keep = await current(req); } catch { keep = null; }
    return respond(normaliseBodyDepartments(req.body, keep), res, next);
  };

function respond(fix: DepartmentFix, res: any, next: any) {
  if (!fix.problems.length) return next();
  const shown = fix.problems.slice(0, 10).map((p) => `${p.where}: "${p.value}"`).join('; ');
  const more = fix.problems.length > 10 ? ` (and ${fix.problems.length - 10} more)` : '';
  return res.status(400).json({
    error: `Not a department of the library — ${shown}${more}. Choose a department from the list; nothing was saved.`,
    code: 'UNKNOWN_DEPARTMENT', problems: fix.problems,
  });
}
