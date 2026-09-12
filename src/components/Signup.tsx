import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Lock, ArrowRight, Eye, EyeOff, Mail, User, Building, Building2, Briefcase, GraduationCap, MapPin, MessageCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";

import { EmailVerificationInput } from "./EmailVerificationInput";
import { DOMAINS, REGISTRANT_TYPES, DESIGNATION_GROUPS, COUNTRIES } from "../constants";
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

  const chosenType = REGISTRANT_TYPES.find(t => t.id === formData.registrantType) || null;

  const field =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white';
  const withIcon =
    'w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white';

  /** A small heading with a rule, so the form reads as four short questions. */
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <fieldset className="space-y-4">
      <legend className="mb-3 flex w-full items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
        <span className="h-px flex-1 bg-slate-100" />
      </legend>
      {children}
    </fieldset>
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-14">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-3">
            <img src="/logo.png" alt="STM Digital Library Logo" className="h-11 w-11 object-contain" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-xl font-bold tracking-tight text-slate-900">STM Library</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-blue-600">Digital Access</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Create Your Account</h1>
          <p className="mt-2 text-sm text-slate-500">Free membership — the whole library, half an hour at a time.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-9">
          <form className="space-y-8" onSubmit={handleSignup}>

            {/* The address gates everything after it, so it stands alone. */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <EmailVerificationInput
                value={formData.email}
                onChange={(email) => setFormData({ ...formData, email })}
                onVerified={setIsEmailVerified}
              />
            </div>

            <div className={`space-y-8 transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>

              <Section title="About you">
                {/* Asked first, because it decides what everything after it
                    means — a Dean and a Product Manager are both "Director" to
                    a free-text box, and neither can be counted afterwards. */}
                {/* One question, not two. The role only means anything once we
                    know what kind of place it is in, so it lives inside the same
                    panel and appears the moment that is answered — rather than
                    sitting three fields further down with a note telling the
                    member to go back up. */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">I am registering as a *</label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                    <div className="grid grid-cols-3 gap-2">
                      {REGISTRANT_TYPES.map(t => {
                        const Icon = t.id === 'Institute' ? Building2 : t.id === 'Corporate' ? Briefcase : GraduationCap;
                        const on = formData.registrantType === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={!isEmailVerified}
                            onClick={() => setFormData(f => ({ ...f, registrantType: t.id, designation: '' }))}
                            className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[12px] font-bold leading-tight transition-all ${
                              on ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
                                 : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
                          >
                            <Icon size={18} className={on ? 'text-blue-600' : 'text-slate-400'} />
                            {t.label}
                          </button>
                        );
                      })}
                    </div>

                    {chosenType ? (
                      <div className="space-y-3 rounded-xl bg-white px-4 pb-4 pt-3.5">
                        <label className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-slate-700">
                          Designation / Role *
                          <span className="text-[11px] font-medium text-slate-400">{chosenType.hint}</span>
                        </label>

                        {/* Laid out rather than hidden behind a dropdown.
                            A native select is drawn by the operating system —
                            it cannot be styled, it covers the page, and it asks
                            for two clicks to answer a question the member can
                            answer at a glance. Eighteen roles fit here, grouped,
                            and take one. */}
                        <div className="space-y-2.5">
                          {(DESIGNATION_GROUPS[chosenType.id] || []).map(g => (
                            <div key={g.label}>
                              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                {g.label}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {g.roles.map(r => {
                                  const on = formData.designation === r;
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      disabled={!isEmailVerified}
                                      onClick={() => setFormData(f => ({ ...f, designation: on ? '' : r }))}
                                      className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                                        on ? 'bg-blue-600 text-white shadow-sm'
                                           : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'}`}
                                    >
                                      {r}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="px-3 py-3 text-center text-xs text-slate-400">
                        Choose one above, and the roles for it appear here.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text" autoComplete="name" required={isEmailVerified}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Dr. John Doe"
                        disabled={!isEmailVerified}
                        className={withIcon}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Organization / University *</label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text" autoComplete="organization" required={isEmailVerified}
                        value={formData.organization}
                        onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                        placeholder="Harvard University"
                        disabled={!isEmailVerified}
                        className={withIcon}
                      />
                    </div>
                  </div>
                </div>

              </Section>

              <Section title="Where you are">
                {/* Indian states are a known list and are offered as one;
                    everywhere else is typed, because it is not. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Country *</label>
                    <select
                      required={isEmailVerified} autoComplete="country-name"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value, state: '' })}
                      disabled={!isEmailVerified}
                      className={field}
                    >
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">State *</label>
                    {formData.country === 'India' ? (
                      <select
                        required={isEmailVerified} autoComplete="address-level1"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        disabled={!isEmailVerified}
                        className={field}
                      >
                        <option value="">Choose your state</option>
                        {INDIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    ) : (
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text" autoComplete="address-level1" required={isEmailVerified}
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          placeholder="State or province"
                          disabled={!isEmailVerified}
                          className={withIcon}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              <Section title="How we reach you">
                {/* One number fills the row; a second one splits it. A half-empty
                    row reads as something missing rather than something optional. */}
                <div className={`grid gap-4 ${contactIsWhatsapp ? '' : 'sm:grid-cols-2'}`}>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Contact Number *</label>
                    <input
                      type="tel" autoComplete="tel" required={isEmailVerified}
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      placeholder="+91 98765 43210"
                      disabled={!isEmailVerified}
                      className={field}
                    />
                    <label className="flex items-center gap-2 pt-0.5 text-xs text-slate-600">
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
                  </div>

                  {!contactIsWhatsapp && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">WhatsApp Number *</label>
                      <div className="relative">
                        <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" size={18} />
                        <input
                          type="tel" autoComplete="tel" required={isEmailVerified}
                          value={formData.whatsapp}
                          onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                          placeholder="+91 90000 11111"
                          disabled={!isEmailVerified}
                          className={withIcon}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Departments Relevant to Your Institution">
                <p className="-mt-1 text-xs text-slate-500">
                  Select the departments relevant to your institution. Your selection helps us identify
                  areas where additional resources and materials are needed.
                </p>
                {/* Interests, not permissions. Every member reads the whole
                    library whatever they pick here; this only tells us where to
                    collect more. Note that the wording no longer says so — it
                    used to, and if members start believing their choices narrow
                    what they can read, that reassurance is the line to put back. */}
                <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
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
                          chosen ? 'bg-blue-600 text-white'
                                 : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
                <p className="-mt-1 text-[11px] text-slate-400">
                  {formData.interestedDomains.length
                    ? `${formData.interestedDomains.length} chosen`
                    : 'Choose at least one'}
                </p>
              </Section>

              <Section title="Your password">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Password *</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required={isEmailVerified}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••"
                        disabled={!isEmailVerified}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={!isEmailVerified}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <div className={`transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>
              <div className="mb-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="group flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs leading-snug text-slate-600">
                    I explicitly consent and agree to the <Link to="/terms-and-conditions" className="font-bold text-blue-600 hover:underline">Terms of Service</Link>.
                  </span>
                </label>

                <label className="group flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs leading-snug text-slate-600">
                    I explicitly consent to the collection, processing, and storage of my personal data as described in the <Link to="/privacy-policy" className="font-bold text-blue-600 hover:underline">Privacy Policy</Link> (in compliance with GDPR and DPDP Act).
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !isEmailVerified || !acceptedTerms || !acceptedPrivacy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Creating Account…' : 'Create Account'} <ArrowRight size={16} />
              </button>
            </div>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-slate-500">
              Already have an account? <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
