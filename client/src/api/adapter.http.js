import { ApiError } from './errors';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'stayora.token';

async function requestEnvelope(path, { method = 'GET', body, params } = {}) {
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null),
      ).toString()}`
    : '';
  const token = localStorage.getItem(TOKEN_KEY);
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}${query}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', {
      code: 'NETWORK_ERROR',
      status: 0,
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.message || 'The request could not be completed.', {
      code: payload?.code || 'REQUEST_FAILED',
      status: response.status,
      details: payload?.details,
    });
  }
  return payload;
}

async function request(path, options) {
  const payload = await requestEnvelope(path, options);
  return payload?.data ?? payload;
}

/** List endpoints answer with `{ data, meta }` so pages can paginate server-side. */
async function requestPage(path, options) {
  const payload = await requestEnvelope(path, options);
  return { data: payload?.data ?? [], meta: payload?.meta || {} };
}

const http = {
  mode: 'http',

  auth: {
    async login(payload) {
      const session = await request('/auth/login', { method: 'POST', body: payload });
      if (session?.token) localStorage.setItem(TOKEN_KEY, session.token);
      return session;
    },
    async logout() {
      await request('/auth/logout', { method: 'POST' }).catch(() => null);
      localStorage.removeItem(TOKEN_KEY);
      return true;
    },
    async me() {
      const session = await request('/auth/me');
      return session;
    },
  },

  rooms: {
    list: (filters) => request('/rooms', { params: filters }),
    get: (id) => request(`/rooms/${id}`),
    create: (payload) => request('/rooms', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/rooms/${id}`, { method: 'PATCH', body: payload }),
    remove: (id) => request(`/rooms/${id}`, { method: 'DELETE' }),
    updateBed: (id, patch) => request(`/beds/${id}`, { method: 'PATCH', body: patch }),
  },

  reservations: {
    list: (filters) => request('/reservations', { params: filters }),
    listPage: (filters) => requestPage('/reservations', { params: filters }),
    outstanding: (limit = 500) => request('/reservations/outstanding', { params: { limit } }),
    get: (id) => request(`/reservations/${id}`),
    calendar: ({ start, end }) => request('/reservations/calendar', { params: { start, end } }),
    availability: (params) => request('/reservations/availability', { params }),
    create: (payload) => request('/reservations', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/reservations/${id}`, { method: 'PATCH', body: payload }),
    setStatus: (id, status) =>
      request(`/reservations/${id}/status`, { method: 'PATCH', body: { status } }),
  },

  guests: {
    list: (filters) => request('/guests', { params: filters }),
    listPage: (filters) => requestPage('/guests', { params: filters }),
    options: (params) => request('/guests/options', { params }),
    get: (id) => request(`/guests/${id}`),
    create: (payload) => request('/guests', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/guests/${id}`, { method: 'PATCH', body: payload }),
  },

  payments: {
    list: (filters) => request('/payments', { params: filters }),
    listPage: (filters) => requestPage('/payments', { params: filters }),
    create: (payload) => request('/payments', { method: 'POST', body: payload }),
    refund: (payload) => request('/payments/refunds', { method: 'POST', body: payload }),
    summary: (params) => request('/payments/summary', { params }),
  },

  expenses: {
    list: (filters) => request('/expenses', { params: filters }),
    listPage: (filters) => requestPage('/expenses', { params: filters }),
    create: (payload) => request('/expenses', { method: 'POST', body: payload }),
    remove: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),
    summary: (params) => request('/expenses/summary', { params }),
  },

  housekeeping: {
    list: (filters) => request('/housekeeping', { params: filters }),
    create: (payload) => request('/housekeeping', { method: 'POST', body: payload }),
    update: (id, patch) => request(`/housekeeping/${id}`, { method: 'PATCH', body: patch }),
  },

  staff: {
    list: () => request('/staff'),
    invite: (payload) => request('/staff', { method: 'POST', body: payload }),
    update: (id, patch) => request(`/staff/${id}`, { method: 'PATCH', body: patch }),
    remove: (id) => request(`/staff/${id}`, { method: 'DELETE' }),
  },

  dashboard: {
    get: (params) => request('/dashboard', { params }),
  },

  reports: {
    get: (params) => request('/reports', { params }),
  },

  settings: {
    get: () => request('/settings'),
    update: (patch) => request('/settings', { method: 'PATCH', body: patch }),
    reset: () => request('/settings/reset', { method: 'POST' }),
  },

  notifications: {
    list: () => request('/notifications'),
    markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
  },
};

export default http;
