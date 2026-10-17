import { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Field } from './ui';
import { newPasswordProblem, strengthHint } from './admin/AccountSecurity';

const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

/**
 * "My Account / Security" for the signed-in person: change your password (current + new + confirm) and, where allowed, your sign-in email
 * (new address + current password). Your current password is never shown anywhere; it is only checked. Other browsers signed in as you are
 * signed out after either change; this one stays signed in.
 */
export function SecuritySettings({ allowEmailChange = false }: { allowEmailChange?: boolean }) {
  const { profile, fetchProfile } = useAuth();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !current ? 'Enter your current password.' : newPasswordProblem(pw, confirm);
    if (problem) { setPwError(problem); return; }
    setPwBusy(true); setPwError(null);
    try {
      const res = await fetch('/api/user/profile', { method: 'PUT', headers: headers(), body: JSON.stringify({ currentPassword: current, password: pw, confirmPassword: confirm }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setPwError(body?.error || 'The password could not be changed.'); return; }
      setCurrent(''); setPw(''); setConfirm('');
      toast.success('Password changed. Other devices have been signed out.');
    } catch { setPwError('Could not reach the server.'); }
    finally { setPwBusy(false); }
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !emailPw) { setEmailError('Enter the new email address and your current password.'); return; }
    setEmailBusy(true); setEmailError(null);
    try {
      const res = await fetch('/api/user/email', { method: 'PUT', headers: headers(), body: JSON.stringify({ email, currentPassword: emailPw }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setEmailError(body?.error || 'The email could not be changed.'); return; }
      // The session is re-issued because the token carries the email.
      if (body.token) localStorage.setItem('token', body.token);
      setEmail(''); setEmailPw('');
      await fetchProfile();
      toast.success('Email changed. Use the new address next time you sign in.');
    } catch { setEmailError('Could not reach the server.'); }
    finally { setEmailBusy(false); }
  };

  return (
    <div className="space-y-6">
      {allowEmailChange && (
        <Card>
          <form onSubmit={changeEmail} className="space-y-4" noValidate>
            <h2 className="flex items-center gap-2 type-card-title text-ink"><Mail size={18} className="text-muted" aria-hidden="true" /> Sign-in email</h2>
            <p className="text-sm text-muted">Currently <b className="text-ink">{profile?.email}</b>. The new address must not be used by another account, and it will need to be verified again.</p>
            <Field label="New email address">
              <input className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
            </Field>
            <Field label="Current password">
              <input className="input" type="password" autoComplete="current-password" value={emailPw} onChange={e => setEmailPw(e.target.value)} />
            </Field>
            {emailError && <p role="alert" className="text-[13px] font-semibold text-alarm">{emailError}</p>}
            <div className="flex justify-end"><Button type="submit" loading={emailBusy}>Change email</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <form onSubmit={changePassword} className="space-y-4" noValidate>
          <h2 className="flex items-center gap-2 type-card-title text-ink"><KeyRound size={18} className="text-muted" aria-hidden="true" /> Password</h2>
          <p className="text-sm text-muted">Your password is never shown. To change it, enter the current one and choose a new one.</p>
          <Field label="Current password">
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" help={strengthHint(pw)}>
            <input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </Field>
          {pwError && <p role="alert" className="text-[13px] font-semibold text-alarm">{pwError}</p>}
          <div className="flex justify-end"><Button type="submit" loading={pwBusy}>Change password</Button></div>
        </form>
      </Card>
    </div>
  );
}
