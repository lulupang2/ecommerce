export const SESSION_KEY = 'techzone-session';
export const GUEST_KEY = 'techzone-guest-id';

export function readSession() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

export function saveSession(session) {
  const mobile = process.env.NEXT_PUBLIC_RUNTIME === 'capacitor';
  const { refreshToken, ...withoutRefresh } = session;
  const persisted = mobile ? withoutRefresh : { user: session.user, csrfToken: session.csrfToken };
  localStorage.setItem(SESSION_KEY, JSON.stringify(persisted));
  if (mobile && refreshToken) import('@aparajita/capacitor-secure-storage').then(({ SecureStorage }) => SecureStorage.set('techzone_refresh_token', refreshToken)).catch(() => {});
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  if (process.env.NEXT_PUBLIC_RUNTIME === 'capacitor') import('@aparajita/capacitor-secure-storage').then(({ SecureStorage }) => SecureStorage.remove('techzone_refresh_token')).catch(() => {});
}

export async function readSecureRefreshToken() {
  if (process.env.NEXT_PUBLIC_RUNTIME !== 'capacitor') return null;
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    return await SecureStorage.get('techzone_refresh_token');
  } catch { return null; }
}

export async function refreshSession(apiBase) {
  const mobile = process.env.NEXT_PUBLIC_RUNTIME === 'capacitor';
  const refreshToken = mobile ? await readSecureRefreshToken() : undefined;
  const current = readSession();
  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-client-platform': mobile ? 'capacitor' : 'web', ...(current?.csrfToken ? { 'x-csrf-token': current.csrfToken } : {}) },
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
  if (!response.ok) { clearSession(); return null; }
  const session = await response.json();
  saveSession(session);
  return session;
}

export function authHeaders({ mutation = false } = {}) {
  const session = readSession();
  return {
    ...(session?.accessToken || session?.token ? { authorization: `Bearer ${session.accessToken || session.token}` } : {}),
    ...(mutation && session?.csrfToken ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

export function getGuestId() {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(GUEST_KEY, id); }
  return id;
}

export function getCurrentUserId() {
  return readSession()?.user?.id || getGuestId();
}
