import React, { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, Copy, Check, Eye, EyeOff, Mail, Lock, User, Building2, GraduationCap, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ROLES = [
  { value: 'Institution', label: 'Institution', icon: Building2, color: 'text-indigo-600 bg-indigo-50', desc: 'College / University admin with student management access' },
  { value: 'Student', label: 'Student', icon: GraduationCap, color: 'text-purple-600 bg-purple-50', desc: 'Linked to an institution, accesses granted content' },
  { value: 'Subscriber', label: 'Normal User / Subscriber', icon: User, color: 'text-blue-600 bg-blue-50', desc: 'Individual subscriber accessing personal subscription' },
  { value: 'SubscriptionManager', label: 'Subscription Manager', icon: User, color: 'text-emerald-600 bg-emerald-50', desc: 'Sales role — manages requests, quotations and approvals' },
];

function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = upper + lower + digits + special;
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  const rest = Array.from({ length: length - 4 }, () => all[Math.floor(Math.random() * all.length)]);
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
}

export function UserCreationPanel() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'Subscriber',
    institutionId: '',
    customPassword: '',
    sendEmail: true,
  });
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);

  // Load institutions for Student role
  useEffect(() => {
    fetch('/api/admin/institutions', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.ok ? r.json() : []).then(d => setInstitutions(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const handleAutoGenerate = () => {
    const pw = generateStrongPassword();
    setForm(f => ({ ...f, customPassword: pw }));
    setShowPassword(true);
  };

  const handleCopy = (field: 'email' | 'password' | 'both') => {
    if (field === 'email') navigator.clipboard.writeText(createdCredentials?.email || '');
    else if (field === 'password') navigator.clipboard.writeText(createdCredentials?.password || '');
    else {
      navigator.clipboard.writeText(
        `Email: ${createdCredentials?.email}\nPassword: ${createdCredentials?.password}`
      );
    }
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role) {
      toast.error('Name, email and role are required');
      return;
    }
    setLoading(true);
    setCreatedCredentials(null);
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          institutionId: form.role === 'Student' ? form.institutionId : undefined,
          customPassword: form.customPassword || undefined,
          sendEmail: form.sendEmail,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      setCreatedCredentials(data.credentials);
      toast.success(`User "${form.name}" created successfully!`);
      // Reset form
      setForm({ name: '', email: '', role: 'Subscriber', institutionId: '', customPassword: '', sendEmail: true });
      setShowPassword(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLES.find(r => r.value === form.role);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create User</h1>
        <p className="text-slate-500 text-sm mt-1">
          Provision a new account and assign a role. Credentials are emailed automatically.
        </p>
      </div>

      {/* Success: Credentials Panel */}
      {createdCredentials && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600" size={22} />
            <div>
              <h3 className="font-bold text-emerald-800">Account Created!</h3>
              <p className="text-sm text-emerald-600">Credentials are shown once. Copy them now.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-emerald-200">
              <Mail size={16} className="text-slate-400 shrink-0" />
              <span className="flex-1 text-sm font-mono text-slate-700">{createdCredentials.email}</span>
              <button onClick={() => handleCopy('email')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
                {copied === 'email' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-emerald-200">
              <Lock size={16} className="text-slate-400 shrink-0" />
              <span className="flex-1 text-sm font-mono text-slate-700 break-all">{createdCredentials.password}</span>
              <button onClick={() => handleCopy('password')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
                {copied === 'password' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <button
            onClick={() => handleCopy('both')}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            {copied === 'both' ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Both Credentials</>}
          </button>
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>The user will be prompted to change their password on first login.</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
        {/* Name + Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                required type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Dr. Priya Sharma"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email / User ID *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                required type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="priya@university.edu"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Role Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Role *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLES.map(r => {
              const Icon = r.icon;
              const isSelected = form.role === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: r.value }))}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-100'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${r.color} shrink-0 mt-0.5`}>
                    <Icon size={15} />
                  </div>
                  <div>
                    <div className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{r.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{r.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditional: Institution selector for Student */}
        {form.role === 'Student' && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Link to Institution <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <select
              value={form.institutionId}
              onChange={e => setForm(f => ({ ...f, institutionId: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all"
            >
              <option value="">— No institution —</option>
              {institutions.map((inst: any) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password *</label>
            <button
              type="button"
              onClick={handleAutoGenerate}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <RefreshCw size={12} /> Auto-generate
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.customPassword}
              onChange={e => setForm(f => ({ ...f, customPassword: e.target.value }))}
              placeholder="Leave blank to auto-generate on submit"
              className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Email Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Mail size={16} className="text-blue-600" />
              Send credentials via email
            </div>
            <p className="text-xs text-slate-500 mt-0.5">User receives email with User ID, password and login link</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, sendEmail: !f.sendEmail }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.sendEmail ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.sendEmail ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating User...</>
          ) : (
            <><UserPlus size={18} /> Create Account</>
          )}
        </button>
      </form>
    </div>
  );
}
