import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeRole } from '../constants/users';
import { setUnauthorizedHandler } from '../services/apiAxios';
import { getCurrentUserApi, logoutApi } from '../services/authApi';
import { clearSession, clearSessionExpired, getStoredToken, loadSession, markSessionExpired, saveSession, updateStoredUser } from '../services/authStorage';

const AuthContext = createContext(null);

// A stored session with a role this app does not know is discarded instead of trusted.
const readStoredUser = () => {
  const session = loadSession();
  if (!session) return null;
  const role = normalizeRole(session.user.role);
  if (!role) {
    clearSession();
    return null;
  }
  return { ...session.user, role };
};

// `user` and `role` only decide what the UI shows. They are not authorization: every request
// is checked by the server against the token, whatever this context says.
export const AuthProvider = ({ children }) => {
  // user: { id, name, email, role } - never contains a password.
  const [user, setUser] = useState(readStoredUser);

  // session: { token, user } as returned by loginApi.
  const login = useCallback((session, { remember = false } = {}) => {
    saveSession(session, { remember });
    setUser(session.user);
  }, []);

  // The user chose to sign out. The UI signs out at once; the server is told so it can revoke
  // the token, and a failure there does not keep the user signed in.
  const logout = useCallback(() => {
    const token = getStoredToken();
    clearSession();
    clearSessionExpired();
    setUser(null);
    if (token) logoutApi(token).catch(() => {});
  }, []);

  // The server ended the session (401): sign out and let the login page explain why.
  const endSession = useCallback(() => {
    clearSession();
    markSessionExpired();
    setUser(null);
  }, []);

  // Keeps the signed-in user in sync after they edit their own profile.
  const updateUser = useCallback((changes) => {
    if (!user) return;
    const next = { ...user, name: changes.name ?? user.name, email: changes.email ?? user.email };
    updateStoredUser(next);
    setUser(next);
  }, [user]);

  // Any 401 from the service layer ends the session; ProtectedRoute then redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(endSession);
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  // A session restored from storage is checked with the server once: the stored name and role
  // are replaced by the server's, and an invalid session ends through the 401 handler above.
  // If the server cannot be reached the stored session is kept, and the next request decides.
  useEffect(() => {
    if (!loadSession()) return undefined;
    let active = true;
    getCurrentUserApi()
      .then((current) => {
        if (!active) return;
        if (!current.role) {
          endSession();
          return;
        }
        updateStoredUser(current);
        setUser(current);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [endSession]);

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, isAuthenticated: Boolean(user), login, logout, updateUser }),
    [user, login, logout, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
