const TOKEN_KEY = 'dst.token';
const EXP_KEY = 'dst.token.exp';

export function getToken() {
  const t = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  const exp = sessionStorage.getItem(EXP_KEY) || localStorage.getItem(EXP_KEY);
  if (!t) return null;
  if (exp && Date.now() > Number(exp)) {
    clearToken();
    return null;
  }
  return t;
}

export function setToken(token, expiresAt, remember) {
  clearToken();
  const expMs = expiresAt ? new Date(expiresAt).getTime() : (Date.now() + 30 * 24 * 3600 * 1000);
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(EXP_KEY, String(expMs));
}

export function clearToken() {
  for (const s of [sessionStorage, localStorage]) {
    s.removeItem(TOKEN_KEY);
    s.removeItem(EXP_KEY);
  }
}

export function authHeader() {
  const t = getToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}