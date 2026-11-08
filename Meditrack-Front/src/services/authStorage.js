// Where the signed-in session ({ token, user }) is kept.
// "Remember me" checked   -> localStorage (survives closing the browser).
// "Remember me" unchecked -> sessionStorage (ends when the tab/browser is closed).
const SESSION_KEY = 'meditrack.session';
const LEGACY_KEYS = ['token', 'user', 'rememberMe'];

const storages = () => [localStorage, sessionStorage];

const read = (storage) => {
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY));
    return session?.token && session?.user ? session : null;
  } catch {
    return null;
  }
};

export const loadSession = () => read(localStorage) || read(sessionStorage);

export const clearSession = () => {
  try {
    storages().forEach((storage) => storage.removeItem(SESSION_KEY));
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage is unavailable (e.g. private mode): nothing to clear.
  }
};

// Set when the session was ended by the server (401) rather than by the user, so the login
// page can say why the user is back there. Cleared on the next sign-in or manual sign-out.
const EXPIRED_KEY = 'meditrack.sessionExpired';

const setExpiredFlag = (expired) => {
  try {
    if (expired) sessionStorage.setItem(EXPIRED_KEY, '1'); else sessionStorage.removeItem(EXPIRED_KEY);
  } catch {
    // Storage is unavailable: the login page simply shows no notice.
  }
};

export const markSessionExpired = () => setExpiredFlag(true);
export const clearSessionExpired = () => setExpiredFlag(false);
export const hasSessionExpired = () => {
  try {
    return sessionStorage.getItem(EXPIRED_KEY) === '1';
  } catch {
    return false;
  }
};

export const saveSession = (session, { remember = false } = {}) => {
  clearSession();
  clearSessionExpired();
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage is unavailable: the session lives in memory until the page reloads.
  }
};

// Keeps the stored copy in sync after a profile edit, in whichever storage holds the session.
export const updateStoredUser = (user) => {
  storages().forEach((storage) => {
    const session = read(storage);
    if (session) storage.setItem(SESSION_KEY, JSON.stringify({ ...session, user }));
  });
};

export const getStoredToken = () => loadSession()?.token ?? null;
