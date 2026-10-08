import React, { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Eye, EyeOff, User, Building, Building2, Briefcase, GraduationCap, MapPin, Check, ChevronDown, Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";
import { Button, friendlyError } from "./ui";

import { EmailVerificationInput } from "./EmailVerificationInput";
import { DOMAINS, REGISTRANT_TYPES, DESIGNATION_GROUPS, DESIGNATIONS_BY_TYPE, POPULAR_DESIGNATIONS, COUNTRIES, COUNTRY_DIAL_CODES } from "../constants";
import { INDIAN_STATES } from "../lib/gstUtils";

/**
 * A small heading with a rule, so the form reads as four short questions.
 *
 * Defined out here, not inside Signup. A component declared inside another is a
 * new type on every render, so React throws away everything under it and builds
 * it again — which, in a form, means the field being typed into is destroyed
 * after each keystroke and the cursor lands back on the page. That is exactly
 * what happened: one letter, then the caret was gone. Everything below that
 * holds an input follows the same rule.
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

/** Label, control, then the one line of help or error under it. The control wires itself to `${id}-error` / `${id}-help`. */
function FieldShell({ id, label, required, optional, help, error, children }: {
  id: string; label: React.ReactNode; required?: boolean; optional?: boolean;
  help?: React.ReactNode; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
        {optional && <span className="ml-1.5 text-xs font-normal text-muted">(Optional)</span>}
      </label>
      {children}
      {error ? <p id={`${id}-error`} className="field-error">{error}</p>
        : help ? <p id={`${id}-help`} className="field-help">{help}</p> : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, help?: boolean) =>
  error ? `${id}-error` : help ? `${id}-help` : undefined;

/** One role. Compact, the same everywhere, and marked by a tick as well as by colour. */
function RoleChip({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${
        on ? 'border-accent bg-accent text-accent-on'
           : 'border-rule bg-surface-2 text-ink-2 hover:border-accent/40 hover:bg-accent-soft hover:text-accent'}`}
    >
      {on && <Check size={13} strokeWidth={3} aria-hidden="true" />}
      {label}
    </button>
  );
}

const OTHER = 'Other';

/**
 * Role, asked as: a search box, the handful most people at this kind of place
 * hold, and the whole directory only on request. Eighteen to thirty-odd chips
 * laid out the moment a type is chosen made the page four screens long to
 * answer a question most members answer from the first row.
 *
 * Holds its own search text and open/closed state, so typing in the box
 * re-renders this and nothing else, and the full directory is not built at all
 * until it is opened.
 */
function RolePicker({ type, value, isOther, error, notice, disabled, onPick, onOther, onBlur }: {
  type: string; value: string; isOther: boolean; error?: string; notice?: string; disabled: boolean;
  onPick: (role: string) => void; onOther: () => void; onBlur: () => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const groups = DESIGNATION_GROUPS[type] || [];
  // Flat, once per type: the search runs over this on every keystroke.
  const flat = useMemo(
    () => groups.flatMap(g => g.roles.map(role => ({ role, haystack: `${role} ${g.label}`.toLowerCase() }))),
    [type] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const words = q.split(/\s+/);
    return flat.filter(r => words.every(w => r.haystack.includes(w))).map(r => r.role);
  }, [flat, q]);

  const popular = (POPULAR_DESIGNATIONS[type] || []).filter(r => (DESIGNATIONS_BY_TYPE[type] || []).includes(r));
  const searching = q.length > 0;
  const chip = (r: string) => (
    <RoleChip key={r} label={r} on={!isOther && value === r} disabled={disabled} onClick={() => onPick(r)} />
  );
  const otherChip = <RoleChip key={OTHER} label={OTHER} on={isOther} disabled={disabled} onClick={onOther} />;

  return (
    <div className="field">
      <label htmlFor="signup-role-search" className="field-label">
        Designation / Role<span className="req" aria-hidden="true">*</span>
      </label>

      {!type ? (
        <p className="rounded-lg border border-dashed border-rule bg-surface-2 px-3 py-3 text-xs text-muted">
          Choose what you are registering as, and suggested roles for it appear here.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
            <input
              id="signup-role-search"
              type="search" autoComplete="off" enterKeyHint="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onBlur={onBlur}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="Search your role..."
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy('signup-role', error)}
              className="input h-11 pl-10"
            />
          </div>

          <p className="min-h-[1.25rem] text-xs text-ink-2" aria-live="polite">
            {isOther ? <>Selected: <strong className="font-semibold">Other</strong></>
              : value ? <>Selected: <strong className="font-semibold">{value}</strong></> : null}
          </p>

          {searching ? (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted" aria-live="polite">
                {results.length ? `${results.length} matching ${results.length === 1 ? 'role' : 'roles'}` : 'No matching role'}
              </p>
              <div role="group" aria-label="Matching roles" className="flex flex-wrap gap-1.5">
                {results.map(chip)}
                {otherChip}
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Popular roles</p>
                <div role="group" aria-label="Popular roles" className="flex flex-wrap gap-1.5">
                  {popular.map(chip)}
                  {otherChip}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                aria-controls="signup-role-all"
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md text-xs font-semibold text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {expanded ? 'Show less' : 'View all roles'}
                <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {expanded && (
                <div id="signup-role-all" className="space-y-3 rounded-lg border border-rule bg-surface-2 p-3">
                  {groups.filter(g => g.roles.length).map(g => (
                    <div key={g.label}>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{g.label}</p>
                      <div role="group" aria-label={g.label} className="flex flex-wrap gap-1.5">{g.roles.map(chip)}</div>
                    </div>
                  ))}
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Not listed</p>
                    <div className="flex flex-wrap gap-1.5">{otherChip}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error ? <p id="signup-role-error" className="field-error">{error}</p>
        : notice ? <p id="signup-role-notice" className="field-help" aria-live="polite">{notice}</p> : null}
    </div>
  );
}

/** What the number field accepts, in the words a member would use. Null when it is fine. */
function phoneProblem(dial: string, raw: string): string | null {
  const t = raw.trim();
  if (!t) return 'Please enter your mobile number.';
  if (/[^\d\s()+-]/.test(t)) return 'Please enter a valid mobile number — digits only.';
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? null : 'Please enter a valid mobile number.';
  if (!dial) return 'Please start the number with your country code, for example +44.';
  const local = digits.replace(/^0+/, '');
  if (dial === '+91') return local.length === 10 ? null : 'Please enter a valid 10-digit mobile number.';
  return local.length >= 6 && local.length <= 14 ? null : 'Please enter a valid mobile number.';
}

/** The number as the server has always received it: code, space, number. */
function buildContact(dial: string, raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.startsWith('+')) return t;
  const local = t.replace(/^0+/, '');
  return dial ? `${dial} ${local}` : local;
}

/** Per kind of registrant: what the organisation line is called, and whether it can be left empty. */
const ORGANISATION: Record<string, { label: string; placeholder: string; required: boolean; missing: string }> = {
  Institute: { label: 'Institution / University', placeholder: 'Enter institution / university name', required: true, missing: 'Please enter your institution name.' },
  Corporate: { label: 'Company / Organization', placeholder: 'Enter company / organization name', required: true, missing: 'Please enter your company name.' },
  Solo: { label: 'Affiliation / Organization', placeholder: 'University, institute, company, or independent', required: false, missing: '' },
};
const ORGANISATION_NEUTRAL = { label: 'Institution / Company / Affiliation', placeholder: 'Enter your organization name', required: false, missing: '' };

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>> = {
  Institute: Building2, Corporate: Briefcase, Solo: GraduationCap,
};

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
  });
  // "Other" is not a stored role. What the member writes is sent as the designation, which the
  // server keeps out of the counted column and files with the lead instead.
  const [roleIsOther, setRoleIsOther] = useState(false);
  const [customRole, setCustomRole] = useState('');
  const [roleNotice, setRoleNotice] = useState('');
  // The calling code follows the country until the member picks one themselves.
  const [dialCountry, setDialCountry] = useState('India');
  const [dialChosen, setDialChosen] = useState(false);
  // An opt-in, so it starts empty. Ticking it sends the contact number as the WhatsApp one.
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  // A field shows its problem once it has been left, or once Create Account has been pressed.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  // A ref, not state: two quick clicks both read state from before the first one's re-render.
  const submitting = useRef(false);

  const chosenType = REGISTRANT_TYPES.find(t => t.id === formData.registrantType) || null;
  const org = (formData.registrantType && ORGANISATION[formData.registrantType]) || ORGANISATION_NEUTRAL;
  const dial = COUNTRY_DIAL_CODES[dialCountry] || '';
  const isIndia = formData.country === 'India';

  const errors: Record<string, string> = {};
  if (!formData.registrantType) errors.type = 'Please tell us what you are registering as.';
  if (!formData.name.trim()) errors.name = 'Please enter your full name.';
  if (org.required && !formData.organization.trim()) errors.organization = org.missing;
  if (roleIsOther) {
    if (!customRole.trim()) errors.customRole = 'Please enter your designation.';
  } else if (!formData.designation) {
    errors.role = 'Please select your designation / role.';
  }
  if (!formData.country) errors.country = 'Please select your country.';
  if (!formData.state.trim()) errors.state = isIndia ? 'Please select your state.' : 'Please enter your state, province or region.';
  const phoneErr = phoneProblem(dial, formData.contact);
  if (phoneErr) errors.contact = phoneErr;
  if (!formData.interestedDomains.length) errors.departments = 'Please select at least one department relevant to your institution.';
  if (!formData.password) errors.password = 'Please choose a password.';

  const show = (k: string) => (touched[k] || submitted) && errors[k] ? errors[k] : undefined;
  const touch = (k: string) => () => setTouched(t => (t[k] ? t : { ...t, [k]: true }));

  const chooseType = (id: string) => {
    if (id === formData.registrantType) return;
    // Only the role is at stake: it may not exist under the new type. Everything else the member
    // has typed stays where it is.
    const keeps = !formData.designation || (DESIGNATIONS_BY_TYPE[id] || []).includes(formData.designation);
    setFormData(f => ({ ...f, registrantType: id, designation: keeps ? f.designation : '' }));
    // The reset role is explained rather than flagged as an error the member did not make.
    if (!keeps) setTouched(t => ({ ...t, role: false }));
    setRoleNotice(keeps ? '' : `"${formData.designation}" is not offered for ${REGISTRANT_TYPES.find(t => t.id === id)?.label}. Please choose your role again.`);
  };

  const pickRole = (role: string) => {
    setRoleIsOther(false);
    setRoleNotice('');
    setFormData(f => ({ ...f, designation: role }));
    setTouched(t => ({ ...t, role: true }));
  };

  const pickOther = () => {
    setRoleIsOther(true);
    setRoleNotice('');
    setFormData(f => ({ ...f, designation: '' }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setSubmitted(true);
    setServerError('');

    const order: [string, string][] = [
      ['type', 'signup-type-' + (REGISTRANT_TYPES[0]?.id || '')], ['name', 'signup-name'], ['organization', 'signup-organization'],
      ['role', 'signup-role-search'], ['customRole', 'signup-custom-role'], ['country', 'signup-country'], ['state', 'signup-state'],
      ['contact', 'signup-contact'], ['departments', 'signup-departments'], ['password', 'signup-password'],
    ];
    const first = order.find(([k]) => errors[k]);
    if (first) {
      const el = document.getElementById(first[1]);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (el as HTMLElement | null)?.focus({ preventScroll: true });
      return;
    }
    // With verification switched off the address box is not guarded by its code check.
    if (!formData.email.trim()) {
      setServerError('Please enter your email address.');
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setServerError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      const contact = buildContact(dial, formData.contact);
      await signup(formData.email, formData.password, formData.name.trim(), formData.organization.trim(), contact, roleIsOther ? customRole.trim() : formData.designation, formData.interestedDomains, {
        registrantType: formData.registrantType,
        state: formData.state.trim(),
        country: formData.country,
        // Stored as a number that can actually be used, not as a flag somebody
        // downstream has to remember to interpret. Empty unless they opted in.
        whatsapp: whatsappOptIn ? contact : '',
      });
      toast.success('Account created successfully!');
      // A Solo Learner picks Free or Premium straight away; everyone else goes to the dashboard.
      navigate(formData.registrantType === 'Solo' ? '/dashboard/subscribe' : '/dashboard');
    } catch (error: any) {
      // Everything they typed is still in state; only the message changes.
      setServerError(friendlyError(error, 'We could not create your account. Please try again.'));
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  const field = 'input h-11';
  const withIcon = 'input h-11 pl-10';
  const off = !isEmailVerified;

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
          {/* noValidate: the browser's one-at-a-time tooltip would pre-empt the
              inline messages, which say what is wrong beside each field at once. */}
          <form id="signup-form" className="space-y-8" onSubmit={handleSignup} noValidate>

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
                    means — what the organisation line is called, which roles
                    are suggested, and whether the organisation is required. */}
                <div className="field">
                  <p id="signup-registrant-label" className="field-label">I am registering as<span className="req" aria-hidden="true">*</span></p>
                  <div
                    role="radiogroup" aria-labelledby="signup-registrant-label" aria-required="true"
                    aria-describedby={describedBy('signup-registrant', show('type'))}
                    className="grid grid-cols-3 gap-2"
                  >
                    {REGISTRANT_TYPES.map(t => {
                      const Icon = TYPE_ICONS[t.id] || Building2;
                      const on = formData.registrantType === t.id;
                      return (
                        // A real radio under the card: arrow keys, one tab stop and
                        // the announced "selected, 1 of 3" all come with it.
                        <label
                          key={t.id}
                          className={`relative flex min-h-[68px] min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-1.5 py-3 text-center text-xs leading-tight transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 ${
                            on ? 'border-accent bg-accent-soft font-bold text-accent'
                               : 'border-rule bg-surface font-semibold text-muted hover:border-rule-2 hover:text-ink'} ${off ? 'cursor-not-allowed' : ''}`}
                        >
                          <input
                            id={`signup-type-${t.id}`}
                            type="radio" name="registrantType" value={t.id}
                            checked={on} disabled={off}
                            onChange={() => chooseType(t.id)}
                            onBlur={touch('type')}
                            className="sr-only"
                          />
                          {on && (
                            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-on" aria-hidden="true">
                              <Check size={10} strokeWidth={3.5} />
                            </span>
                          )}
                          <Icon size={18} className={on ? 'text-accent' : 'text-faint'} aria-hidden="true" />
                          <span className="break-words">{t.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {show('type') ? <p id="signup-registrant-error" className="field-error">{show('type')}</p>
                    : chosenType ? <p id="signup-registrant-help" className="field-help">{chosenType.hint}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell id="signup-name" label="Full Name" required error={show('name')}>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                      <input
                        id="signup-name"
                        type="text" autoComplete="name" aria-required="true"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        onBlur={touch('name')}
                        placeholder="Enter your full name"
                        disabled={off}
                        aria-invalid={show('name') ? true : undefined}
                        aria-describedby={describedBy('signup-name', show('name'))}
                        className={withIcon}
                      />
                    </div>
                  </FieldShell>

                  <FieldShell
                    id="signup-organization" label={org.label} required={org.required} optional={!!formData.registrantType && !org.required}
                    error={show('organization')}
                  >
                    <div className="relative">
                      <Building className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                      <input
                        id="signup-organization"
                        type="text" autoComplete="organization" aria-required={org.required}
                        value={formData.organization}
                        onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                        onBlur={touch('organization')}
                        placeholder={org.placeholder}
                        disabled={off}
                        aria-invalid={show('organization') ? true : undefined}
                        aria-describedby={describedBy('signup-organization', show('organization'))}
                        className={withIcon}
                      />
                    </div>
                  </FieldShell>
                </div>

                <RolePicker
                  type={formData.registrantType}
                  value={formData.designation}
                  isOther={roleIsOther}
                  error={show('role')}
                  notice={roleNotice}
                  disabled={off}
                  onPick={pickRole}
                  onOther={pickOther}
                  onBlur={touch('role')}
                />

                {roleIsOther && (
                  <FieldShell id="signup-custom-role" label="Your Designation" required error={show('customRole')}>
                    <input
                      id="signup-custom-role"
                      type="text" autoComplete="organization-title" maxLength={80} aria-required="true"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      onBlur={touch('customRole')}
                      placeholder="Enter your designation"
                      disabled={off}
                      aria-invalid={show('customRole') ? true : undefined}
                      aria-describedby={describedBy('signup-custom-role', show('customRole'))}
                      className={field}
                    />
                  </FieldShell>
                )}
              </Section>

              <Section title="Where you are">
                {/* Indian states are a known list and are offered as one;
                    everywhere else is typed, because it is not. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell id="signup-country" label="Country" required error={show('country')}>
                    <select
                      id="signup-country"
                      autoComplete="country-name" aria-required="true"
                      value={formData.country}
                      onChange={(e) => {
                        const country = e.target.value;
                        setFormData({ ...formData, country, state: '' });
                        if (!dialChosen) setDialCountry(country);
                      }}
                      disabled={off}
                      aria-invalid={show('country') ? true : undefined}
                      aria-describedby={describedBy('signup-country', show('country'))}
                      className={field}
                    >
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FieldShell>
                  <FieldShell id="signup-state" label={isIndia ? 'State / UT' : 'State / Province / Region'} required error={show('state')}>
                    {isIndia ? (
                      <select
                        id="signup-state"
                        autoComplete="address-level1" aria-required="true"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        onBlur={touch('state')}
                        disabled={off}
                        aria-invalid={show('state') ? true : undefined}
                        aria-describedby={describedBy('signup-state', show('state'))}
                        className={field}
                      >
                        <option value="">Choose your state / UT</option>
                        {INDIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    ) : (
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                        <input
                          id="signup-state"
                          type="text" autoComplete="address-level1" aria-required="true"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          onBlur={touch('state')}
                          placeholder="State, province or region"
                          disabled={off}
                          aria-invalid={show('state') ? true : undefined}
                          aria-describedby={describedBy('signup-state', show('state'))}
                          className={withIcon}
                        />
                      </div>
                    )}
                  </FieldShell>
                </div>
              </Section>

              <Section title="How we reach you">
                <FieldShell id="signup-contact" label="Mobile / Contact Number" required error={show('contact')}>
                  <div className="flex gap-2">
                    <select
                      aria-label="Country calling code"
                      value={dialCountry}
                      onChange={(e) => { setDialCountry(e.target.value); setDialChosen(true); }}
                      disabled={off}
                      className="input h-11 w-[7.25rem] shrink-0 truncate"
                    >
                      {COUNTRIES.map(c => (
                        <option key={c} value={c}>{COUNTRY_DIAL_CODES[c] ? `${COUNTRY_DIAL_CODES[c]} ${c}` : 'Other (type +code)'}</option>
                      ))}
                    </select>
                    <input
                      id="signup-contact"
                      type="tel" inputMode="tel" autoComplete="tel-national" aria-required="true"
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      onBlur={touch('contact')}
                      placeholder="Enter mobile number"
                      disabled={off}
                      aria-invalid={show('contact') ? true : undefined}
                      aria-describedby={describedBy('signup-contact', show('contact'))}
                      className="input h-11 min-w-0 flex-1"
                    />
                  </div>
                </FieldShell>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={whatsappOptIn}
                    disabled={off}
                    onChange={(e) => setWhatsappOptIn(e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-rule-2 accent-[var(--accent)]"
                  />
                  Use this number for WhatsApp communication
                </label>
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
                <div id="signup-departments" role="group" aria-label="Departments" aria-describedby="signup-departments-help" className="flex flex-wrap gap-1.5 rounded-xl border border-rule bg-surface-2 p-3 sm:max-h-52 sm:overflow-y-auto">
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
                {show('departments') ? (
                  <p id="signup-departments-error" className="field-error -mt-1">{errors.departments}</p>
                ) : (
                  <p className="-mt-1 text-xs text-muted" aria-live="polite">
                    {formData.interestedDomains.length
                      ? `${formData.interestedDomains.length} chosen`
                      : 'Choose at least one'}
                  </p>
                )}
              </Section>

              <Section title="Account details">
                <div className="grid gap-4">
                  <FieldShell id="signup-password" label="Password" required error={show('password')}>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password" aria-required="true"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        onBlur={touch('password')}
                        placeholder="Choose a password"
                        disabled={off}
                        aria-invalid={show('password') ? true : undefined}
                        aria-describedby={describedBy('signup-password', show('password'))}
                        className="input h-11 pl-10 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={off}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
                      >
                        {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </FieldShell>
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
                    I explicitly consent and agree to the <Link to="/terms-and-conditions" className="font-semibold text-accent hover:underline">Terms &amp; Conditions</Link>.
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
                    I explicitly consent to the collection, processing, and storage of my personal data as described in the <Link to="/privacy-policy" className="font-semibold text-accent hover:underline">Privacy Policy</Link>.
                  </span>
                </label>
              </div>

              {serverError && (
                <p role="alert" className="mb-4 rounded-lg border border-alarm/40 bg-alarm/10 px-3 py-2.5 text-sm font-medium text-alarm">
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                block
                loading={loading}
                disabled={!isEmailVerified || !acceptedTerms || !acceptedPrivacy}
              >
                {loading ? 'Creating account…' : <>Create Account <ArrowRight size={16} aria-hidden="true" /></>}
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
