import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Users, Loader2, X, Briefcase, Mail, CheckCircle2, LayoutDashboard,
  TrendingUp, Award, Activity, Clock, ChevronRight
} from 'lucide-react';
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

  useEffect(() => { fetchTeam(); }, []);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sales-team', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch team');
      setTeam(await res.json());
    } catch { toast.error('Failed to load sales team'); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: formData.displayName, email: formData.email, role: formData.role, sendEmail: formData.sendEmail })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      toast.success('Sales Executive created!');
      setShowModal(false);
      setFormData({ displayName: '', email: '', role: 'SalesExecutive', sendEmail: true });
      fetchTeam();
    } catch (error: any) { toast.error(error.message); }
    finally { setCreating(false); }
  };

  // ── Summary stats ──────────────────────────────────────────────
  const totalAssigned   = team.reduce((s, m) => s + (m._count?.assignedLeads ?? 0), 0);
  const totalConverted  = team.reduce((s, m) => s + (m.subscriberCount ?? 0), 0);
  const avgConversion   = team.length > 0 && totalAssigned > 0
    ? ((totalConverted / totalAssigned) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* ── Title Row ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="text-indigo-600" size={24} />
            Sales Team
          </h1>
          <p className="text-sm text-slate-500 font-semibold mt-1">
            Manage executives and track real-time conversion performance.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20 font-bold text-sm"
        >
          <UserPlus size={17} /> Add Executive
        </button>
      </div>

      {/* ── Team Summary Stats ────────────────────────── */}
      {!loading && team.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Executives',       value: team.length,    icon: <Users size={18} />,        bg: 'bg-indigo-50',   text: 'text-indigo-600',  iconBg: 'bg-indigo-100' },
            { label: 'Total Assigned',   value: totalAssigned,  icon: <Activity size={18} />,     bg: 'bg-slate-50',    text: 'text-slate-600',   iconBg: 'bg-slate-100' },
            { label: 'Total Converted',  value: totalConverted, icon: <CheckCircle2 size={18} />, bg: 'bg-emerald-50',  text: 'text-emerald-600', iconBg: 'bg-emerald-100' },
            { label: 'Avg. Conversion',  value: `${avgConversion}%`, icon: <Award size={18} />, bg: 'bg-purple-50',   text: 'text-purple-600',  iconBg: 'bg-purple-100' },
          ].map(({ label, value, icon, bg, text, iconBg }) => (
            <div key={label} className={`${bg} border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm`}>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5">{value}</h3>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} ${text}`}>{icon}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Team Cards Grid ───────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-52 bg-slate-100 animate-pulse rounded-3xl" />)}
        </div>
      ) : team.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-14 text-center shadow-sm">
          <Briefcase className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No Team Members Yet</h3>
          <p className="text-slate-500 mb-6 text-sm">Add your first Sales Executive to start assigning leads.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mx-auto flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-sm"
          >
            <UserPlus size={16} /> Add Executive
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {team.map(member => {
            const assigned    = member._count?.assignedLeads ?? 0;
            const subs        = member.subscriberCount ?? 0;
            const rate        = member.conversionRate ?? 0;
            const interactions = member._count?.leadInteractions ?? 0;
            const initial     = (member.displayName?.[0] || member.email[0]).toUpperCase();

            return (
              <div key={member.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-5">
                {/* Card Header */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-md shadow-indigo-600/10 shrink-0">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-slate-900 truncate">{member.displayName || 'Unnamed'}</h3>
                    <div className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-0.5 truncate">
                      <Mail size={11} className="shrink-0" /> {member.email}
                    </div>
                  </div>
                  <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border border-blue-100 shrink-0">
                    {member.role === 'SalesExecutive' ? 'Executive' : 'Manager'}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Assigned',    value: assigned,      color: 'text-slate-800' },
                    { label: 'Subscribers', value: subs,          color: 'text-emerald-600' },
                    { label: 'Interactions', value: interactions, color: 'text-indigo-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
                      <div className={`text-lg font-black ${color}`}>{value}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Conversion Rate Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Conversion Rate</span>
                    <span className={`text-sm font-black ${rate >= 30 ? 'text-emerald-600' : rate >= 15 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {rate}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${rate >= 30 ? 'bg-emerald-500' : rate >= 15 ? 'bg-amber-500' : 'bg-rose-400'}`}
                      style={{ width: `${Math.min(rate, 100)}%` }}
                    />
                  </div>
                  {member.lastActiveAt && (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                      <Clock size={10} />
                      Last active: {new Date(member.lastActiveAt).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* View Pipeline Button */}
                <button
                  onClick={() => navigate(`/admin/sales-team/${member.id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 hover:border-indigo-200 rounded-xl font-bold transition-all text-sm group"
                >
                  <span className="flex items-center gap-2">
                    <LayoutDashboard size={15} /> View Full Pipeline
                  </span>
                  <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE MODAL ─────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5 flex items-center justify-between">
                <h2 className="text-white font-extrabold text-lg flex items-center gap-2">
                  <UserPlus size={20} /> Add Sales Executive
                </h2>
                <button onClick={() => setShowModal(false)} className="text-indigo-200 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                {[
                  { label: 'Full Name',    key: 'displayName', type: 'text',  placeholder: 'e.g. Rahul Sharma' },
                  { label: 'Email Address', key: 'email',      type: 'email', placeholder: 'rahul@company.com' },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                    <input
                      required
                      type={type}
                      value={(formData as any)[key]}
                      onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none font-semibold"
                      placeholder={placeholder}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none font-semibold"
                  >
                    <option value="SalesExecutive">Sales Executive</option>
                    <option value="SalesManager">Sales Manager</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendEmail}
                    onChange={e => setFormData({ ...formData, sendEmail: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="text-sm text-slate-600 font-medium">Send login credentials via email</span>
                </label>
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={creating}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
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
