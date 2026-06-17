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
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Profile Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Update your personal information and set a new password.</p>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6 bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
        <div className="space-y-4 border-b border-slate-100 pb-6">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <User size={16} /> Personal Information
          </h2>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm text-slate-500 cursor-not-allowed"
                title="Email cannot be changed"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 focus:bg-white border focus:border-blue-200 border-transparent rounded-xl text-sm text-slate-900 transition-all outline-none focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-2">
           <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Lock size={16} /> Security
          </h2>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">New Password (optional)</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="w-full pl-10 pr-10 py-2 bg-slate-50 focus:bg-white border focus:border-blue-200 border-transparent rounded-xl text-sm text-slate-900 transition-all outline-none focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
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
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 hover:-translate-y-0.5 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </form>

      {/* Privacy & Data Settings (GDPR / DPDP) */}
      <div className="bg-white rounded-3xl border border-red-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          <div className="border-b border-red-50 pb-4">
            <h2 className="text-sm font-bold text-red-600 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert size={16} /> Privacy & Data (DPDP / GDPR)
            </h2>
            <p className="text-sm text-slate-500 mt-1">Manage your personal data, download a copy, or permanently delete your account.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-start">
              <div className="flex items-center gap-2 text-slate-800 font-bold mb-2">
                <Download size={18} className="text-blue-600" />
                Download My Data
              </div>
              <p className="text-xs text-slate-500 mb-4 flex-1">
                Get a copy of your personal data stored on our servers in JSON format. This complies with your right to Data Portability.
              </p>
              <button 
                onClick={handleDownloadData}
                className="w-full py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors"
              >
                Download Data
              </button>
            </div>

            <div className="p-5 bg-red-50/50 rounded-2xl border border-red-100 flex flex-col items-start">
              <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                <Trash2 size={18} />
                Right to Erasure
              </div>
              <p className="text-xs text-red-500/80 mb-4 flex-1">
                Permanently delete your account and all associated personal data. This action cannot be undone.
              </p>
              
              <div className="w-full space-y-2">
                <input 
                  type="text"
                  placeholder="Type 'DELETE' to confirm"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className="w-full text-center px-4 py-2 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-100"
                />
                <button 
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== 'DELETE' || isDeleting}
                  className="w-full py-2 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
