/**
 * The canonical departments, and how any other spelling of one is recognised.
 *
 * One list, read by the server (ingestion, access checks, filters, counts) and the browser (selectors,
 * quotations). It is a resolver, not a database table: nothing here is written to a record. Historical
 * rows keep whatever spelling they have; this file lets every reader treat that spelling as the
 * department it means.
 *
 * What counts as a match, and nothing more:
 *   - the name itself, ignoring case, surrounding spaces, "&" versus "and", and spaces around "/"
 *   - an alias listed below. An alias is an explicit decision that a spelling IS that department.
 * A value that is neither is "unresolved". It is never matched to the nearest name: a wrong
 * department on a book or a subscription is worse than one waiting for a person to look at it.
 *
 * Names and ids must equal `DOMAINS` in constants.ts (the public taxonomy, pricing unit and URL id);
 * `scripts/test-department-registry.ts` fails if they drift. Official names are never changed here.
 */

export type CanonicalDepartment = {
  /** The id the public /domain/:id page already uses. */
  id: string;
  /** The official name: what is priced, subscribed and shown. */
  name: string;
  /** Other spellings known to mean exactly this department. */
  aliases: string[];
  /**
   * `false` = the ingestion engines do not search for or place content in this department on their own: it has no classification
   * rules yet, so an automatic run could only guess. Everything else works as for any department (pages, filters, counts, access,
   * quotations, manual assignment). Absent means the engines treat it like every other department.
   */
  autoIngestion?: false;
};

export const CANONICAL_DEPARTMENTS: CanonicalDepartment[] = [
  { id: 'agriculture', name: 'Agriculture', aliases: [] },
  { id: 'applied-mechanics', name: 'Applied Mechanics', aliases: [] },
  { id: 'applied-sciences', name: 'Applied Sciences', aliases: [] },
  { id: 'architecture', name: 'Architecture', aliases: [] },
  { id: 'arts', name: 'Arts', aliases: [] },
  { id: 'ayurveda', name: 'Ayurveda', aliases: [] },
  // "Bio Technology" is the official name (catalogue, pricing, subscriptions); "Biotechnology" is the variant.
  { id: 'bio-technology', name: 'Bio Technology', aliases: ['Biotechnology'] },
  { id: 'chemical-engineering', name: 'Chemical Engineering', aliases: [] },
  { id: 'chemistry', name: 'Chemistry', aliases: [] },
  // Spelt without the spaces in the quotation list and in the AI classifier before this registry existed.
  { id: 'civil-construction', name: 'Civil / Construction Engineering', aliases: ['Civil/Construction'] },
  { id: 'commerce', name: 'Commerce', aliases: [] },
  { id: 'computer-it', name: 'Computer / IT', aliases: [] },
  { id: 'dental', name: 'Dental', aliases: [] },
  { id: 'education-social-sciences', name: 'Education and Social Sciences', aliases: [] },
  { id: 'electrical-engineering', name: 'Electrical Engineering', aliases: [] },
  { id: 'electronics-telecommunication', name: 'Electronics & Telecommunication Engineering', aliases: ['Electronics & Telecom', 'Electronics and Telecom'] },
  { id: 'energy', name: 'Energy', aliases: [] },
  { id: 'law', name: 'Law', aliases: [] },
  { id: 'life-sciences', name: 'Life Sciences', aliases: [] },
  { id: 'management', name: 'Management', aliases: [] },
  { id: 'material-science', name: 'Material Science', aliases: [] },
  { id: 'mechanical-engineering', name: 'Mechanical Engineering', aliases: [] },
  // Added 2026-10-30 with Optometry & Ophthalmology, Paramedical Sciences and Radiology. No content was moved into them, and the
  // ingestion engines leave them alone until classification rules for them are approved.
  { id: 'medical-laboratory-technology', name: 'Medical Laboratory Technology', aliases: ['Medical Lab Technology'], autoIngestion: false },
  // "Medical" alone was reported as a duplicate of this department (see the audit report).
  { id: 'medical-sciences', name: 'Medical Sciences', aliases: ['Medical'] },
  { id: 'multidisciplinary', name: 'Multidisciplinary', aliases: [] },
  { id: 'nano-technology', name: 'Nano Technology', aliases: ['Nanotechnology'] },
  { id: 'nursing', name: 'Nursing', aliases: [] },
  { id: 'optometry-ophthalmology', name: 'Optometry & Ophthalmology', aliases: [], autoIngestion: false },
  { id: 'paramedical-sciences', name: 'Paramedical Sciences', aliases: ['Paramedical'], autoIngestion: false },
  { id: 'pharmacy', name: 'Pharmacy', aliases: [] },
  { id: 'physiotherapy', name: 'Physiotherapy', aliases: ['Physiotheraphy', 'Physio Therapy'] },
  { id: 'radiology', name: 'Radiology', aliases: [], autoIngestion: false },
  { id: 'science', name: 'Science', aliases: [] },
];

/** The official names, in registry order. */
export const CANONICAL_NAMES: string[] = CANONICAL_DEPARTMENTS.map((d) => d.name);

/** The departments the ingestion engines may search for and fill on their own (see `autoIngestion`). */
export const AUTO_INGEST_NAMES: string[] = CANONICAL_DEPARTMENTS.filter((d) => d.autoIngestion !== false).map((d) => d.name);
const AUTO_INGEST = new Set(AUTO_INGEST_NAMES);
export const isAutoIngested = (department: string): boolean => AUTO_INGEST.has(department);

/** A name reduced to what must match: case, spacing, "&" and "and", and spaces around "/" are not differences. */
export const departmentKey = (value: string): string =>
  value.toLowerCase().replace(/&/g, ' and ').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();

