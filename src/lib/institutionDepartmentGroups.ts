/**
 * How departments are grouped on the screens where an institution chooses them.
 *
 * A Subject Group is a way to FIND departments, nothing more. It is never sold, never priced and
 * never stored: the department is still the subscription, pricing, quotation and access unit, and
 * every screen that uses these groups hands the same flat list of department names to the same
 * pricing code it always used. "Select all" in a group simply ticks that group's departments.
 *
 * This file is the single place the grouping lives. The names are the registry's official names
 * (`departmentRegistry.ts`, which equals `DOMAINS` in constants.ts); `scripts/test-department-groups.ts`
 * fails if a department is missing, repeated or invented. A department added to the catalogue and not yet
 * placed here still shows up, under "Other departments", so it can never become unselectable.
 */

import { canonicalOrSelf, canonicalOrSelfList } from './departmentRegistry';

export type DepartmentGroup = {
  id: string;
  name: string;
  departments: string[];
};

export const INSTITUTION_DEPARTMENT_GROUPS: DepartmentGroup[] = [
  {
    id: 'engineering-technology',
    name: 'Engineering & Technology',
    departments: [
      'Applied Mechanics', 'Chemical Engineering', 'Civil / Construction Engineering', 'Computer / IT',
      'Electrical Engineering', 'Electronics & Telecommunication Engineering', 'Energy',
      'Material Science', 'Mechanical Engineering', 'Nano Technology',
    ],
  },
  {
    id: 'medical-health-sciences',
    name: 'Medical & Health Sciences',
    departments: [
      'Ayurveda', 'Dental', 'Medical Laboratory Technology', 'Medical Sciences', 'Nursing', 'Optometry & Ophthalmology',
      'Paramedical Sciences', 'Pharmacy', 'Physiotherapy', 'Radiology',
    ],
  },
  {
    id: 'life-sciences-biotechnology',
    name: 'Life Sciences & Biotechnology',
    departments: ['Bio Technology', 'Life Sciences'],
  },
  {
    id: 'science-applied-sciences',
    name: 'Science & Applied Sciences',
    departments: ['Applied Sciences', 'Chemistry', 'Science'],
  },
  {
    id: 'business-management',
    name: 'Business & Management',
    departments: ['Commerce', 'Management'],
  },
  {
    id: 'social-sciences-education-humanities',
    name: 'Social Sciences, Education & Humanities',
    departments: ['Arts', 'Education and Social Sciences', 'Law'],
  },
  {
    id: 'agriculture-allied-sciences',
    name: 'Agriculture & Allied Sciences',
    departments: ['Agriculture'],
  },
  {
    id: 'architecture-built-environment',
    name: 'Architecture & Built Environment',
    departments: ['Architecture'],
  },
  {
    id: 'multidisciplinary',
    name: 'Multidisciplinary',
    departments: ['Multidisciplinary'],
  },
];

/** Where a department goes when no group above claims it. */
export const OTHER_GROUP_ID = 'other-departments';
export const OTHER_GROUP_NAME = 'Other departments';

/** Every department named in the groups, in group order — the list quotations are written against. */
export const GROUPED_DEPARTMENTS: string[] = INSTITUTION_DEPARTMENT_GROUPS.flatMap((g) => g.departments);

/** A department name as the registry spells it. Unrecognised names come back unchanged. */
export const canonicalDepartment = canonicalOrSelf;

/** A list of department names as the registry spells them, each once, in the order given. */
export const canonicalDepartments = canonicalOrSelfList;

/**
 * The groups to show for `departments` (the names this screen may offer): each group keeps only the
 * departments on offer, empty groups drop out, and anything on offer that no group claims is
 * collected under "Other departments" at the end.
 */
export function groupsFor(departments: string[]): DepartmentGroup[] {
  const offered = new Set(departments);
  const placed = new Set<string>();
  const groups: DepartmentGroup[] = [];
  for (const g of INSTITUTION_DEPARTMENT_GROUPS) {
    const kept = g.departments.filter((d) => offered.has(d));
    kept.forEach((d) => placed.add(d));
    if (kept.length) groups.push({ ...g, departments: kept });
  }
  const rest = departments.filter((d) => !placed.has(d));
  if (rest.length) groups.push({ id: OTHER_GROUP_ID, name: OTHER_GROUP_NAME, departments: [...new Set(rest)] });
  return groups;
}

export type GroupState = 'none' | 'some' | 'all';

/** Whether none, some or all of the departments in `choosable` are selected. */
export function groupState(choosable: string[], selected: string[]): GroupState {
  if (!choosable.length) return 'none';
  const chosen = new Set(selected);
  const n = choosable.filter((d) => chosen.has(d)).length;
  return n === 0 ? 'none' : n === choosable.length ? 'all' : 'some';
}

/**
 * The selection after "Select all" is ticked on a group (`on`) or cleared. Only `choosable`
 * departments are touched; everything else the person picked, in any group, is kept in its place,
 * and newly added departments follow in group order.
 */
export function setGroup(selected: string[], choosable: string[], on: boolean): string[] {
  if (!on) {
    const drop = new Set(choosable);
    return selected.filter((d) => !drop.has(d));
  }
  const have = new Set(selected);
  return [...selected, ...choosable.filter((d) => !have.has(d))];
}

/** The selection after one department is ticked or unticked. */
export function setDepartment(selected: string[], name: string, on: boolean): string[] {
  const has = selected.includes(name);
  if (on) return has ? selected : [...selected, name];
  return has ? selected.filter((d) => d !== name) : selected;
}

/**
 * What a search leaves visible. A match on the group's name keeps the whole group (someone typing
 * "medical" wants that group); otherwise only the departments whose own name matches stay. Returns
 * groups with their visible departments and whether that is the group's full list.
 */
export function filterGroups(groups: DepartmentGroup[], query: string): { group: DepartmentGroup; visible: string[]; complete: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups.map((group) => ({ group, visible: group.departments, complete: true }));
  const out: { group: DepartmentGroup; visible: string[]; complete: boolean }[] = [];
  for (const group of groups) {
    if (group.name.toLowerCase().includes(q)) { out.push({ group, visible: group.departments, complete: true }); continue; }
    const visible = group.departments.filter((d) => d.toLowerCase().includes(q));
    if (visible.length) out.push({ group, visible, complete: visible.length === group.departments.length });
  }
  return out;
}

/** The selected departments sorted into their groups, for the summary. Groups with none are left out. */
export function summariseSelection(groups: DepartmentGroup[], selected: string[]): { group: DepartmentGroup; picked: string[] }[] {
  const chosen = new Set(selected);
  return groups
    .map((group) => ({ group, picked: group.departments.filter((d) => chosen.has(d)) }))
    .filter((x) => x.picked.length > 0);
}
