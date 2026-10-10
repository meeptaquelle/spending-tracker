import { authHeader, getToken, clearToken } from './auth.js';

const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8080/api'
    : 'https://your-backend-host/api';

async function request(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeader(),
    ...(opts.headers || {}),
  };

  const res = await fetch(API_BASE + path, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window.onUnauthorized === 'function') window.onUnauthorized();
    throw Object.assign(new Error('Session expired, please log in'), { status: 401 });
  }

  if (res.status === 204) return null;
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const msg = body?.error?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.code = body?.error?.code;
    err.field = body?.error?.field;
    err.status = res.status;
    throw err;
  }
  return body?.data ?? null;
}

export const api = {
  // auth
  login: (password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: {}, // no token yet
  }),
  health: () => request('/health'),

  // rest unchanged
  listTransactions: (month) => request('/transactions' + (month ? `?month=${month}` : '')),
  createTransaction: (t) => request('/transactions', { method: 'POST', body: JSON.stringify(t) }),
  updateTransaction: (id, t) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  completeTransaction: (id, payload) => request(`/transactions/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) }),
  listCategories: (includeArchived = false) => request(`/categories?include_archived=${includeArchived}`),
  createCategory: (c) => request('/categories', { method: 'POST', body: JSON.stringify(c) }),
  updateCategory: (id, c) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  archiveCategory: (id) => request(`/categories/${id}/archive`, { method: 'POST' }),
  getSettings: () => request('/settings'),
  putSettings: (kv) => request('/settings', { method: 'PUT', body: JSON.stringify(kv) }),
};

export { getToken };