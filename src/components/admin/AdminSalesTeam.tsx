import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Users, Loader2, X, Briefcase, Mail, CheckCircle2, Eye, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export function AdminSalesTeam() {
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    role: 'SalesExecutive',
    sendEmail: true
  });

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sales-team', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch team');
      setTeam(await res.json());
    } catch (error) {
      toast.error('Failed to load sales team');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: formData.displayName,
          email: formData.email,
          role: formData.role,
          sendEmail: formData.sendEmail
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create user');
      }
      toast.success('Sales Executive created successfully!');
      setShowModal(false);
      setFormData({ displayName: '', email: '', role: 'SalesExecutive', sendEmail: true });
      fetchTeam();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="text-indigo-600" />
            Sales Team Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage your executives and track their pipeline.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20 font-bold"
        >
          <UserPlus size={18} /> Add Executive
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-2xl"></div>)}
        </div>
      ) : team.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <Briefcase className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No Team Members Found</h3>
          <p className="text-slate-500 mb-6">Create your first Sales Executive to start assigning leads.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mx-auto flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold"
          >
            <UserPlus size={16} /> Add Executive
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {team.map(member => (
            <div key={member.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xl">
                  {member.displayName?.[0] || member.email[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{member.displayName || 'Unnamed'}</h3>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Mail size={12} /> {member.email}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mb-4">
                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                  {member.role}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Assigned Leads</div>
                  <div className="text-lg font-bold text-slate-700">{member._count?.assignedLeads || 0}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Interactions</div>
                  <div className="text-lg font-bold text-slate-700">{member._count?.leadInteractions || 0}</div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/admin/sales-team/${member.id}`)}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-xl font-bold transition-colors text-sm"
              >
                <LayoutDashboard size={16} /> View Pipeline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CREATE MODAL */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 px-6 py-5 flex items-center justify-between">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <UserPlus size={20} /> Add Sales Executive
                </h2>
                <button onClick={() => setShowModal(false)} className="text-indigo-200 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    required
                    value={formData.displayName}
                    onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none"
                    placeholder="rahul@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none"
                  >
                    <option value="SalesExecutive">Sales Executive</option>
                    <option value="SalesManager">Sales Manager</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="sendEmail"
                    checked={formData.sendEmail}
                    onChange={e => setFormData({ ...formData, sendEmail: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <label htmlFor="sendEmail" className="text-sm text-slate-600 font-medium cursor-pointer">
                    Send login credentials via email
                  </label>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                    Cancel
                  </button>
                  <button type="submit" disabled={creating} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {creating ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