const BY_KEY = new Map<string, { dept: CanonicalDepartment; via: 'name' | 'alias' }>();
for (const dept of CANONICAL_DEPARTMENTS) {
  BY_KEY.set(departmentKey(dept.name), { dept, via: 'name' });
}
for (const dept of CANONICAL_DEPARTMENTS) {
  for (const alias of dept.aliases) {
    const key = departmentKey(alias);
    const taken = BY_KEY.get(key);
    if (taken && taken.dept !== dept) throw new Error(`department alias "${alias}" is claimed by both ${taken.dept.name} and ${dept.name}`);
    if (!taken) BY_KEY.set(key, { dept, via: 'alias' });
  }
}

export type Resolution =
  /** The value is the official name (any case, spacing or "&"/"and"), possibly after trimming. */
  | { status: 'canonical'; input: string; id: string; name: string; changed: boolean }
  /** The value is a listed alias of a department. */
  | { status: 'alias'; input: string; id: string; name: string; changed: true }
  /** The value is not recognised. Nothing is guessed; it needs a person to look at it. */
  | { status: 'unresolved'; input: string; id: null; name: null; changed: false };

/** Which department a value means: its official name, or "unresolved". */
export function resolveCanonicalDepartment(value: unknown): Resolution {
  const input = typeof value === 'string' ? value : '';
  const key = departmentKey(input);
  const hit = key ? BY_KEY.get(key) : undefined;
  if (!hit) return { status: 'unresolved', input, id: null, name: null, changed: false };
  const base = { input, id: hit.dept.id, name: hit.dept.name } as const;
  return hit.via === 'alias'
    ? { ...base, status: 'alias', changed: true }
    : { ...base, status: 'canonical', changed: input !== hit.dept.name };
}

/** The official name for a value, or null when it is not recognised. */
export const canonicalDepartmentName = (value: unknown): string | null => resolveCanonicalDepartment(value).name;

/** The official name when the value is recognised, otherwise the value as it came — for display of old records. */
export const canonicalOrSelf = (value: string): string => canonicalDepartmentName(value) ?? value;

/** Official names for a list, each department once, in the order given. Unrecognised values are kept as they are. */
export const canonicalOrSelfList = (values: string[]): string[] => [...new Set(values.map(canonicalOrSelf))];

/** Only the values that are recognised, as official names, each once. */
export const resolvedNames = (values: string[]): string[] =>
  [...new Set(values.map(canonicalDepartmentName).filter((n): n is string => !!n))];

/**
 * Every spelling to look for when a person asks for `department`: its official name, the listed
 * aliases, and any other spellings actually found in stored records (`observed`) that mean the same
 * department — "Medical sciences" is recognised without anyone having to list it. Unrecognised
 * observed values are never included. An unrecognised `department` returns just itself.
 */
export function spellingsOf(department: string, observed: Iterable<string> = []): string[] {
  const r = resolveCanonicalDepartment(department);
  if (r.status === 'unresolved') return [department];
  const dept = CANONICAL_DEPARTMENTS.find((d) => d.id === r.id)!;
  const out = new Set<string>([dept.name, ...dept.aliases]);
  for (const v of observed) if (canonicalDepartmentName(v) === dept.name) out.add(v);
  return [...out];
}

/** The same, for a list of departments (a subscription's, a filter's), each spelling once. */
export const spellingsOfAll = (departments: string[], observed: Iterable<string> = []): string[] => {
  const seen = [...observed];
  return [...new Set(departments.flatMap((d) => spellingsOf(d, seen)))];
};

/** The URL slug a department page uses today: the name, lower-cased, runs of other characters as "-". */
export const departmentSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The department a URL slug points at, or null. Accepts the public /domain/:id, the library's
 * name-derived slug, and the slug of any alias — so a link made for an older spelling keeps working
 * and lands on the one department.
 */
export function departmentFromSlug(slug: string): CanonicalDepartment | null {
  const wanted = String(slug || '').toLowerCase();
  if (!wanted) return null;
  for (const d of CANONICAL_DEPARTMENTS) {
    if (d.id === wanted || departmentSlug(d.name) === wanted || d.aliases.some((a) => departmentSlug(a) === wanted)) return d;
  }
  return null;
}

/**
 * Whether an entitlement list covers a department, comparing official names, so a subscription that
 * holds "Medical sciences" covers content filed under "Medical Sciences" and the other way round.
 * Values that are not recognised only ever match themselves (exactly, ignoring case).
 */
export function entitlementCovers(entitled: string[], department: string | null | undefined): boolean {
  if (!department) return false;
  const want = canonicalDepartmentName(department);
  return entitled.some((e) => {
    const have = canonicalDepartmentName(e);
    return want && have ? want === have : e.trim().toLowerCase() === department.trim().toLowerCase();
  });
}

/**
 * Counts keyed by stored spelling, folded into one count per department. The input is one number
 * per spelling for rows that each carry exactly one department value, so adding spellings together
 * counts every row once — nothing is counted twice. Unrecognised spellings keep their own line.
 */
export function foldCounts(rows: { name: string | null; count: number }[]): { name: string; count: number; spellings: string[] }[] {
  const out = new Map<string, { name: string; count: number; spellings: string[] }>();
  for (const { name, count } of rows) {
    if (!name) continue;
    const key = canonicalDepartmentName(name) ?? name;
    const row = out.get(key) ?? { name: key, count: 0, spellings: [] };
    row.count += count;
    if (!row.spellings.includes(name)) row.spellings.push(name);
    out.set(key, row);
  }
  return [...out.values()];
}
