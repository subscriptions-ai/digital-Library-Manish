import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Users, UserCog } from 'lucide-react';
import { Button, Dialog, Field } from '../ui';

/**
 * Account credentials in Admin: the reset-password dialog, the "confirm your password" step for the most sensitive actions, and the
 * account summary. No screen here ever receives or shows an existing password or its hash; there is nothing to reveal, because only
 * the hash is stored. A password typed here lives in this component's state until the dialog closes, and is then cleared.
 */

export const PASSWORD_MIN = 8;
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', ...auth() });

/** Asks the acting Super Admin for their own password. Declared at module level so typing never remounts the field. */
function ReauthDialog({ open, failed, onSubmit, onCancel }: { open: boolean; failed: boolean; onSubmit: (pw: string) => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  useEffect(() => { if (!open) setPw(''); }, [open]);
  return (
    <Dialog open={open} onClose={onCancel} size="sm" title="Confirm it's you"
      description="This changes another Super Admin's sign-in or access. Enter your own password to continue."
      footer={<>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => pw && onSubmit(pw)} disabled={!pw}>Confirm</Button>
      </>}>
      <form onSubmit={e => { e.preventDefault(); if (pw) onSubmit(pw); }}>
        <Field label="Your password" error={failed ? 'That password was not correct.' : undefined}>
          <input className="input" type="password" autoComplete="current-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * Runs an admin request; if the server answers that it needs the acting Super Admin's password (403 REAUTH_REQUIRED / REAUTH_FAILED),
 * asks for it and sends the request again with `actorPassword`. Returns null if the admin cancels.
 */
export function useReauth() {
  const [pending, setPending] = useState<null | { resolve: (pw: string | null) => void; failed: boolean }>(null);
  const ask = (failed: boolean) => new Promise<string | null>(resolve => setPending({ resolve, failed }));
  const run = async (call: (actorPassword?: string) => Promise<Response>): Promise<{ res: Response; body: any } | null> => {
    let pw: string | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await call(pw);
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && (body?.code === 'REAUTH_REQUIRED' || body?.code === 'REAUTH_FAILED')) {
        const typed = await ask(body.code === 'REAUTH_FAILED');
        if (!typed) return null;
        pw = typed;
        continue;
      }
      return { res, body };
    }
    return null;
  };
  const close = (pw: string | null) => { pending?.resolve(pw); setPending(null); };
  const dialog = <ReauthDialog open={!!pending} failed={!!pending?.failed} onSubmit={pw => close(pw)} onCancel={() => close(null)} />;
  return { run, dialog };
}

/** Problems with a new password, by the product's own rule (at least 8 characters), or null. */
export function newPasswordProblem(pw: string, confirm: string): string | null {
  if (!pw.trim()) return 'Enter a new password.';
  if (pw.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters.`;
  if (pw !== confirm) return 'The two passwords do not match.';
  return null;
}
/** A gentle hint, not a rule: mixing kinds of characters makes a password harder to guess. */
export function strengthHint(pw: string): string {
  if (!pw) return `At least ${PASSWORD_MIN} characters. Upper and lower case, a number and a symbol make it stronger.`;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  return kinds >= 4 && pw.length >= 12 ? 'Strong.' : kinds >= 3 ? 'Good. A symbol or more length makes it stronger.' : 'Weak: mix upper and lower case, numbers and symbols.';
}

/**
 * Administrative password reset. The current password is never shown or asked for: it cannot be displayed, only replaced. Either the
 * admin types a new one (never shown again after this closes), or a temporary one is emailed and the user must change it at next sign-in.
 */
export function ResetPasswordDialog({ user, onClose, run }: {
  user: { id: string; email: string; displayName?: string | null; hasPassword?: boolean } | null;
  onClose: () => void;
  run: ReturnType<typeof useReauth>['run'];
}) {
  const [mode, setMode] = useState<'set' | 'email'>('set');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOut, setSignOut] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Nothing typed outlives the dialog.
  useEffect(() => { setMode('set'); setPw(''); setConfirm(''); setSignOut(true); setError(null); setDone(null); }, [user?.id]);

  const submit = async () => {
    if (!user) return;
    const problem = mode === 'set' ? newPasswordProblem(pw, confirm) : null;
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const out = await run(actorPassword => fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST', headers: jsonAuth(),
        body: JSON.stringify({ ...(mode === 'set' ? { newPassword: pw, confirmPassword: confirm } : {}), signOutEverywhere: signOut, ...(actorPassword ? { actorPassword } : {}) }),
      }));
      if (!out) return;
      if (!out.res.ok) { setError(out.body?.error || 'The password could not be reset.'); return; }
      setPw(''); setConfirm('');
      setDone(mode === 'set' ? 'Password updated successfully.' : 'A temporary password was emailed. They will be asked to choose a new one when they sign in.');
    } catch { setError('Could not reach the server.'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!user} onClose={onClose} size="sm" title="Reset password"
      description={user ? <>For <b>{user.email}</b></> : undefined}
      footer={done
        ? <Button onClick={onClose}>Close</Button>
        : <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{mode === 'set' ? 'Reset password' : 'Email temporary password'}</Button>
        </>}>
      {done ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-success"><ShieldCheck size={16} aria-hidden="true" /> {done}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            Current password: <b>{user?.hasPassword === false ? 'Not configured' : 'Configured'}</b>. Password cannot be displayed. Set a new password to replace it.
          </p>
          <div className="segmented" role="group" aria-label="How to reset">
            <button type="button" aria-pressed={mode === 'set'} onClick={() => setMode('set')}>Set a new password</button>
            <button type="button" aria-pressed={mode === 'email'} onClick={() => setMode('email')}>Email a temporary one</button>
          </div>
          {mode === 'set' && <>
            <Field label="New password" help={strengthHint(pw)}>
              <input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </Field>
          </>}
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-0.5" checked={signOut} onChange={e => setSignOut(e.target.checked)} />
            <span>Sign this user out of all other sessions</span>
          </label>
          {error && <p role="alert" className="text-[13px] font-semibold text-alarm">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}

type Summary = {
  users: { total: number; active: number; blocked: number; verified: number; unverified: number };
  admins: { superAdmins: number; activeSuperAdmins: number; admins: number; otherStaff: number };
  passwords: { configured: number; notConfigured: number };
};

/** Account counts for the Super Admin. Counts only; no password value or hash is ever part of it. Renders nothing for other roles. */
export function AccountSummary({ refreshKey }: { refreshKey?: unknown }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/admin/accounts/summary', { headers: auth(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.users) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);
  if (!data) return null;
  const n = (v: number) => v.toLocaleString();
  const groups = [
    { icon: <Users size={14} aria-hidden="true" />, title: 'User accounts', items: [['Total', data.users.total], ['Active', data.users.active], ['Verified', data.users.verified], ['Unverified', data.users.unverified]] },
    { icon: <UserCog size={14} aria-hidden="true" />, title: 'Admin accounts', items: [['Super Admins', data.admins.superAdmins], ['Admins', data.admins.admins], ['Other staff', data.admins.otherStaff]] },
    { icon: <KeyRound size={14} aria-hidden="true" />, title: 'Password credentials', items: [['Configured', data.passwords.configured], ['Not configured', data.passwords.notConfigured]] },
  ] as const;
  return (
    <section aria-label="Account summary" className="grid gap-3 md:grid-cols-3">
      {groups.map(g => (
        <div key={g.title} className="card p-4">
          <p className="metric-label flex items-center gap-1.5">{g.icon}{g.title}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {g.items.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="text-[15px] font-bold tabular-nums">{n(v as number)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
