import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Lock, ArrowRight, Eye, EyeOff, Mail, User, Building, Building2, Briefcase, GraduationCap, MapPin, MessageCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";

import { EmailVerificationInput } from "./EmailVerificationInput";
import { DOMAINS, REGISTRANT_TYPES, DESIGNATIONS_BY_TYPE, COUNTRIES } from "../constants";
import { INDIAN_STATES } from "../lib/gstUtils";

export function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    contact: '',
    designation: '',
    password: '',
    interestedDomains: [] as string[],
    registrantType: '',
    state: '',
    country: 'India',
    whatsapp: '',
  });
  // Most people give one number. The box asks rather than assuming, and only
  // asks for a second when the answer is no.
  const [contactIsWhatsapp, setContactIsWhatsapp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  const proceedWithSignup = async () => {
    setLoading(true);
    try {
      await signup(formData.email, formData.password, formData.name, formData.organization, formData.contact, formData.designation, formData.interestedDomains, {
        registrantType: formData.registrantType,
        state: formData.state.trim(),
        country: formData.country,
        // Stored as a number that can actually be used, not as a flag somebody
        // downstream has to remember to interpret.
        whatsapp: contactIsWhatsapp ? formData.contact : formData.whatsapp.trim(),
      });
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.name) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!formData.registrantType) {
      toast.error('Please tell us what you are registering as');
      return;
    }
    if (!formData.designation) {
      toast.error('Please choose your role');
      return;
    }
    if (!formData.country || !formData.state.trim()) {
      toast.error('Please give your state and country');
      return;
    }
    if (!contactIsWhatsapp && !formData.whatsapp.trim()) {
      toast.error('Please give a WhatsApp number, or tick that your contact number is one');
      return;
    }
    if (!formData.interestedDomains.length) {
      toast.error('Please select at least one department relevant to your institution');
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      toast.error('You must agree to the Terms of Service and Privacy Policy to continue');
      return;
    }

    setLoading(true);
    try {
      await proceedWithSignup();
    } catch (error: any) {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-3 mb-8">
            <img src="/logo.png" alt="STM Digital Library Logo" className="h-12 w-12 object-contain" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-xl font-bold tracking-tight text-slate-900">STM Library</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mt-1">Digital Access</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Create Your Account</h1>
          <p className="mt-2 text-sm text-slate-500">Join thousands of researchers worldwide</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <form className="space-y-5" onSubmit={handleSignup}>
            <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <EmailVerificationInput
                value={formData.email}
                onChange={(email) => setFormData({ ...formData, email })}
                onVerified={setIsEmailVerified}
              />
            </div>
            
            <div className={`space-y-5 transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              {/* Asked first, because it decides what the rest of the form
                  means — a Dean and a Product Manager are both "Director" to a
                  free-text box, and neither can be counted afterwards. */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">I am registering as a: *</label>
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {REGISTRANT_TYPES.map(t => {
                    const Icon = t.id === 'Institute' ? Building2 : t.id === 'Corporate' ? Briefcase : GraduationCap;
                    const on = formData.registrantType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        title={t.hint}
                        disabled={!isEmailVerified}
                        onClick={() => setFormData(f => ({ ...f, registrantType: t.id, designation: '' }))}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-2.5 text-xs font-bold transition-all ${
                          on ? 'border border-slate-200 bg-white text-blue-600 shadow-sm'
                             : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                      >
                        <Icon size={14} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required={isEmailVerified}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Dr. John Doe"
                    disabled={!isEmailVerified}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Organization / University *</label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  required={isEmailVerified}
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  placeholder="Harvard University"
                  disabled={!isEmailVerified}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Contact Number *</label>
              <div className="relative">
                <input 
                  type="tel" 
                  required={isEmailVerified}
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="+91 98765 43210"
                  disabled={!isEmailVerified}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={contactIsWhatsapp}
                  disabled={!isEmailVerified}
                  onChange={(e) => setContactIsWhatsapp(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <MessageCircle size={13} className="text-emerald-600" />
                This is also my WhatsApp number
              </label>

              {!contactIsWhatsapp && (
                <div className="relative pt-1">
                  <MessageCircle className="absolute left-3 top-1/2 translate-y-[2px] text-emerald-600" size={18} />
                  <input
                    type="tel"
                    required={isEmailVerified}
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="WhatsApp number"
                    disabled={!isEmailVerified}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Designation / Role *</label>
              <select
                required={isEmailVerified}
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                disabled={!isEmailVerified || !formData.registrantType}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {formData.registrantType ? 'Choose your role' : 'Choose what you are registering as, first'}
                </option>
                {(DESIGNATIONS_BY_TYPE[formData.registrantType] || []).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Where they are. Indian states are a known list; everywhere else
                is not, so it is typed rather than guessed at. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Country *</label>
                <select
                  required={isEmailVerified}
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value, state: '' })}
                  disabled={!isEmailVerified}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">State *</label>
                {formData.country === 'India' ? (
                  <select
                    required={isEmailVerified}
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    disabled={!isEmailVerified}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  >
                    <option value="">Choose your state</option>
                    {INDIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                ) : (
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      required={isEmailVerified}
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="State or province"
                      disabled={!isEmailVerified}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                )}
              </div>
            </div>
            {/* Interests, not permissions. Every member reads the whole library
                whatever they pick here; this only tells us where to collect
                more. Note that the wording no longer says so — it used to, and
                if members start believing their choices narrow what they can
                read, that reassurance is the line to put back. */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Departments Relevant to Your Institution *</label>
              <p className="text-xs text-slate-500">
                Select the departments relevant to your institution. Your selection helps us identify
                areas where additional resources and materials are needed.
              </p>
              <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {/* Alphabetical: the constant is ordered by how the departments were
                    added, which is no order at all to a person looking for one. */}
                {[...DOMAINS].sort((a, b) => a.name.localeCompare(b.name)).map(d => {
                  const chosen = formData.interestedDomains.includes(d.name);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={!isEmailVerified}
                      onClick={() => setFormData(f => ({
                        ...f,
                        interestedDomains: chosen
                          ? f.interestedDomains.filter(x => x !== d.name)
                          : [...f.interestedDomains, d.name],
                      }))}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        chosen
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400">
                {formData.interestedDomains.length
                  ? `${formData.interestedDomains.length} chosen`
                  : 'Choose at least one'}
              </p>
            </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required={isEmailVerified}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    disabled={!isEmailVerified}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    disabled={!isEmailVerified}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className={`pt-2 transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="pt-0.5">
                    <input 
                      type="checkbox" 
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs text-slate-600 leading-snug">
                    I explicitly consent and agree to the <Link to="/terms-and-conditions" className="font-bold text-blue-600 hover:underline">Terms of Service</Link>.
                  </span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="pt-0.5">
                    <input 
                      type="checkbox" 
                      checked={acceptedPrivacy}
                      onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs text-slate-600 leading-snug">
                    I explicitly consent to the collection, processing, and storage of my personal data as described in the <Link to="/privacy-policy" className="font-bold text-blue-600 hover:underline">Privacy Policy</Link> (in compliance with GDPR and DPDP Act).
                  </span>
                </label>
              </div>
              <button 
                type="submit"
                disabled={loading || !isEmailVerified || !acceptedTerms || !acceptedPrivacy}
                className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Account...' : 'Create Account'} <ArrowRight size={16} />
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Already have an account? <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
