export const SESSION_KEY = 'techzone-session';
export const GUEST_KEY = 'techzone-guest-id';

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  adminRole?: string;
  permissions?: string[];
}

export interface Session {
  user: SessionUser;
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  csrfToken?: string;
}

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as Session : null;
  }
  catch { return null; }
}

export function saveSession(session: Session): void {
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

export async function readSecureRefreshToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_RUNTIME !== 'capacitor') return null;
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const value = await SecureStorage.get('techzone_refresh_token');
    return value == null ? null : String(value);
  } catch { return null; }
}

export async function refreshSession(apiBase: string): Promise<Session | null> {
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
  const session = await response.json() as Session;
  saveSession(session);
  return session;
}

export function authHeaders({ mutation = false }: { mutation?: boolean } = {}): Record<string, string> {
  const session = readSession();
  return {
    ...(session?.accessToken || session?.token ? { authorization: `Bearer ${session.accessToken || session.token}` } : {}),
    ...(mutation && session?.csrfToken ? { 'x-csrf-token': session.csrfToken } : {}),
  };
}

export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(GUEST_KEY, id); }
  return id;
}

export function getCurrentUserId(): string {
  return readSession()?.user?.id || getGuestId();
}
