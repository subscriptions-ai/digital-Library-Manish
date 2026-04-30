import React, { useState, useRef, useEffect } from 'react';
import { Building2, Phone, MapPin, Globe, Mail, Camera, Lock, Save, Loader2, AlertCircle, User, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

interface InstitutionProfileData {
  institutionName: string;   // read-only — set by admin at creation
  contactName: string;
  contactPhone: string;
  address: string;
  city: string;
  website: string;
  logoUrl: string;
  coursesOffered: string;
  totalCourses: string | number;
  studentBodySize: string;
}

export function InstitutionProfile() {
  const { profile } = useAuth();
  const [data, setData] = useState<InstitutionProfileData>({
    institutionName: profile?.organization || 'Your Institution',
    contactName: profile?.displayName || '',
    contactPhone: '',
    address: '',
    city: '',
    website: '',
    logoUrl: '',
    coursesOffered: '',
    totalCourses: '',
    studentBodySize: '',
  });
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Always refresh institution name from profile (this field is immutable)
  useEffect(() => {
    if (profile?.organization) {
      setData(d => ({ ...d, institutionName: profile.organization || d.institutionName }));
    }
  }, [profile]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/institution/profile', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const profileData = await res.json();
          setData(prev => ({ ...prev, ...profileData }));
        }
      } catch (err) {
        console.error('Failed to load full profile data', err);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Upload logo if changed
      let logoUrl = data.logoUrl;
      if (logoFile) {
        const fd = new FormData();
        fd.append('file', logoFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: fd
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          logoUrl = url;
        }
        // If upload not available, use data URL (local preview only for now)
        if (!uploadRes.ok) logoUrl = logoPreview || '';
      }

      // 2. Save profile (excluding institutionName — it's immutable)
      const res = await fetch('/api/institution/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          address: data.address,
          city: data.city,
          website: data.website,
          logoUrl,
          coursesOffered: data.coursesOffered,
          totalCourses: data.totalCourses,
          studentBodySize: data.studentBodySize,
        })
      });
      let result: any = {};
      try { result = await res.json(); } catch {}
      if (!res.ok) throw new Error(result?.error || 'Failed to save profile');

      setData(d => ({ ...d, logoUrl }));
      toast.success('Profile saved successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const displayLogo = logoPreview || data.logoUrl;
  const initials = (data.institutionName || 'IN').substring(0, 2).toUpperCase();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Institution Profile</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your institution's contact info and branding. The institution name is set by your administrator.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Logo + Institution Name card */}
        <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-6">
            {/* Logo circle */}
            <div className="relative group">
              <div className="h-24 w-24 rounded-2xl overflow-hidden bg-indigo-600 flex items-center justify-center shrink-0 shadow-xl shadow-black/20">
                {displayLogo ? (
                  <img src={displayLogo} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-white">{initials}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 h-8 w-8 bg-white text-indigo-700 rounded-full flex items-center justify-center shadow-md hover:bg-indigo-50 transition-colors"
                title="Upload logo"
              >
                <Camera size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-black tracking-tight truncate">{data.institutionName}</div>
              <div className="flex items-center gap-1.5 text-indigo-200 text-sm mt-1">
                <Lock size={12} />
                <span>Institution name is managed by your administrator</span>
              </div>
              {data.website && (
                <a href={data.website} target="_blank" rel="noreferrer"
                  className="text-indigo-200 hover:text-white text-sm flex items-center gap-1.5 mt-2 transition-colors">
                  <Globe size={13} /> {data.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Read-only alert */}
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 text-amber-500" />
          <span>The <strong>Institution Name</strong> is locked and can only be changed by a Super Admin or Subscription Manager.</span>
        </div>

        {/* Editable fields */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          <h2 className="text-base font-bold text-slate-800">Contact Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Person Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text" value={data.contactName}
                  onChange={e => setData(d => ({ ...d, contactName: e.target.value }))}
                  placeholder="Dr. Priya Sharma"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="tel" value={data.contactPhone}
                  onChange={e => setData(d => ({ ...d, contactPhone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">City / District</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text" value={data.city}
                  onChange={e => setData(d => ({ ...d, city: e.target.value }))}
                  placeholder="New Delhi"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Website</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="url" value={data.website}
                  onChange={e => setData(d => ({ ...d, website: e.target.value }))}
                  placeholder="https://university.edu.in"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Address</label>
            <textarea
              value={data.address}
              onChange={e => setData(d => ({ ...d, address: e.target.value }))}
              rows={3}
              placeholder="Building / Block, Street, State — PIN Code"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all resize-none"
            />
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-800 mb-6">Institution Details (For Marketing & Suggestions)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Courses Offered (Comma separated)</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text" value={data.coursesOffered}
                    onChange={e => setData(d => ({ ...d, coursesOffered: e.target.value }))}
                    placeholder="e.g. Engineering, Nursing, Architecture, MBA"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">This helps us suggest relevant domains and subscriptions.</p>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Number of Courses</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="number" value={data.totalCourses}
                    onChange={e => setData(d => ({ ...d, totalCourses: e.target.value }))}
                    placeholder="e.g. 15"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Body Size</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select
                    value={data.studentBodySize}
                    onChange={e => setData(d => ({ ...d, studentBodySize: e.target.value }))}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 outline-none transition-all appearance-none"
                  >
                    <option value="">Select Size...</option>
                    <option value="1-500">1 - 500</option>
                    <option value="501-2000">501 - 2,000</option>
                    <option value="2001-5000">2,001 - 5,000</option>
                    <option value="5000+">5,000+</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving...</>
            ) : (
              <><Save size={16} /> Save Profile</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
