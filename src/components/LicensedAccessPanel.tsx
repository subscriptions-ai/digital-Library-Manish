import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Who in an institution holds a licensed subscription seat.
 *
 * One panel for both sides: a Super Admin reaches it through Manage Access on
 * any institution, a librarian through their own User Directory. The server
 * decides what each may do — this only asks and shows.
 */

type Member = {
  id: string; displayName: string | null; email: string; role: string; designation: string | null;
  lastReadAt: string | null; accessStatus: string; hasSeat: boolean; assignedAt: string | null; isBlocked: boolean;
};
type Summary = {
  managed: boolean; limit: number | null; assigned: number; available: number | null; totalMembers: number;
  full: boolean; overLimit: boolean; subscriptionActive: boolean; subscription: { name: string; endsAt: string } | null;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const nf = (x: number | null | undefined) => Number(x ?? 0).toLocaleString('en-IN');

export function LicensedAccessPanel({ base, institutionName, onChanged }: { base: string; institutionName: string; onChanged?: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ mode: 'assign' | 'revoke'; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (query = q) => {
    try {
      const res = await fetch(`${base}${query ? `?q=${encodeURIComponent(query)}` : ''}`, { headers: authHeader() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not load');
      setSummary(d.summary); setMembers(d.members);
    } catch (e: any) { toast.error(e.message || 'Could not load access'); } finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [q, base]);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${confirm.mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({ userIds: confirm.ids }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || d.error || 'Could not update access');
      setSummary(d.summary); setMembers(d.members); setPicked(new Set());
      toast.success(confirm.mode === 'assign' ? 'Access assigned' : 'Access removed');
      onChanged?.();
    } catch (e: any) { toast.error(e.message); load(); } finally { setBusy(false); setConfirm(null); }
  };

  const contactAboutSeats = () => navigate('/contact', { state: { prefill: {
    fullName: profile?.displayName || '', email: profile?.email || '', organization: institutionName,
    message: `Hello, all licensed user seats for ${institutionName} are currently assigned. We would like information about increasing our institutional user access.`,
  } } });

  if (loading) return <p className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  if (!summary) return null;
  if (!summary.managed) {
    return <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      Licensed seats have not been set up for this institution, so every member currently shares its subscription access.
    </p>;
  }

  const noSeats = (summary.available ?? 0) < 1;
  const target = confirm ? members.filter(m => confirm.ids.includes(m.id)) : [];
  const unassignedPicked = [...picked].filter(id => !members.find(m => m.id === id)?.hasSeat);
  const assignedPicked = [...picked].filter(id => members.find(m => m.id === id)?.hasSeat);
  const tone = (s: string) => s === 'Subscription Access Active' ? 'bg-emerald-50 text-emerald-700'
    : s === 'Access Not Assigned' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Total members', summary.totalMembers], ['Licensed seats', summary.limit], ['Assigned', summary.assigned], ['Available', summary.available]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
            <p className="text-xl font-bold text-slate-900">{nf(v as number)}</p>
          </div>
        ))}
      </div>
      {summary.overLimit && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Assigned users exceed the renewed subscription limit. Access is on hold until seats are removed or the limit is raised.</p>}
      {!summary.subscriptionActive && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        The institutional subscription has expired. Assignments are kept and resume when it is renewed.</p>}
      {noSeats && summary.subscriptionActive && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">No licensed seats available</p>
          <p>All licensed user seats are currently assigned.</p>
          {profile?.role === 'Institution' && (
            <button onClick={contactAboutSeats} className="mt-1 text-xs font-bold text-blue-600 underline">Contact STM Digital Library to request additional access</button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
        <button disabled={!unassignedPicked.length || !summary.subscriptionActive} onClick={() => setConfirm({ mode: 'assign', ids: unassignedPicked })}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Assign Access ({unassignedPicked.length})</button>
        <button disabled={!assignedPicked.length} onClick={() => setConfirm({ mode: 'revoke', ids: assignedPicked })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Remove Access ({assignedPicked.length})</button>
      </div>
      {unassignedPicked.length > (summary.available ?? 0) && unassignedPicked.length > 0 && (
        <p className="text-xs text-amber-700">Only {nf(summary.available)} licensed seat{summary.available === 1 ? ' is' : 's are'} available. Reduce your selection or increase the user limit.</p>
      )}

      <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left">User</th><th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Designation</th><th className="px-3 py-2 text-left">Last read</th>
              <th className="px-3 py-2 text-left">Access</th><th className="px-3 py-2 text-left">Assigned</th><th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2"><input type="checkbox" disabled={m.isBlocked} checked={picked.has(m.id)}
                  onChange={() => setPicked(p => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} /></td>
                <td className="px-3 py-2"><p className="font-semibold text-slate-800">{m.displayName || '—'}</p><p className="text-[11.5px] text-slate-500">{m.email}</p></td>
                <td className="px-3 py-2 text-[12.5px] text-slate-600">{m.role}</td>
                <td className="px-3 py-2 text-[12.5px] text-slate-600">{m.designation || '—'}</td>
                <td className="px-3 py-2 text-[12px] text-slate-500">{m.lastReadAt ? new Date(m.lastReadAt).toLocaleDateString('en-IN') : 'Never'}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone(m.accessStatus)}`}>{m.accessStatus}</span></td>
                <td className="px-3 py-2 text-[12px] text-slate-500">{m.assignedAt ? new Date(m.assignedAt).toLocaleDateString('en-IN') : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {m.hasSeat
                    ? <button onClick={() => setConfirm({ mode: 'revoke', ids: [m.id] })} className="text-xs font-bold text-slate-600 underline">Remove Access</button>
                    : <button disabled={m.isBlocked || noSeats || !summary.subscriptionActive}
                        title={noSeats ? 'No licensed seats available' : undefined}
                        onClick={() => setConfirm({ mode: 'assign', ids: [m.id] })} className="text-xs font-bold text-blue-600 underline disabled:text-slate-300 disabled:no-underline">Assign Access</button>}
                </td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-400">No members found.</td></tr>}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">{confirm.mode === 'assign' ? 'Assign subscription access' : 'Remove subscription access'}</h3>
            <p className="mt-2 text-sm text-slate-700">
              {confirm.mode === 'assign' ? 'Assign subscription access to:' : 'Remove subscription access from:'}{' '}
              <b>{target.length === 1 ? (target[0].displayName || target[0].email) : `${target.length} members`}</b>
            </p>
            <p className="text-sm text-slate-500">Institution: {institutionName}</p>
            {confirm.mode === 'assign'
              ? <p className="mt-2 text-sm text-slate-600">Current seat usage: {nf(summary.assigned)} of {nf(summary.limit)} → after assignment: {nf(summary.assigned + confirm.ids.length)} of {nf(summary.limit)}</p>
              : <p className="mt-2 text-sm text-slate-600">The user will remain linked to the institution but will no longer have institutional subscription access.</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={run} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? 'Saving…' : confirm.mode === 'assign' ? 'Assign Access' : 'Remove Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
