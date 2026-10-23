import { getAttribution, clearAttribution } from './attribution';
const API_URL = '/api/auth';

export interface AuthResponse {
  token: string;
  user: any;
}

/** What the server says after it has verified a Google credential. See POST /api/auth/google. */
export type GoogleResult =
  | { status: 'AUTHENTICATED'; token: string; user: any; linked?: boolean }
  | { status: 'PROFILE_REQUIRED'; onboardingToken: string; google: { email: string; name: string | null; picture: string | null } }
  | { status: 'ACCOUNT_LINK_REQUIRED'; linkToken: string; email: string; hasPassword: boolean; google: { name: string | null; picture: string | null } };

/** POST JSON; a refusal comes back as an Error carrying the server's `code` and HTTP `status`. */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure: any = new Error(data?.error || 'Request failed');
    failure.code = data?.code; failure.status = response.status;
    throw failure;
  }
  return data as T;
}

export const authApi = {
  getToken: () => localStorage.getItem('token'),
  setToken: (token: string) => localStorage.setItem('token', token),
  clearToken: () => localStorage.removeItem('token'),

  async signup(email: string, password: string, name: string, organization?: string, contact?: string, designation?: string, interestedDomains?: string[], extra?: { registrantType?: string; state?: string; country?: string; whatsapp?: string }): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Whatever link brought them here, travelling with the account it made.
      body: JSON.stringify({ email, password, name, organization, contact, designation, interestedDomains, ...(extra || {}), attribution: getAttribution() }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Signup failed');
    }
    
    const data = await response.json();
    this.setToken(data.token);
    // Recorded on the account now, so a shared machine cannot credit the next
    // person who signs up on it to the same mailing.
    clearAttribution();
    return data;
  },

  async login(email: string, password: string, replaceExisting = false): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...(replaceExisting ? { replaceExisting: true } : {}) }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      const failure: any = new Error(error.error || 'Login failed');
      failure.code = error.code;
      throw failure;
    }
    
    const data = await response.json();
    this.setToken(data.token);
    return data;
  },

  async getMe(): Promise<any> {
    const token = this.getToken();
    if (!token) return null;

    const response = await fetch(`${API_URL}/me`, {
      headers: { 
        'Authorization': `Bearer ${token}` 
      },
    });
    
    if (response.status === 401 || response.status === 403) {
      this.clearToken();
      return null;
    }

    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }
    
    return response.json();
  },

  logout() {
    this.clearToken();
  },

  /** Sends Google's credential, and only that. The server verifies it; nothing the browser says about the person is believed. */
  async google(credential: string, replaceExisting = false): Promise<GoogleResult> {
    const data = await postJson<GoogleResult>('/google', { credential, ...(replaceExisting ? { replaceExisting: true } : {}) });
    if (data.status === 'AUTHENTICATED') this.setToken(data.token);
    return data;
  },

  /** Finishes a new member's registration after Google has been verified. `onboardingToken` is the server's proof of that. */
  async googleCompleteSignup(payload: Record<string, unknown>): Promise<GoogleResult> {
    const data = await postJson<GoogleResult>('/google/complete-signup', { ...payload, attribution: getAttribution() });
    if (data.status === 'AUTHENTICATED') { this.setToken(data.token); clearAttribution(); }
    return data;
  },

  /** Connects Google to an existing account once the person has proved it is theirs with its password. */
  async googleLink(linkToken: string, password: string, replaceExisting = false): Promise<GoogleResult> {
    const data = await postJson<GoogleResult>('/google/link', { linkToken, password, ...(replaceExisting ? { replaceExisting: true } : {}) });
    if (data.status === 'AUTHENTICATED') this.setToken(data.token);
    return data;
  },
};
