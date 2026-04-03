const API_URL = '/api/auth';

export interface AuthResponse {
  token: string;
  user: any;
}

export const authApi = {
  getToken: () => localStorage.getItem('token'),
  setToken: (token: string) => localStorage.setItem('token', token),
  clearToken: () => localStorage.removeItem('token'),

  async signup(email: string, password: string, name: string, organization?: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, organization }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Signup failed');
    }
    
    const data = await response.json();
    this.setToken(data.token);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
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
  }
};
