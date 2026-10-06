import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Eye, EyeOff, Mail, User, Building, Building2, Briefcase, GraduationCap, MapPin, MessageCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";
import { Button, friendlyError } from "./ui";

import { EmailVerificationInput } from "./EmailVerificationInput";
import { DOMAINS, REGISTRANT_TYPES, DESIGNATION_GROUPS, COUNTRIES } from "../constants";
import { INDIAN_STATES } from "../lib/gstUtils";

/**
 * A small heading with a rule, so the form reads as four short questions.
 *
 * Defined out here, not inside Signup. A component declared inside another is a
 * new type on every render, so React throws away everything under it and builds
 * it again — which, in a form, means the field being typed into is destroyed
 * after each keystroke and the cursor lands back on the page. That is exactly
 * what happened: one letter, then the caret was gone.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 flex w-full items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        {title}
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
      </legend>
      {children}
    </fieldset>
  );
}

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
      // A Solo Learner picks Free or Premium straight away; everyone else goes to the dashboard.
      navigate(formData.registrantType === 'Solo' ? '/dashboard/subscribe' : '/dashboard');
    } catch (error: any) {
      toast.error(friendlyError(error, 'We could not create your account. Please try again.'));
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

  const field = 'input h-11';
  const withIcon = 'input h-11 pl-10';

  return (
    // Inside the public layout, which already has a header and footer — so
    // top padding only, never a min-h-screen of its own.
    <div className="bg-ground px-4 pt-6 pb-12 sm:pt-12 lg:pt-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-3">
            <img src="/logo.png" alt="STM Digital Library Logo" className="h-10 w-10 object-contain" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-lg font-bold tracking-tight text-ink">STM Library</span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-widest text-accent">Digital Access</span>
            </div>
          </Link>
          <h1 className="type-page-title text-ink">Create Your Account</h1>
          <p className="mt-2 text-sm text-muted">Free Subscription — the whole library, half an hour at a time.</p>
        </div>

        <div className="card p-5 sm:p-8">
          <form className="space-y-8" onSubmit={handleSignup}>

            {/* The address gates everything after it, so it stands alone. */}
            <div className="rounded-xl border border-rule bg-surface-2 p-4">
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
                <div className="field">
                  <p id="signup-registrant-label" className="field-label">I am registering as<span className="req" aria-hidden="true">*</span></p>
                  <div className="rounded-xl border border-rule bg-surface-2 p-1.5">
                    <div role="group" aria-labelledby="signup-registrant-label" className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      {REGISTRANT_TYPES.map(t => {
                        const Icon = t.id === 'Institute' ? Building2 : t.id === 'Corporate' ? Briefcase : GraduationCap;
                        const on = formData.registrantType === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={!isEmailVerified}
                            onClick={() => setFormData(f => ({ ...f, registrantType: t.id, designation: '' }))}
                            aria-pressed={on}
                            className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-center text-xs font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              on ? 'bg-surface text-accent shadow-sm ring-1 ring-rule-2'
                                 : 'text-muted hover:bg-surface hover:text-ink'}`}
                          >
                            <Icon size={18} className={on ? 'text-accent' : 'text-faint'} aria-hidden="true" />
                            {t.label}
                          </button>
                        );
                      })}
                    </div>

                    {chosenType ? (
                      <div className="mt-1.5 space-y-3 rounded-lg bg-surface p-4">
                        <p className="field-label flex flex-wrap items-baseline gap-x-2">
                          <span>Designation / Role<span className="req" aria-hidden="true">*</span></span>
                          <span className="text-xs font-normal text-muted">{chosenType.hint}</span>
                        </p>

                        {/* Laid out rather than hidden behind a dropdown.
                            A native select is drawn by the operating system —
                            it cannot be styled, it covers the page, and it asks
                            for two clicks to answer a question the member can
                            answer at a glance. Eighteen roles fit here, grouped,
                            and take one.
                            Once one is taken the list folds away to the answer.
                            Left open it is three hundred pixels of a form that
                            is already four screens long on a phone, all of it
                            about a question that has been settled. */}
                        {formData.designation ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-on">
                              {formData.designation}
                            </span>
                            <button
                              type="button"
                              onClick={() => setFormData(f => ({ ...f, designation: '' }))}
                              className="text-xs font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                        <div className="space-y-2.5">
                          {(DESIGNATION_GROUPS[chosenType.id] || []).map(g => (
                            <div key={g.label}>
                              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                                {g.label}
                              </p>
                              <div role="group" aria-label={g.label} className="flex flex-wrap gap-1.5">
                                {g.roles.map(r => {
                                  const on = formData.designation === r;
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      disabled={!isEmailVerified}
                                      onClick={() => setFormData(f => ({ ...f, designation: on ? '' : r }))}
                                      aria-pressed={on}
                                      className={`min-h-[32px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                        on ? 'bg-accent text-accent-on'
                                           : 'border border-rule bg-surface-2 text-ink-2 hover:border-accent/40 hover:bg-accent-soft hover:text-accent'}`}
                                    >
                                      {r}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        )}
                      </div>
                    ) : (
                      <p className="px-3 py-3 text-center text-xs text-muted">
                        Choose one above, and the roles for it appear here.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field">
                    <label htmlFor="signup-name" className="field-label">Full Name<span className="req" aria-hidden="true">*</span></label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                      <input
                        id="signup-name"
                        type="text" autoComplete="name" required={isEmailVerified}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Dr. John Doe"
                        disabled={!isEmailVerified}
                        className={withIcon}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="signup-organization" className="field-label">Organization / University<span className="req" aria-hidden="true">*</span></label>
                    <div className="relative">
                      <Building className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                      <input
                        id="signup-organization"
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
                  <div className="field">
                    <label htmlFor="signup-country" className="field-label">Country<span className="req" aria-hidden="true">*</span></label>
                    <select
                      id="signup-country"
                      required={isEmailVerified} autoComplete="country-name"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value, state: '' })}
                      disabled={!isEmailVerified}
                      className={field}
                    >
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="signup-state" className="field-label">State<span className="req" aria-hidden="true">*</span></label>
                    {formData.country === 'India' ? (
                      <select
                        id="signup-state"
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
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                        <input
                          id="signup-state"
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
                  <div className="field">
                    <label htmlFor="signup-contact" className="field-label">Contact Number<span className="req" aria-hidden="true">*</span></label>
                    <input
                      id="signup-contact"
                      type="tel" autoComplete="tel" required={isEmailVerified}
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      placeholder="+91 98765 43210"
                      disabled={!isEmailVerified}
                      className={field}
                    />
                    <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-ink-2">
                      <input
                        type="checkbox"
                        checked={contactIsWhatsapp}
                        disabled={!isEmailVerified}
                        onChange={(e) => setContactIsWhatsapp(e.target.checked)}
                        className="h-4 w-4 rounded border-rule-2 accent-[var(--accent)]"
                      />
                      <MessageCircle size={14} className="text-success" aria-hidden="true" />
                      This is also my WhatsApp number
                    </label>
                  </div>

                  {!contactIsWhatsapp && (
                    <div className="field">
                      <label htmlFor="signup-whatsapp" className="field-label">WhatsApp Number<span className="req" aria-hidden="true">*</span></label>
                      <div className="relative">
                        <MessageCircle className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-success" size={18} aria-hidden="true" />
                        <input
                          id="signup-whatsapp"
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
                <p id="signup-departments-help" className="-mt-1 text-sm text-muted">
                  Select the departments relevant to your institution. Your selection helps us identify
                  areas where additional resources and materials are needed.
                </p>
                {/* Interests, not permissions. Every member reads the whole
                    library whatever they pick here; this only tells us where to
                    collect more. Note that the wording no longer says so — it
                    used to, and if members start believing their choices narrow
                    what they can read, that reassurance is the line to put back. */}
                {/* The inner scroll only exists where there is a mouse. On a
                    phone a short scrolling box inside a long scrolling page
                    catches the finger and holds it. */}
                <div role="group" aria-label="Departments" aria-describedby="signup-departments-help" className="flex flex-wrap gap-1.5 rounded-xl border border-rule bg-surface-2 p-3 sm:max-h-52 sm:overflow-y-auto">
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
                        aria-pressed={chosen}
                        className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          chosen ? 'border border-accent bg-accent text-accent-on'
                                 : 'border border-rule bg-surface text-ink-2 hover:border-accent/40 hover:bg-accent-soft hover:text-accent'}`}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
                <p className="-mt-1 text-xs text-muted" aria-live="polite">
                  {formData.interestedDomains.length
                    ? `${formData.interestedDomains.length} chosen`
                    : 'Choose at least one'}
                </p>
              </Section>

              <Section title="Your password">
                <div className="grid gap-4">
                  <div className="field">
                    <label htmlFor="signup-password" className="field-label">Password<span className="req" aria-hidden="true">*</span></label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required={isEmailVerified}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Choose a password"
                        disabled={!isEmailVerified}
                        className="input h-11 pl-10 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={!isEmailVerified}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
                      >
                        {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <div className={`transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>
              <div className="mb-5 space-y-3 rounded-xl border border-rule bg-surface-2 p-4">
                <label className="group flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-rule-2 accent-[var(--accent)]"
                  />
                  <span className="text-sm leading-snug text-ink-2">
                    I explicitly consent and agree to the <Link to="/terms-and-conditions" className="font-semibold text-accent hover:underline">Terms of Service</Link>.
                  </span>
                </label>

                <label className="group flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-rule-2 accent-[var(--accent)]"
                  />
                  <span className="text-sm leading-snug text-ink-2">
                    I explicitly consent to the collection, processing, and storage of my personal data as described in the <Link to="/privacy-policy" className="font-semibold text-accent hover:underline">Privacy Policy</Link> (in compliance with GDPR and DPDP Act).
                  </span>
                </label>
              </div>

              <Button
                type="submit"
                variant="brand"
                size="lg"
                block
                loading={loading}
                disabled={!isEmailVerified || !acceptedTerms || !acceptedPrivacy}
              >
                {loading ? 'Creating Account…' : <>Create Account <ArrowRight size={16} aria-hidden="true" /></>}
              </Button>
            </div>
          </form>

          <div className="mt-8 border-t border-rule pt-6 text-center">
            <p className="text-sm text-muted">
              Already have an account? <Link to="/login" className="font-semibold text-accent hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
