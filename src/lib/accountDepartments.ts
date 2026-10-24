/**
 * What the Super Admin's account screen says about an account's departments, decided from the server's entitlement inspector.
 * Pure, so the wording rules can be tested without a browser. Nothing here widens a list: a missing list is "none recorded", never "all".
 */
export type DepartmentInspection = {
  selectedDepartments: string[];
  effectiveDepartments: string[] | 'ALL_DEPARTMENTS';
  effectiveAll?: boolean;
  departmentSource: 'registration' | 'subscription' | 'institution' | 'all-domains-plan' | 'staff' | 'none';
  isInstitutionMember: boolean;
  institutionName: string | null;
  recordedSelection?: number;
};

export type DepartmentView = {
  /** The account's own pick (registration), or null when the account is a member and has none of its own to show. */
  selected: { names: string[]; legacy: boolean } | null;
  /** What the account may open now; shown only when it adds something the selection does not already say. */
  access: { label: string; names: string[]; all: boolean; inheritedFrom: string | null } | null;
};

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

export function departmentView(d: DepartmentInspection): DepartmentView {
  const all = d.effectiveAll === true || d.effectiveDepartments === 'ALL_DEPARTMENTS';
  const effective = Array.isArray(d.effectiveDepartments) ? d.effectiveDepartments : [];
  const sel = d.selectedDepartments || [];

  // A member's departments are the institution's. Never call them the member's own choice; show the member's own pick only if there is one.
  if (d.isInstitutionMember) {
    return {
      selected: sel.length ? { names: sel, legacy: false } : null,
      access: { label: 'Access departments', names: effective, all, inheritedFrom: d.institutionName || 'their institution' },
    };
  }

  const selected = { names: sel, legacy: !sel.length && !(d.recordedSelection && d.recordedSelection > 0) };
  // Identical to the selection: one block is enough. Different (a plan adds or removes departments, or covers everything): show both.
  const identical = !all && same(sel, effective);
  if (identical || d.departmentSource === 'staff') {
    return { selected, access: d.departmentSource === 'staff' ? { label: 'Effective access', names: [], all: true, inheritedFrom: null } : null };
  }
  return { selected, access: { label: 'Effective access', names: effective, all, inheritedFrom: null } };
}
