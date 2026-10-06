import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Button } from './ui';

interface ForcePasswordChangeProps {
  onComplete: () => void;
}

export function ForcePasswordChange({ onComplete }: ForcePasswordChangeProps) {
  const { profile } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = (() => {
    if (newPassword.length === 0) return 0;
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    return score;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', 'bg-alarm', 'bg-caution', 'bg-accent', 'bg-success'][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ password: newPassword, clearFirstLogin: true })
      });
      if (!res.ok) throw new Error('Failed to update password');
      toast.success('Password changed successfully! Welcome to your dashboard.');
      onComplete();
    } catch {
      toast.error('Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // Rendered on its own (not inside a page layout), so it owns the whole
    // viewport. It scrolls on short phones instead of clipping the button, and
    // sits near the top there rather than being centred off-screen.
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-navy/80 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div role="dialog" aria-modal="true" aria-labelledby="force-password-title" className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="bg-navy px-6 py-8 text-center sm:px-8">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl on-dark-fill" aria-hidden="true">
            <ShieldCheck className="text-amber" size={28} />
          </div>
          <h1 id="force-password-title" className="text-2xl font-bold on-dark">Set Your Password</h1>
          <p className="mt-2 text-sm on-dark-2">
            Welcome, {profile?.displayName || 'User'}! Please set a permanent password before continuing.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
          <div className="field">
            <label htmlFor="force-new-password" className="field-label">
              New Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
              <input
                id="force-new-password"
                type={showNew ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                aria-describedby={newPassword.length > 0 ? 'force-password-strength' : undefined}
                className="input h-11 pl-10 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
                aria-pressed={showNew}
                className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
              >
                {showNew ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
            {/* Password strength bar */}
            {newPassword.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1" aria-hidden="true">
                  {[1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : 'bg-surface-2'}`}
                    />
                  ))}
                </div>
                <p id="force-password-strength" className="field-help">{strengthLabel} password</p>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="force-confirm-password" className="field-label">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
              <input
                id="force-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                aria-invalid={confirmPassword && confirmPassword !== newPassword ? true : undefined}
                aria-describedby={confirmPassword && confirmPassword !== newPassword ? 'force-confirm-error' : undefined}
                className="input h-11 pl-10 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                aria-pressed={showConfirm}
                className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
              >
                {showConfirm ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p id="force-confirm-error" className="field-error">Passwords do not match</p>
            )}
          </div>

          <Button type="submit" variant="brand" size="lg" block loading={loading}>
            {loading ? 'Saving...' : <><ShieldCheck size={18} aria-hidden="true" /> Set Password & Continue</>}
          </Button>
        </form>
      </div>
    </div>
  );
}
