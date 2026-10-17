/**
 * The assistant's pre-chat details: a name, and an email address or an Indian mobile number. One set of rules, used by
 * the form in the browser and again by the server, which never trusts what the browser sends.
 */

export const VISITOR_LIMITS = { name: 100, email: 254, emailLocal: 64, phoneRaw: 25 } as const;

export type VisitorInput = { name?: unknown; email?: unknown; phone?: unknown };
export type VisitorDetails = { name: string; email: string; phone: string };
export type VisitorErrors = Partial<Record<'name' | 'email' | 'phone' | 'contact', string>>;

export const VISITOR_MESSAGES = {
  nameRequired: 'Enter your full name.',
  nameShort: 'Enter at least 2 letters of your name.',
  nameChars: 'Use letters, spaces, periods, hyphens or apostrophes only.',
  nameLong: `Keep your name under ${VISITOR_LIMITS.name} characters.`,
  email: 'Enter a valid email address.',
  phone: 'Enter a valid 10-digit Indian mobile number.',
  contact: 'Enter either your email address or mobile number.',
} as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Letters of any script (with their accents), spaces, periods, hyphens and straight or curly apostrophes. */
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

export function normaliseName(v: unknown): string {
  return str(v).trim().replace(/\s+/g, ' ');
}

export function nameError(name: string): string | undefined {
  if (!name) return VISITOR_MESSAGES.nameRequired;
  if (name.length > VISITOR_LIMITS.name) return VISITOR_MESSAGES.nameLong;
  if (!NAME_CHARS.test(name)) return VISITOR_MESSAGES.nameChars;
  if ((name.match(/\p{L}/gu) || []).length < 2) return VISITOR_MESSAGES.nameShort;
  return undefined;
}

export function normaliseEmail(v: unknown): string {
  return str(v).trim().toLowerCase();
}

// A local part with no leading, trailing or doubled dot; a domain of letter/digit labels with a TLD of 2+ letters, so
// "name@domain" is refused. No spaces anywhere.
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > VISITOR_LIMITS.email) return false;
  const at = email.lastIndexOf('@');
  return at > 0 && at <= VISITOR_LIMITS.emailLocal && EMAIL_RE.test(email);
}

/**
 * Formatting a person might type, removed: spaces, hyphens, parentheses, then the country code (+91, 0091, or 91 in
 * front of ten digits) or a trunk 0. What is left is the number to store, digits only. Anything else stays in, so
 * letters or a foreign code fail validation instead of being quietly dropped.
 */
export function normalisePhone(v: unknown): string {
  let p = str(v).trim().slice(0, VISITOR_LIMITS.phoneRaw).replace(/[\s\-()]/g, '');
  if (p.startsWith('+91')) p = p.slice(3);
  else if (p.startsWith('0091') && p.length === 14) p = p.slice(4);
  else if (p.startsWith('91') && p.length === 12) p = p.slice(2);
  else if (p.startsWith('0') && p.length === 11) p = p.slice(1);
  return p;
}

export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9][0-9]{9}$/.test(phone);
}

/**
 * Name, plus a valid email or a valid mobile. A blank optional field is not checked; a filled one must be valid even when
 * the other one is, so a typo is caught rather than stored.
 */
export function validateVisitor(input: VisitorInput):
  { ok: true; value: VisitorDetails } | { ok: false; errors: VisitorErrors } {
  const name = normaliseName(input.name);
  const rawEmail = str(input.email).trim();
  const rawPhone = str(input.phone).trim();
  const email = normaliseEmail(rawEmail);
  const phone = rawPhone ? normalisePhone(rawPhone) : '';

  const errors: VisitorErrors = {};
  const n = nameError(name);
  if (n) errors.name = n;
  if (rawEmail && !isValidEmail(email)) errors.email = VISITOR_MESSAGES.email;
  if (rawPhone && !isValidIndianMobile(phone)) errors.phone = VISITOR_MESSAGES.phone;
  if (!rawEmail && !rawPhone) errors.contact = VISITOR_MESSAGES.contact;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, email, phone } };
}

/** What the greeting uses. Never sent to a model. */
export function firstName(name: string): string {
  return normaliseName(name).split(' ')[0] || '';
}
