import { useEffect, useState } from 'react';
import { Loader2, Mail, UserCheck, Users } from 'lucide-react';

/**
 * The people a librarian put on the library, shown inside their own row.
 *
 * A librarian registers their college and then adds their faculty and
 * students from their dashboard. On the members list those people are
 * scattered among everybody else's, so the obvious question — this librarian
 * registered, did they actually put anyone on? — could not be answered where
 * it is asked. It is answered here, under the librarian, when the row opens.
 *
 * The link is the institution: everyone on that account except the librarian
 * themselves. Loaded only when the row is opened, because most rows are not.
 */

type Member = {
  id: string; displayName: string | null; email: string; role: string;
  designation: string | null; createdAt: string;
  emailVerifiedAt: string | null; lastReadAt: string | null;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN') : null);

export function LibrarianMembers({ librarianId, institutionId, institutionName }: {
  librarianId: string; institutionId: string; institutionName?: string;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/users?institutionId=${encodeURIComponent(institutionId)}&limit=200`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (live) setMembers((d?.data || []).filter((m: Member) => m.id !== librarianId)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [institutionId, librarianId]);

  return (
    <div className="mt-6 border-t border-rule pt-6">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-2">
        <Users size={13} /> Users they added
        {members && <span className="rounded-full bg-rule px-2 py-0.5 text-[10px] text-ink-2">{members.length}</span>}
      </h4>

      {!members && !failed && (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      )}
      {failed && <p className="text-sm text-muted italic">Could not load.</p>}

      {members && members.length === 0 && (
        <p className="text-sm text-muted italic">
          No one added yet{institutionName ? ` — this is the only account at ${institutionName}` : ''}.
        </p>
      )}

      {members && members.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-rule bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Member</th>
                <th className="px-4 py-2.5 text-left">Role</th>
                <th className="px-4 py-2.5 text-left">Designation</th>
                <th className="px-4 py-2.5 text-right">Added</th>
                <th className="px-4 py-2.5 text-right">Last read</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-t border-rule-subtle">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-ink">{m.displayName || '—'}</p>
                    <p className="flex items-center gap-1 text-[11.5px] text-muted">
                      <Mail size={11} /> {m.email}
                      {m.emailVerifiedAt && <UserCheck size={11} className="text-success" />}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{m.role}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-ink-2">{m.designation || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] text-muted">{date(m.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right text-[12px]">
                    {m.lastReadAt
                      ? <span className="text-success">{date(m.lastReadAt)}</span>
                      : <span className="text-muted">Never</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 200 && (
            <p className="border-t border-rule-subtle px-4 py-2 text-[11.5px] text-muted">Showing the first 200.</p>
          )}
        </div>
      )}
    </div>
  );
}
