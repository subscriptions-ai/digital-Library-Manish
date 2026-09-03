import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Save, User, Lock, Mail, ShieldAlert, Download, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Profile Settings</h1>
        <p className="text-sm text-muted mt-1">Update your personal information and set a new password.</p>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6 bg-surface rounded-md border border-rule shadow-sm p-8">
        <div className="space-y-4 border-b border-rule pb-6">
          <h2 className="text-sm font-bold text-ink uppercase tracking-widest flex items-center gap-2">
            <User size={16} /> Personal Information
          </h2>

          <div>
            <label className="block text-xs font-bold text-muted mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full pl-10 pr-4 py-2 bg-surface-2 border-none rounded-md text-sm text-muted cursor-not-allowed"
                title="Email cannot be changed"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-2 bg-surface-2 focus:bg-surface border focus:border-accent border-transparent rounded-md text-sm text-ink transition-all outline-none focus:ring-4 focus:border-accent"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-2">
           <h2 className="text-sm font-bold text-ink uppercase tracking-widest flex items-center gap-2">
            <Lock size={16} /> Security
          </h2>
          <div>
            <label className="block text-xs font-bold text-muted mb-1">New Password (optional)</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="w-full pl-10 pr-10 py-2 bg-surface-2 focus:bg-surface border focus:border-accent border-transparent rounded-md text-sm text-ink transition-all outline-none focus:ring-4 focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink-2 focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-sm font-bold rounded-md hover:bg-accent-hover hover:-translate-y-0.5 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </form>

      {/* Privacy & Data Settings (GDPR / DPDP) */}
      <div className="bg-surface rounded-md border border-alarm shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          <div className="border-b border-rule pb-4">
            <h2 className="text-sm font-bold text-alarm uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert size={16} /> Privacy & Data (DPDP / GDPR)
            </h2>
            <p className="text-sm text-muted mt-1">Manage your personal data, download a copy, or permanently delete your account.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-surface-2 rounded-md border border-rule flex flex-col items-start">
              <div className="flex items-center gap-2 text-ink font-bold mb-2">
                <Download size={18} className="text-accent" />
                Download My Data
              </div>
              <p className="text-xs text-muted mb-4 flex-1">
                Get a copy of your personal data stored on our servers in JSON format. This complies with your right to Data Portability.
              </p>
              <button 
                onClick={handleDownloadData}
                className="w-full py-2 bg-surface border border-rule text-ink-2 font-bold text-sm rounded-md hover:bg-surface-2 transition-colors"
              >
                Download Data
              </button>
            </div>

            <div className="p-5 bg-alarm-soft/50 rounded-md border border-alarm flex flex-col items-start">
              <div className="flex items-center gap-2 text-alarm font-bold mb-2">
                <Trash2 size={18} />
                Right to Erasure
              </div>
              <p className="text-xs text-alarm/80 mb-4 flex-1">
                Permanently delete your account and all associated personal data. This action cannot be undone.
              </p>
              
              <div className="w-full space-y-2">
                <input 
                  type="text"
                  placeholder="Type 'DELETE' to confirm"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className="w-full text-center px-4 py-2 bg-surface border border-alarm rounded-md text-sm focus:outline-none focus:border-alarm"
                />
                <button 
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== 'DELETE' || isDeleting}
                  className="w-full py-2 bg-alarm text-white font-bold text-sm rounded-md hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
