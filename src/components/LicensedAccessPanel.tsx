import { useCallback, useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Dialog, EmptyState, Spinner, friendlyError } from './ui';

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
    } catch (e: any) { toast.error(friendlyError(e, 'Could not load licensed access. Please try again.')); } finally { setLoading(false); }
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
    } catch (e: any) { toast.error(friendlyError(e, 'Could not update access. Please try again.')); load(); } finally { setBusy(false); setConfirm(null); }
  };

  const contactAboutSeats = () => navigate('/contact', { state: { prefill: {
    fullName: profile?.displayName || '', email: profile?.email || '', organization: institutionName,
    message: `Hello, all licensed user seats for ${institutionName} are currently assigned. We would like information about increasing our institutional user access.`,
  } } });

  // Stable, so the Dialog does not re-run its focus handling on every render.
  const closeConfirm = useCallback(() => setConfirm(null), []);

  if (loading) return <div className="py-6"><Spinner /></div>;
  if (!summary) return null;
  if (!summary.managed) {
    return <p className="rounded-xl border border-rule bg-surface-2 p-4 text-sm text-ink-2">
      Licensed seats have not been set up for this institution, so every member currently shares its subscription access.
    </p>;
  }

  const noSeats = (summary.available ?? 0) < 1;
  const target = confirm ? members.filter(m => confirm.ids.includes(m.id)) : [];
  const unassignedPicked = [...picked].filter(id => !members.find(m => m.id === id)?.hasSeat);
  const assignedPicked = [...picked].filter(id => members.find(m => m.id === id)?.hasSeat);
  const tone = (s: string) => s === 'Subscription Access Active' ? 'badge-success'
    : s === 'Access Not Assigned' ? 'badge-neutral' : 'badge-caution';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Total members', summary.totalMembers], ['Licensed seats', summary.limit], ['Assigned', summary.assigned], ['Available', summary.available]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-rule bg-surface p-3">
            <p className="metric-label">{l}</p>
            {/* A count that did not come back is a dash, not a misleading 0. */}
            <p className="text-xl font-bold tabular-nums text-ink">{v == null ? '—' : nf(v as number)}</p>
          </div>
        ))}
      </div>
      {summary.overLimit && <p role="alert" className="rounded-xl border border-caution/40 bg-caution-soft p-3 text-sm text-ink">
        Assigned users exceed the renewed subscription limit. Access is on hold until seats are removed or the limit is raised.</p>}
      {!summary.subscriptionActive && <p className="rounded-xl border border-caution/40 bg-caution-soft p-3 text-sm text-ink">
        <span className="font-semibold">Subscription Expired. </span>
        The institutional subscription has expired. Assignments are kept and resume when it is renewed.</p>}
      {noSeats && summary.subscriptionActive && (
        <div className="rounded-xl border border-rule bg-surface-2 p-3 text-sm text-ink-2">
          <p className="font-semibold text-ink">All Licensed Seats Assigned</p>
          <p>All licensed user seats are currently assigned.</p>
          {profile?.role === 'Institution' && (
            <button type="button" onClick={contactAboutSeats} className="mt-1 text-sm font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">Contact STM Digital Library to request additional access</button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <label htmlFor="licensed-access-search" className="sr-only">Search name or email</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input id="licensed-access-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email…"
            className="input pl-9" />
        </div>
        <Button size="sm" disabled={!unassignedPicked.length || !summary.subscriptionActive} onClick={() => setConfirm({ mode: 'assign', ids: unassignedPicked })}>
          Assign Access ({unassignedPicked.length})</Button>
        <Button size="sm" variant="outline" disabled={!assignedPicked.length} onClick={() => setConfirm({ mode: 'revoke', ids: assignedPicked })}>
          Remove Access ({assignedPicked.length})</Button>
      </div>
      {unassignedPicked.length > (summary.available ?? 0) && unassignedPicked.length > 0 && (
        <p className="text-sm text-caution">Only {nf(summary.available)} licensed seat{summary.available === 1 ? ' is' : 's are'} available. Reduce your selection or increase the user limit.</p>
      )}

      <div className="table-wrap max-h-[50vh] overflow-y-auto rounded-xl border border-rule bg-surface">
        <table className="data-table min-w-[760px]">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className="w-8"><span className="sr-only">Select</span></th>
              <th className="text-left">User</th><th className="text-left">Role</th>
              <th className="text-left">Designation</th><th className="text-left">Last read</th>
              <th className="text-left">Access</th><th className="text-left">Assigned</th><th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} aria-selected={picked.has(m.id) || undefined}>
                <td><input type="checkbox" disabled={m.isBlocked} checked={picked.has(m.id)}
                  aria-label={`Select ${m.displayName || m.email}`}
                  className="h-4 w-4 accent-[var(--accent)]"
                  onChange={() => setPicked(p => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} /></td>
                <td><p className="font-semibold text-ink">{m.displayName || '—'}</p><p className="text-xs text-muted">{m.email}</p></td>
                <td>{m.role}</td>
                <td>{m.designation || '—'}</td>
                <td className="whitespace-nowrap text-muted">{m.lastReadAt ? new Date(m.lastReadAt).toLocaleDateString('en-IN') : 'Never'}</td>
                <td><span className={`badge ${tone(m.accessStatus)}`}>{m.accessStatus}</span></td>
                <td className="whitespace-nowrap text-muted">{m.assignedAt ? new Date(m.assignedAt).toLocaleDateString('en-IN') : '—'}</td>
                <td className="text-right">
                  {m.hasSeat
                    ? <button type="button" onClick={() => setConfirm({ mode: 'revoke', ids: [m.id] })} className="whitespace-nowrap text-xs font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Remove Access</button>
                    : <button type="button" disabled={m.isBlocked || noSeats || !summary.subscriptionActive}
                        title={noSeats ? 'No licensed seats available' : undefined}
                        onClick={() => setConfirm({ mode: 'assign', ids: [m.id] })} className="whitespace-nowrap text-xs font-semibold text-accent underline underline-offset-2 hover:text-accent-hover disabled:cursor-not-allowed disabled:text-faint disabled:no-underline">Assign Access</button>}
                </td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={8}><EmptyState icon={Users} title="No members found." className="py-8" /></td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!confirm}
        onClose={closeConfirm}
        size="sm"
        title={confirm?.mode === 'assign' ? 'Assign subscription access' : 'Remove subscription access'}
        footer={<>
          <Button variant="outline" onClick={closeConfirm} disabled={busy}>Cancel</Button>
          <Button onClick={run} loading={busy}>
            {busy ? 'Saving…' : confirm?.mode === 'assign' ? 'Assign Access' : 'Remove Access'}
          </Button>
        </>}
      >
        {confirm && (
          <div className="space-y-2 text-sm">
            <p className="text-ink-2">
              {confirm.mode === 'assign' ? 'Assign subscription access to:' : 'Remove subscription access from:'}{' '}
              <b className="text-ink">{target.length === 1 ? (target[0].displayName || target[0].email) : `${target.length} members`}</b>
            </p>
            <p className="text-muted">Institution: {institutionName}</p>
            {confirm.mode === 'assign'
              ? <p className="text-ink-2">Current seat usage: {nf(summary.assigned)} of {nf(summary.limit)} → after assignment: {nf(summary.assigned + confirm.ids.length)} of {nf(summary.limit)}</p>
              : <p className="text-ink-2">The user will remain linked to the institution but will no longer have institutional subscription access.</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
