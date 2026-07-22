export const SESSION_KEY = 'techzone-session';
export const GUEST_KEY = 'techzone-guest-id';

export function readSession() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getGuestId() {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(GUEST_KEY, id); }
  return id;
}

export function getCurrentUserId() {
  return readSession()?.user?.id || getGuestId();
}
