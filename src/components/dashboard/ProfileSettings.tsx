import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Save, User, Lock, ShieldAlert, Download, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, Card, Field, PageHeader, friendlyError } from '../ui';

export function ProfileSettings() {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { logout } = useAuth();

  const handleDownloadData = () => {
    // Generate a basic JSON of user data
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "my_personal_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success('Your personal data has been downloaded.');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast.error('Please type DELETE to confirm account deletion.');
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to delete account');
      toast.success('Your account and all personal data have been permanently deleted.');
      logout();
    } catch (err) {
      toast.error('Unable to delete account at this time. Please contact support.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ displayName, password })
      });

      if (!res.ok) throw new Error('Failed to update profile');
      toast.success('Profile updated successfully!');
      setPassword(''); // Clear password field
    } catch (error) {
      toast.error(friendlyError(error, 'Failed to update profile'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 pb-12">
      <PageHeader
        className="mb-0"
        title="Profile Settings"
        description="Update your personal information and set a new password."
      />

      <Card>
        <form onSubmit={handleUpdate} className="space-y-6">
          <fieldset className="space-y-4 border-b border-rule pb-6">
            <legend className="mb-4 flex items-center gap-2 type-card-title text-ink">
              <User size={18} className="text-muted" aria-hidden="true" /> Personal Information
            </legend>

            <Field label="Email Address" help="Email cannot be changed">
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input"
                autoComplete="email"
              />
            </Field>

            <Field label="Full Name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                className="input"
                autoComplete="name"
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-4 flex items-center gap-2 type-card-title text-ink">
              <Lock size={18} className="text-muted" aria-hidden="true" /> Security
            </legend>
            <div className="field">
              <label htmlFor="profile-new-password" className="field-label">New Password (optional)</label>
              <div className="relative">
                <input
                  id="profile-new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="input pr-11"
                  autoComplete="new-password"
                  aria-describedby="profile-new-password-help"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="btn btn-ghost btn-icon btn-sm absolute right-1 top-1/2 -translate-y-1/2 text-muted"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              <p id="profile-new-password-help" className="field-help">Leave blank to keep your current password.</p>
            </div>
          </fieldset>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={loading} className="w-full sm:w-auto">
              {!loading && <Save size={16} aria-hidden="true" />}
              Save Changes
            </Button>
          </div>
        </form>
      </Card>

      {/* Privacy & Data Settings (GDPR / DPDP) */}
      <Card>
        <div className="space-y-6">
          <div className="border-b border-rule pb-4">
            <h2 className="flex items-center gap-2 type-card-title text-ink">
              <ShieldAlert size={18} className="text-muted" aria-hidden="true" /> Privacy & Data (DPDP / GDPR)
            </h2>
            <p className="mt-1 text-sm text-muted">Manage your personal data, download a copy, or permanently delete your account.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col items-start rounded-xl border border-rule bg-surface-2 p-5">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-ink">
                <Download size={18} className="text-accent" aria-hidden="true" />
                Download My Data
              </h3>
              <p className="mb-4 flex-1 text-sm text-muted">
                Get a copy of your personal data stored on our servers in JSON format. This complies with your right to Data Portability.
              </p>
              <Button variant="outline" block onClick={handleDownloadData}>
                Download Data
              </Button>
            </div>

            {/* The one destructive action on the page, so the only red one. */}
            <div className="flex flex-col items-start rounded-xl border border-alarm bg-alarm-soft p-5">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-alarm">
                <Trash2 size={18} aria-hidden="true" />
                Right to Erasure
              </h3>
              <p className="mb-4 flex-1 text-sm text-ink-2">
                Permanently delete your account and all associated personal data. This action cannot be undone.
              </p>
              
              <div className="w-full space-y-2">
                <Field label="Type DELETE to confirm" className="w-full">
                  <input 
                    type="text"
                    placeholder="DELETE"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="input text-center"
                    autoComplete="off"
                  />
                </Field>
                <Button
                  variant="danger"
                  block
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== 'DELETE'}
                  loading={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete My Account'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
