import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Save, User, Lock, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function ProfileSettings() {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 focus:bg-white border focus:border-blue-200 border-transparent rounded-xl text-sm text-slate-900 transition-all outline-none focus:ring-4 focus:ring-blue-100"
              />
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
    </div>
  );
}
