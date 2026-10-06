import React, { useState, useRef, useEffect } from 'react';
import { Building2, Phone, MapPin, Globe, Camera, Lock, Save, User, Users, BookOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Button, PageHeader, friendlyError } from '../ui';

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
      toast.success('Profile saved');
    } catch (err: any) {
      toast.error(friendlyError(err, 'Failed to save profile'));
    } finally {
      setSaving(false);
    }
  };

  const displayLogo = logoPreview || data.logoUrl;
  const initials = (data.institutionName || 'IN').substring(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Institution Profile"
        description="Manage your institution's contact info and branding. The institution name is set by your administrator."
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Logo + Institution Name card */}
        <div className="card card-pad">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
            {/* Logo circle */}
            <div className="relative shrink-0 self-start sm:self-auto">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-rule bg-accent sm:h-24 sm:w-24">
                {displayLogo ? (
                  <img src={displayLogo} alt={`${data.institutionName} logo`} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-accent-on" aria-hidden="true">{initials}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-rule bg-surface text-accent shadow-sm transition-colors hover:bg-accent-soft"
                title="Upload logo"
                aria-label="Upload logo (image under 2 MB)"
              >
                <Camera size={16} aria-hidden="true" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-xl font-bold text-ink sm:text-2xl">{data.institutionName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Lock size={14} className="shrink-0" aria-hidden="true" />
                <span>Institution name is managed by your administrator</span>
              </p>
              {data.website && (
                <a href={data.website} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm text-accent hover:underline">
                  <Globe size={14} className="shrink-0" aria-hidden="true" /> <span className="truncate">{data.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </div>
        </div>



        {/* Editable fields */}
        <div className="card card-pad space-y-6">
          <h2 className="card-title">Contact Information</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-contact" className="field-label mb-1.5 block">Contact Person Name</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                <input
                  type="text" id="pf-contact" value={data.contactName}
                  onChange={e => setData(d => ({ ...d, contactName: e.target.value }))}
                  placeholder="Dr. Priya Sharma"
                  className="input pl-9"
                />
              </div>
            </div>
            <div>
              <label htmlFor="pf-phone" className="field-label mb-1.5 block">Contact Phone</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                <input
                  type="tel" id="pf-phone" value={data.contactPhone}
                  onChange={e => setData(d => ({ ...d, contactPhone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  className="input pl-9"
                />
              </div>
            </div>
            <div>
              <label htmlFor="pf-city" className="field-label mb-1.5 block">City / District</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                <input
                  type="text" id="pf-city" value={data.city}
                  onChange={e => setData(d => ({ ...d, city: e.target.value }))}
                  placeholder="New Delhi"
                  className="input pl-9"
                />
              </div>
            </div>
            <div>
              <label htmlFor="pf-website" className="field-label mb-1.5 block">Website</label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                <input
                  type="url" id="pf-website" value={data.website}
                  onChange={e => setData(d => ({ ...d, website: e.target.value }))}
                  placeholder="https://university.edu.in"
                  className="input pl-9"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="pf-address" className="field-label mb-1.5 block">Full Address</label>
            <textarea
              id="pf-address" value={data.address}
              onChange={e => setData(d => ({ ...d, address: e.target.value }))}
              rows={3}
              placeholder="Building / Block, Street, State — PIN Code"
              className="input resize-none"
            />
          </div>

          <div className="border-t border-rule pt-6">
            <h2 className="card-title mb-4">Institution Details (For Marketing & Suggestions)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="pf-courses" className="field-label mb-1.5 block">Courses Offered (Comma separated)</label>
                <div className="relative">
                  <BookOpen className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                  <input
                    type="text" id="pf-courses" aria-describedby="pf-courses-help" value={data.coursesOffered}
                    onChange={e => setData(d => ({ ...d, coursesOffered: e.target.value }))}
                    placeholder="e.g. Engineering, Nursing, Architecture, MBA"
                    className="input pl-9"
                  />
                </div>
                <p id="pf-courses-help" className="field-help mt-1.5">This helps us suggest relevant domains and subscriptions.</p>
              </div>
              
              <div>
                <label htmlFor="pf-total" className="field-label mb-1.5 block">Total Number of Courses</label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                  <input
                    type="number" id="pf-total" value={data.totalCourses}
                    onChange={e => setData(d => ({ ...d, totalCourses: e.target.value }))}
                    placeholder="e.g. 15"
                    className="input pl-9"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pf-size" className="field-label mb-1.5 block">Student Body Size</label>
                <div className="relative">
                  <Users className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
                  <select
                    id="pf-size" value={data.studentBodySize}
                    onChange={e => setData(d => ({ ...d, studentBodySize: e.target.value }))}
                    className="input pl-9"
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

          <div className="flex justify-end border-t border-rule pt-6">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {!saving && <Save size={16} aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
