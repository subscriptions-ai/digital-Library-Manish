import { useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Loader2, Mail, UserCheck, Users, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { LicensedAccessPanel } from '../LicensedAccessPanel';

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
  access?: { managed: boolean; limit: number | null; assigned: number; available: number | null };
  addRestriction?: { reason: string | null; note: string | null; at: string | null; by: string | null; until: string | null } | null;
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

const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-IN') : '—');

/** Restrict (or restore) an institution's ability to add members. Nothing else about it changes. */
function RestrictionModal({ group, onClose, onDone }: { group: Group; onClose: () => void; onDone: () => void }) {
  const restoring = !!group.addRestriction;
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'manual' | 'date'>('manual');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  const submit = async () => {
    if (!restoring && !reason.trim()) { toast.error('Please give a reason'); return; }
    if (!restoring && mode === 'date' && !until) { toast.error('Choose an end date'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/institutions/${group.id}/user-addition-restriction`, {
        method: restoring ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: restoring ? undefined : JSON.stringify({ reason, note, until: mode === 'date' ? until : null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Something went wrong');
      toast.success(restoring ? 'Member addition restored' : 'User addition restricted');
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-ink">{restoring ? 'Remove restriction' : 'Restrict user addition'}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink-2"><X size={18} /></button>
        </div>
        {restoring ? (
          <>
            <p className="mt-3 text-sm font-semibold text-ink">Restore member addition for {group.name}?</p>
            <p className="mt-1 text-sm text-muted">The institution will be able to add and invite new users again.</p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-semibold text-ink">Restrict user addition for “{group.name}”?</p>
            <p className="mt-1 text-sm text-muted">
              The institution will no longer be able to add, invite or import new members. Existing users and library access will remain unaffected.
            </p>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted">Reason *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
              className="mt-1 w-full rounded-lg border border-rule p-2.5 text-sm outline-none focus:border-accent" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted">Restriction duration</p>
            <label className="mt-1 flex items-center gap-2 text-sm text-ink-2">
              <input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} /> Until manually removed
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm text-ink-2">
              <input type="radio" checked={mode === 'date'} onChange={() => setMode('date')} /> Until date
              {mode === 'date' && <input type="date" min={today} value={until} onChange={e => setUntil(e.target.value)}
                className="ml-1 rounded-md border border-rule px-2 py-1 text-sm" />}
            </label>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted">Internal note (optional, not shown to the institution)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000}
              className="mt-1 w-full rounded-lg border border-rule p-2.5 text-sm outline-none focus:border-accent" />
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-bold text-ink-2 hover:bg-surface-3">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="rounded-lg bg-caution px-4 py-2 text-sm font-bold text-surface hover:opacity-90 disabled:opacity-50">
            {busy ? 'Saving…' : restoring ? 'Remove Restriction' : 'Apply Restriction'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Set how many members may hold the institution's subscription access. Never takes access from anyone. */
function LimitModal({ group, onClose, onDone }: { group: Group; onClose: () => void; onDone: () => void }) {
  const a = group.access;
  const [limit, setLimit] = useState(String(a?.limit ?? ''));
  const [note, setNote] = useState('');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = Number(limit);
  const below = !!a?.managed && Number.isInteger(n) && n < (a?.assigned ?? 0);

  const submit = async () => {
    if (!Number.isInteger(n) || n < 1) { toast.error('Enter a whole number, at least 1'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/institutions/${group.id}/licensed-limit`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ limit: n, note, keepCurrentMembers: !a?.managed && keep }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not update the limit');
      toast.success(d.seeded ? `Limit set; ${d.seeded} current members kept access` : 'Limit updated');
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-ink">Set user limit</h3>
          <button onClick={onClose} className="text-muted hover:text-ink-2"><X size={18} /></button>
        </div>
        <p className="mt-2 text-sm text-ink-2">Institution: <b>{group.name}</b></p>
        <p className="text-sm text-muted">Current licensed users: {a?.managed ? a.limit : 'not set — all members share the subscription'}</p>
        <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted">New licensed user limit</label>
        <input type="number" min={1} step={1} value={limit} onChange={e => setLimit(e.target.value)}
          className="mt-1 w-full rounded-lg border border-rule p-2.5 text-sm outline-none focus:border-accent" />
        {below && <p className="mt-2 text-sm text-caution">{a!.assigned} users currently have access, which exceeds the new limit of {n}. Remove access from at least {a!.assigned - n} first.</p>}
        {!a?.managed && (
          <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" className="mt-1" checked={keep} onChange={e => setKeep(e.target.checked)} />
            <span>Keep access for current members, up to the limit (librarian first, then those who have read). If unticked, nobody has access until seats are assigned.</span>
          </label>
        )}
        <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted">Internal note (optional)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500}
          className="mt-1 w-full rounded-lg border border-rule p-2.5 text-sm outline-none focus:border-accent" />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-bold text-ink-2">Cancel</button>
          <button onClick={submit} disabled={busy || below} className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-surface disabled:opacity-50">
            {busy ? 'Saving…' : 'Update Limit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ group, open, onToggle, canRestrict, onChanged }: {
  group: Group; open: boolean; onToggle: () => void; canRestrict: boolean; onChanged: () => void;
}) {
  const [modal, setModal] = useState(false);
  const [limitModal, setLimitModal] = useState(false);
  const [manage, setManage] = useState(false);
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
      .catch(() => toast.error('Could not load members'))
      .finally(() => setLoading(false));
  }, [open, group, members]);

  const head = group.librarians?.[0];

  return (
    <div className="border-b border-rule-subtle last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-hover">
        <span className="text-muted">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          group.kind === 'institution' ? 'bg-accent-soft text-accent' : 'bg-caution-soft text-caution'}`}>
          <Building2 size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-bold text-ink">{group.name}</span>
            {group.access?.managed && (
              <span className="shrink-0 rounded-full border border-rule-2 bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-2">
                {group.access.assigned} / {group.access.limit}{group.access.available === 0 ? ' · Full' : ''}
              </span>
            )}
            {group.addRestriction && (
              <span className="shrink-0 rounded-full border border-caution bg-caution-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-caution">
                User addition restricted
              </span>
            )}
          </span>
          <span className="block truncate text-[11.5px] text-muted">
            {group.kind === 'institution'
              ? (head
                ? <>Librarian: <b className="text-ink-2">{head.name || head.email}</b></>
                : 'no librarian account — members are attached directly')
              : 'typed the name; not linked to an institution'}
          </span>
        </span>
        <span className="hidden shrink-0 gap-6 text-right sm:flex">
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Members</span>
            <span className="block font-bold text-ink">{n(group.members)}</span>
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Read</span>
            <span className="block font-bold text-success">{n(group.readers)}</span>
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Verified</span>
            <span className="block font-semibold text-ink-2">{n(group.verified)}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="bg-surface-2 px-5 pb-5 pt-1">
          {group.kind === 'institution' && group.access && (
            <div className="mb-3 rounded-xl border border-rule bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Subscription access</p>
              {group.access.managed ? (
                <p className="mt-1 text-[12.5px] text-ink-2">
                  <b>{n(group.members)}</b> members · <b>{n(group.access.limit || 0)}</b> licensed · <b>{n(group.access.assigned)}</b> assigned · <b>{n(group.access.available || 0)}</b> available
                  {group.access.available === 0 && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-2">FULL</span>}
                </p>
              ) : <p className="mt-1 text-[12.5px] text-muted">Not set up — every member shares the institution's subscription.</p>}
              <div className="mt-2 flex gap-2">
                {group.access.managed && <button onClick={() => setManage(true)} className="rounded-lg border border-rule-2 px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-surface-hover">Manage Access</button>}
                {canRestrict && <button onClick={() => setLimitModal(true)} className="rounded-lg border border-rule-2 px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-surface-hover">Set User Limit</button>}
              </div>
            </div>
          )}
          {limitModal && <LimitModal group={group} onClose={() => setLimitModal(false)} onDone={() => { setLimitModal(false); onChanged(); }} />}
          {manage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => { setManage(false); onChanged(); }}>
              <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-surface p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between">
                  <h3 className="text-lg font-bold text-ink">Manage access — {group.name}</h3>
                  <button onClick={() => { setManage(false); onChanged(); }} className="text-muted hover:text-ink-2"><X size={18} /></button>
                </div>
                <LicensedAccessPanel base={`/api/admin/institutions/${group.id}/access`} institutionName={group.name} />
              </div>
            </div>
          )}
          {group.kind === 'institution' && (group.addRestriction || canRestrict) && (
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-rule bg-surface p-3">
              {group.addRestriction ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
                  <dt className="text-muted">Restriction</dt><dd className="font-semibold text-caution">User Addition Restricted</dd>
                  <dt className="text-muted">Reason</dt><dd className="text-ink-2">{group.addRestriction.reason || '—'}</dd>
                  <dt className="text-muted">Restricted on</dt><dd className="text-ink-2">{when(group.addRestriction.at)}</dd>
                  <dt className="text-muted">Restricted by</dt><dd className="text-ink-2">{group.addRestriction.by || '—'}</dd>
                  <dt className="text-muted">Until</dt><dd className="text-ink-2">{group.addRestriction.until ? when(group.addRestriction.until) : 'Until manually removed'}</dd>
                  {group.addRestriction.note && (<><dt className="text-muted">Internal note</dt><dd className="text-ink-2">{group.addRestriction.note}</dd></>)}
                </dl>
              ) : (
                <p className="text-[12.5px] text-muted">Members can be added by this institution.</p>
              )}
              {canRestrict && (
                <button onClick={() => setModal(true)}
                  className="shrink-0 rounded-lg border border-caution bg-caution-soft px-3 py-1.5 text-xs font-bold text-caution hover:bg-caution-soft">
                  {group.addRestriction ? 'Remove Restriction' : 'Restrict User Addition'}
                </button>
              )}
            </div>
          )}
          {modal && <RestrictionModal group={group} onClose={() => setModal(false)} onDone={() => { setModal(false); onChanged(); }} />}
          {loading && <p className="flex items-center gap-2 py-4 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading…</p>}
          {members && members.length === 0 && <p className="py-4 text-sm text-muted">No members.</p>}
          {members && members.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-rule bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Member</th>
                    <th className="px-4 py-2.5 text-left">Role</th>
                    <th className="px-4 py-2.5 text-left">Designation</th>
                    <th className="px-4 py-2.5 text-right">Joined</th>
                    <th className="px-4 py-2.5 text-right">Last read</th>
                  </tr>
                </thead>
                <tbody>
                  {/* The librarian first: the account the rest hang off. */}
                  {[...members].sort((a, b) =>
                    (a.role === 'Institution' ? 0 : 1) - (b.role === 'Institution' ? 0 : 1)
                    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  ).map(m => (
                    <tr key={m.id} className="border-t border-rule-subtle">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-ink">{m.displayName || '—'}</p>
                        <p className="flex items-center gap-1 text-[11.5px] text-muted">
                          <Mail size={11} /> {m.email}
                          {m.emailVerifiedAt && <UserCheck size={11} className="text-success" />}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          m.role === 'Institution' ? 'bg-info-soft text-accent' : 'bg-surface-2 text-ink-2'}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12.5px] text-ink-2">{m.designation || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-muted">
                        {new Date(m.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[12px]">
                        {m.lastReadAt
                          ? <span className="text-success">{new Date(m.lastReadAt).toLocaleDateString('en-IN')}</span>
                          : <span className="text-muted">Never</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {members.length === 200 && (
                <p className="border-t border-rule-subtle px-4 py-2 text-[11.5px] text-muted">
                  Showing the first 200.
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
  const { profile } = useAuth();
  const canRestrict = profile?.role === 'SuperAdmin';

  const load = () => {
    fetch('/api/admin/users/by-institution', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setBoard)
      .catch(() => toast.error('Could not load institutions'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <p className="flex items-center gap-2 py-10 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</p>;
  if (!board) return null;

  const t = board.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Institutions', t.institutions, 'with members'],
          ['In institutions', t.inInstitutions, 'linked to an account'],
          ['Typed a name', t.typed, 'not linked'],
          ['Solo', t.solo, 'no institution'],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="rounded-2xl border border-rule bg-surface p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold text-ink">{n(value as number)}</p>
            <p className="text-[11px] text-muted">{hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
        <p className="flex items-center gap-2 border-b border-rule-subtle bg-surface-2 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted">
          <Users size={14} /> Institution accounts
        </p>
        {board.groups.length === 0 && <p className="px-5 py-6 text-sm text-muted">None yet.</p>}
        {board.groups.map(g => (
          <Row key={keyOf(g)} group={g} open={open === keyOf(g)} canRestrict={canRestrict} onChanged={load}
            onToggle={() => setOpen(open === keyOf(g) ? null : keyOf(g))} />
        ))}
      </div>

      {board.typed.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-caution/40 bg-surface">
          <div className="border-b border-caution/30 bg-caution-soft px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-caution">Not linked to an institution</p>
            <p className="mt-0.5 text-[12px] text-caution">
              They typed their college's name when registering but are not linked to any institution account.
            </p>
          </div>
          {board.typed.map(g => (
            <Row key={keyOf(g)} group={g} open={open === keyOf(g)} canRestrict={false} onChanged={load}
              onToggle={() => setOpen(open === keyOf(g) ? null : keyOf(g))} />
          ))}
        </div>
      )}
    </div>
  );
}
