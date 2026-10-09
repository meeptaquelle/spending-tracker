const PORT = location.port;
const HOST = location.hostname;

const API_BASE =
  (HOST === 'localhost' || HOST === '127.0.0.1')
    ? 'http://localhost:8080/api'
    : 'https://your-backend-host/api';

async function request(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
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
  health: () => request('/health'),
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