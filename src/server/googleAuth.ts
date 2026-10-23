/**
 * Sign in with Google: proving who someone is. Nothing else.
 *
 * Google answers one question here, "is this person the holder of this Google account?". What they may open is not
 * decided by it: that stays with the entitlement resolver, as it does for a password. Signing in this way ends in the
 * ordinary STM session (`startSession` in server.ts), so the account rules (blocked, pending deletion, the
 * simultaneous-login limit) apply exactly as they do to a password.
 *
 * The browser sends only the credential Google handed it. It is verified here (signature, issuer, audience, expiry) and
 * only then are its claims believed. Nothing the browser says about who it is, beyond that credential, is trusted. The
 * credential is not stored and is not a session: it is thrown away once read.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

export const GOOGLE = 'GOOGLE';

export type GoogleClaims = { sub: string; email: string; name: string | null; picture: string | null };

export type GoogleAuthCode = 'GOOGLE_UNAVAILABLE' | 'INVALID_GOOGLE_TOKEN' | 'GOOGLE_EMAIL_NOT_VERIFIED';
export class GoogleAuthError extends Error {
  constructor(public code: GoogleAuthCode, message: string) { super(message); }
}

/** The OAuth client ID the credential must have been issued to. Read each time, so a missing one only disables Google. */
const audience = () => String(process.env.GOOGLE_CLIENT_ID || '').trim();

/**
 * Why an ID cannot be a real Google client ID, or null. A real one is a project number, a hyphen, then lower-case letters and digits, then
 * `.apps.googleusercontent.com`. One with a capital letter, a space or another suffix (a `0` typed as `O` is the classic) names no client at
 * Google, so every sign-in with it ends in "The OAuth client was not found": it is refused here instead of being handed to a browser.
 */
export function googleClientIdProblem(id: string): string | null {
  if (!id) return 'GOOGLE_CLIENT_ID is not set';
  if (/\s/.test(id)) return 'it contains whitespace';
  if (!id.endsWith('.apps.googleusercontent.com')) return 'it does not end in .apps.googleusercontent.com';
  const [project, ...rest] = id.slice(0, -'.apps.googleusercontent.com'.length).split('-');
  if (!/^\d{6,}$/.test(project) || rest.length !== 1) return 'it is not <project number>-<id>';
  if (/[^a-z0-9]/.test(rest[0])) return `it has a character a Google client ID never has ("${rest[0].replace(/[a-z0-9]/g, '')}": letters are lower-case, so a capital O is not a zero)`;
  if (rest[0].length < 20) return 'it is too short';
  return null;
}

/** Google sign-in is on only for a client ID that could exist. */
export const googleConfigured = () => !googleClientIdProblem(audience());

/** The client ID the browser must use: the very one credentials are verified against. Public by design; null when sign-in is off. */
export const googleClientIdForBrowser = (): string | null => (googleConfigured() ? audience() : null);

/** For the Super Admin's diagnostic and the start-up log: what is configured, masked, and what is wrong with it. Never a secret. */
export function googleStatus() {
  const id = audience();
  const problem = googleClientIdProblem(id);
  const legacy = String(process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  return {
    enabled: !problem,
    problem,
    clientIdMasked: id ? `${id.slice(0, 12)}…${id.slice(-34)}` : null,
    // The browser no longer reads a build-time ID. If one is still set in the environment it is ignored, and a difference is worth knowing.
    buildVariablePresent: !!legacy,
    buildVariableMatches: legacy ? legacy === id : null,
  };
}

let client: OAuth2Client | null = null;

/**
 * For the automated tests only: Google's public keys, supplied instead of fetched, so the verification below (signature, issuer,
 * audience, expiry) still runs for real against tokens a test signed itself. Refused in production, so it cannot be a way around it.
 */
let testCerts: Record<string, string> | null = null;
export function setGoogleCertsForTests(certs: Record<string, string> | null) {
  if (process.env.NODE_ENV === 'production') throw new Error('setGoogleCertsForTests is not available in production');
  testCerts = certs;
}
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * Verifies a Google credential and returns the claims worth having. Throws GoogleAuthError for anything wrong with it.
 * `verifyIdToken` checks the signature against Google's published keys, the issuer, the expiry and that the audience is
 * this site's client ID; an unverified email is refused here because an address Google has not confirmed proves nothing.
 */
export async function verifyGoogleCredential(credential: unknown): Promise<GoogleClaims> {
  const aud = audience();
  if (!aud) throw new GoogleAuthError('GOOGLE_UNAVAILABLE', 'Google sign-in is not configured on this server.');
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 8192) {
    throw new GoogleAuthError('INVALID_GOOGLE_TOKEN', 'The Google credential is not valid.');
  }
  client ||= new OAuth2Client();
  let payload: any;
  try {
    const ticket = testCerts
      ? await client.verifySignedJwtWithCertsAsync(credential, testCerts, aud, ISSUERS)
      : await client.verifyIdToken({ idToken: credential, audience: aud });
    payload = ticket.getPayload();
  } catch {
    throw new GoogleAuthError('INVALID_GOOGLE_TOKEN', 'The Google credential is not valid.');
  }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email) {
    throw new GoogleAuthError('INVALID_GOOGLE_TOKEN', 'The Google credential is not valid.');
  }
  if (payload.email_verified !== true) {
    throw new GoogleAuthError('GOOGLE_EMAIL_NOT_VERIFIED', 'Google has not verified this email address.');
  }
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 120) : null,
    picture: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture.slice(0, 500) : null,
  };
}

/**
 * Short-lived proof that THIS server verified a Google credential, handed to the browser to finish a step. Signed with a key
 * derived from the session secret AND the purpose, so neither kind can be presented as the other, and neither can be used as a
 * session token (which is signed with the secret itself and must name a live session).
 */
type Purpose = 'onboarding' | 'link';
const keyFor = (secret: string, purpose: Purpose) => crypto.createHmac('sha256', secret).update(`stm-google-${purpose}`).digest('hex');
const LIFETIME: Record<Purpose, string> = { onboarding: '15m', link: '10m' };

export type OnboardingClaims = { sub: string; email: string; name: string | null; picture: string | null };
export type LinkClaims = OnboardingClaims & { uid: string };

export const signGoogleToken = (secret: string, purpose: Purpose, claims: OnboardingClaims | LinkClaims) =>
  jwt.sign({ typ: `google-${purpose}`, ...claims }, keyFor(secret, purpose), { expiresIn: LIFETIME[purpose] as any, algorithm: 'HS256' });

/** The claims inside a token this server issued for `purpose`, or null if it is forged, expired or for the other purpose. */
export function readGoogleToken<T extends OnboardingClaims>(secret: string, purpose: Purpose, token: unknown): T | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  try {
    const d: any = jwt.verify(token, keyFor(secret, purpose), { algorithms: ['HS256'] });
    if (d?.typ !== `google-${purpose}` || typeof d.sub !== 'string' || typeof d.email !== 'string') return null;
    return d as T;
  } catch { return null; }
}
