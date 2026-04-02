const API_BASE_URL = '/api';

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  
  // if (!response.ok) {
  //   const error = await response.json().catch(() => ({ error: 'Network response was not ok' }));
  //   throw new Error(error.error || error.message || 'Unknown Error');
  // }
  
  // For simplicity we return the JSON. A production app handles errors strictly here.
  if (response.headers.get('content-type')?.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export const api = {
  auth: {
    login: (data: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    signup: (data: any) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me', { method: 'GET' }),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
  users: {
    getAll: () => request('/users', { method: 'GET' }),
    update: (id: string, data: any) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  },
  subscriptions: {
    getMy: () => request('/subscriptions/my', { method: 'GET' }),
    getAll: () => request('/subscriptions', { method: 'GET' }),
    update: (id: string, data: any) => request(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  payments: {
    createOrder: (data: any) => request('/payment/order', { method: 'POST', body: JSON.stringify(data) }),
    verifyPayment: (data: any) => request('/payment/verify', { method: 'POST', body: JSON.stringify(data) }),
  },
  quotations: {
    create: (data: any) => request('/quotations', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/quotations/${id}`, { method: 'GET' }),
  },
  invoices: {
    create: (data: any) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/invoices/${id}`, { method: 'GET' }),
  },
  content: {
    getAll: () => request('/content', { method: 'GET' }),
    create: (data: any) => request('/content', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/content/${id}`, { method: 'DELETE' }),
  }
};
