import { useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Loader2, Mail, UserCheck, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * The members, gathered under the institution they belong to.
 *
 * A librarian registers and then adds their faculty and students; on the flat
 * list those people sit wherever the sort put them, so "who is on the SMG
 * Institute account, and did any of them read anything" takes scrolling to
 * answer. Here the institution is the row, its librarian is named on it, and
 * its people are underneath.
 *
 * Institutions we hold a record for come first. Under them are the people who
 * typed the name of their college on the way in without ever being attached to
 * one — a real state of the data, and worth seeing rather than hiding.
 */

type Group = {
  kind: 'institution' | 'typed';
  id: string | null; name: string; status?: string;
  members: number; verified: number; readers: number;
  librarians?: { id: string; name: string; email: string; designation: string | null; hasRead: boolean }[];
};
type Board = {
  groups: Group[]; typed: Group[]; solo: number;
  totals: { institutions: number; inInstitutions: number; typed: number; solo: number };
};
type Member = {
  id: string; displayName: string | null; email: string; role: string;
  designation: string | null; contact: string | null; state: string | null;
  createdAt: string; emailVerifiedAt: string | null; lastReadAt: string | null;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const n = (x: number) => Number(x || 0).toLocaleString('en-IN');
const keyOf = (g: Group) => (g.kind === 'institution' ? `i:${g.id}` : `o:${g.name}`);

function Row({ group, open, onToggle }: { group: Group; open: boolean; onToggle: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || members) return;
    setLoading(true);
    const q = group.kind === 'institution'
      ? `institutionId=${encodeURIComponent(group.id || 'none')}`
      : `org=${encodeURIComponent(group.name)}`;
    fetch(`/api/admin/users?${q}&limit=200`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setMembers(d?.data || []))
      .catch(() => toast.error('Members load nahi hue'))
      .finally(() => setLoading(false));
  }, [open, group, members]);

  const head = group.librarians?.[0];

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50">
        <span className="text-slate-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          group.kind === 'institution' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
          <Building2 size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-slate-900">{group.name}</span>
          <span className="block truncate text-[11.5px] text-slate-500">
            {group.kind === 'institution'
              ? (head
                ? <>Librarian: <b className="text-slate-600">{head.name || head.email}</b></>
                : 'koi librarian account nahi — sidha jude hue hain')
              : 'naam type kiya hai, institution se juda nahi'}
          </span>
        </span>
        <span className="hidden shrink-0 gap-6 text-right sm:flex">
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Members</span>
            <span className="block font-bold text-slate-900">{n(group.members)}</span>
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Read</span>
            <span className="block font-bold text-emerald-600">{n(group.readers)}</span>
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified</span>
            <span className="block font-semibold text-slate-600">{n(group.verified)}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="bg-slate-50/70 px-5 pb-5 pt-1">
          {loading && <p className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Loading…</p>}
          {members && members.length === 0 && <p className="py-4 text-sm text-slate-400">Koi member nahi.</p>}
          {members && members.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Member</th>
                    <th className="px-4 py-2.5 text-left">Role</th>
                    <th className="px-4 py-2.5 text-left">Designation</th>
                    <th className="px-4 py-2.5 text-right">Joined</th>
                    <th className="px-4 py-2.5 text-right">Padha</th>
                  </tr>
                </thead>
                <tbody>
                  {/* The librarian first: the account the rest hang off. */}
                  {[...members].sort((a, b) =>
                    (a.role === 'Institution' ? 0 : 1) - (b.role === 'Institution' ? 0 : 1)
                    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  ).map(m => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-800">{m.displayName || '—'}</p>
                        <p className="flex items-center gap-1 text-[11.5px] text-slate-500">
                          <Mail size={11} /> {m.email}
                          {m.emailVerifiedAt && <UserCheck size={11} className="text-emerald-600" />}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          m.role === 'Institution' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12.5px] text-slate-600">{m.designation || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[12px]">
                        {m.lastReadAt
                          ? <span className="text-emerald-600">{new Date(m.lastReadAt).toLocaleDateString('en-IN')}</span>
                          : <span className="text-slate-400">nahi</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {members.length === 200 && (
                <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-400">
                  Pehle 200 dikhaye ja rahe hain.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UsersByInstitution() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/users/by-institution', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setBoard)
      .catch(() => toast.error('Institutions load nahi hue'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>;
  if (!board) return null;

  const t = board.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Institutions', t.institutions, 'jinke members hain'],
          ['In institutions', t.inInstitutions, 'kisi account se jude'],
          ['Naam type kiya', t.typed, 'juda nahi hai'],
          ['Akele', t.solo, 'koi institution nahi'],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{n(value as number)}</p>
            <p className="text-[11px] text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <p className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Users size={14} /> Institution accounts
        </p>
        {board.groups.length === 0 && <p className="px-5 py-6 text-sm text-slate-400">Abhi koi nahi.</p>}
        {board.groups.map(g => (
          <Row key={keyOf(g)} group={g} open={open === keyOf(g)}
            onToggle={() => setOpen(open === keyOf(g) ? null : keyOf(g))} />
        ))}
      </div>

      {board.typed.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Institution se jude nahi</p>
            <p className="mt-0.5 text-[12px] text-amber-700/80">
              Inhone register karte waqt college ka naam likha tha, lekin kisi institution account se link nahi hain.
            </p>
          </div>
          {board.typed.map(g => (
            <Row key={keyOf(g)} group={g} open={open === keyOf(g)}
              onToggle={() => setOpen(open === keyOf(g) ? null : keyOf(g))} />
          ))}
        </div>
      )}
    </div>
  );
}
