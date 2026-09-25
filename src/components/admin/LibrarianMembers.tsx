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
    <div className="mt-6 border-t border-slate-200 pt-6">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-600">
        <Users size={13} /> Inhone jo users add kiye
        {members && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">{members.length}</span>}
      </h4>

      {!members && !failed && (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      )}
      {failed && <p className="text-sm text-slate-400 italic">Load nahi hue.</p>}

      {members && members.length === 0 && (
        <p className="text-sm text-slate-400 italic">
          Abhi tak kisi ko add nahi kiya{institutionName ? ` — ${institutionName} par sirf yahi account hai` : ''}.
        </p>
      )}

      {members && members.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5 text-left">Member</th>
                <th className="px-4 py-2.5 text-left">Role</th>
                <th className="px-4 py-2.5 text-left">Designation</th>
                <th className="px-4 py-2.5 text-right">Added</th>
                <th className="px-4 py-2.5 text-right">Padha</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-800">{m.displayName || '—'}</p>
                    <p className="flex items-center gap-1 text-[11.5px] text-slate-500">
                      <Mail size={11} /> {m.email}
                      {m.emailVerifiedAt && <UserCheck size={11} className="text-emerald-600" />}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{m.role}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-slate-600">{m.designation || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] text-slate-500">{date(m.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right text-[12px]">
                    {m.lastReadAt
                      ? <span className="text-emerald-600">{date(m.lastReadAt)}</span>
                      : <span className="text-slate-400">nahi</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 200 && (
            <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-400">Pehle 200 dikhaye ja rahe hain.</p>
          )}
        </div>
      )}
    </div>
  );
}
