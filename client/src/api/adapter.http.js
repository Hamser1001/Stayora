import { ApiError } from './errors';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'stayora.token';

function readToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function storeToken(token, persist = true) {
  const target = persist ? localStorage : sessionStorage;
  const other = persist ? sessionStorage : localStorage;
  target.setItem(TOKEN_KEY, token);
  other.removeItem(TOKEN_KEY);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

async function requestEnvelope(path, { method = 'GET', body, params } = {}) {
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null),
      ).toString()}`
    : '';
  const token = readToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}${query}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(
      err?.name === 'AbortError'
        ? 'The server took too long to respond. Check your connection and try again.'
        : 'Network error. Check your connection and try again.',
      { code: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', status: 0 },
    );
  } finally {
    clearTimeout(timer);
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
      if (session?.token) storeToken(session.token, payload?.remember !== false);
      return session;
    },
    async logout() {
      await request('/auth/logout', { method: 'POST' }).catch(() => null);
      clearToken();
      return true;
    },
    async me() {
      const session = await request('/auth/me');
      return session;
    },
    changePassword: (payload) =>
      request('/auth/change-password', { method: 'POST', body: payload }),
    updatePassword: (payload) =>
      request('/auth/profile/password', { method: 'PATCH', body: payload }),
    updateProfile: (payload) =>
      request('/auth/profile', { method: 'PATCH', body: payload }),
    updatePreferences: (payload) =>
      request('/auth/preferences', { method: 'PATCH', body: payload }),
    uploadAvatar: (image) =>
      request('/auth/profile/avatar', { method: 'POST', body: { image } }),
    removeAvatar: () => request('/auth/profile/avatar', { method: 'DELETE' }),
  },

  currency: {
    rates: ({ base, symbols } = {}) =>
      request('/currency/rates', {
        params: { base, symbols: symbols?.length ? symbols.join(',') : undefined },
      }),
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
    reorder: (updates) =>
      request('/housekeeping/reorder', { method: 'PATCH', body: { updates } }),
  },

  staff: {
    list: () => request('/staff'),
    meta: () => request('/staff/meta'),
    create: (payload) => request('/staff', { method: 'POST', body: payload }),
    invite: (payload) => request('/staff', { method: 'POST', body: payload }),
    update: (id, patch) => request(`/staff/${id}`, { method: 'PATCH', body: patch }),
    updateStatus: (id, status) =>
      request(`/staff/${id}/status`, { method: 'PATCH', body: { status } }),
    resetPassword: (id) => request(`/staff/${id}/reset-password`, { method: 'POST' }),
    activity: (id, params) => request(`/staff/${id}/activity`, { params }),
    workspaceActivity: (params) => request('/staff/activity', { params }),
    remove: (id) => request(`/staff/${id}`, { method: 'DELETE' }),
  },

  data: {
    collections: () => request('/data/collections'),
    importFile: (payload) => request('/data/import', { method: 'POST', body: payload }),
    /** Binary endpoints need their own fetch so the token and filename survive. */
    async download({ collections = [], template } = {}) {
      const token = readToken();
      const url = template
        ? `${BASE_URL}/data/template?collection=${encodeURIComponent(template)}`
        : `${BASE_URL}/data/export?collections=${encodeURIComponent(collections.join(','))}`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.message || 'The export could not be created.', {
          code: payload?.code || 'REQUEST_FAILED',
          status: response.status,
        });
      }
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      return {
        blob: await response.blob(),
        filename: match?.[1] || (template ? `stayora-${template}-template.xlsx` : 'stayora-export.xlsx'),
      };
    },
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
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  },
};

export default http;
