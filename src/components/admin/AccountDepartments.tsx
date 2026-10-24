import React, { useEffect, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { departmentView, type DepartmentInspection } from '../../lib/accountDepartments';

const SOURCE_NOTE: Record<string, string> = {
  registration: 'Chosen at registration (free preview)',
  subscription: 'From the account’s subscription',
  institution: 'From the institution’s departments',
  'all-domains-plan': 'An explicit All Domains plan',
  staff: 'Staff account',
  none: 'No access recorded',
};

function Chips({ names }: { names: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((n) => (
        <li key={n} className="max-w-full break-words rounded-lg border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2">{n}</li>
      ))}
    </ul>
  );
}

function Block({ title, count, note, children }: { title: string; count?: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h5 className="text-[11px] font-bold uppercase tracking-widest text-ink-2">{title}</h5>
        {count && <span className="text-xs font-semibold text-muted">{count}</span>}
      </div>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      {children}
    </div>
  );
}

/**
 * The departments of one account, as the server's entitlement inspector reports them. Fetched when the row is opened, one account at a
 * time — never for the whole table. The list is always the account's own data; there is no "all departments" fallback.
 */
export function AccountDepartments({ userId }: { userId: string }) {
  const [data, setData] = useState<DepartmentInspection | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setFailed(false);
    fetch(`/api/admin/users/${encodeURIComponent(userId)}/entitlement`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setData(j))
      .catch((e) => { if (e?.name !== 'AbortError') setFailed(true); });
    return () => ctl.abort();
  }, [userId]);

  return (
    <div className="mt-6 border-t border-rule pt-5" data-testid="account-departments">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2">
        <GraduationCap size={13} /> Departments
      </h4>
      {failed ? (
        <p className="text-sm italic text-muted">Could not load this account’s departments.</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading departments…</p>
      ) : (() => {
        const v = departmentView(data);
        return (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {v.selected && (
              <Block title="Selected departments" count={v.selected.names.length ? `${v.selected.names.length} selected` : undefined}
                note={!v.selected.names.length ? undefined : data.isInstitutionMember ? 'Chosen by this person at sign-up. It does not widen their access.' : v.access ? undefined : SOURCE_NOTE[data.departmentSource]}>
                {v.selected.names.length ? <Chips names={v.selected.names} /> : (
                  <>
                    <p className="text-sm italic text-muted">No departments recorded</p>
                    {v.selected.legacy && <p className="mt-1 text-xs text-muted">Legacy account — department selection was not recorded.</p>}
                  </>
                )}
              </Block>
            )}
            {v.access && (
              <Block title={v.access.label}
                count={v.access.all ? 'All departments' : `${v.access.names.length} department${v.access.names.length === 1 ? '' : 's'}`}
                note={v.access.inheritedFrom ? `Inherited from ${v.access.inheritedFrom}` : SOURCE_NOTE[data.departmentSource]}>
                {v.access.all ? <p className="text-sm text-ink-2">Every department in the library.</p>
                  : v.access.names.length ? <Chips names={v.access.names} />
                  : <p className="text-sm italic text-muted">No departments recorded</p>}
              </Block>
            )}
          </div>
        );
      })()}
    </div>
  );
}
