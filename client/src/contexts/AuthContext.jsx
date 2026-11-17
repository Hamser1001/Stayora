import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/api';
import { isEphemeralSession, readSession, writeSession } from '@/data/store';
import { permissionsOf } from '@/lib/constants';
import { changeLanguage } from '@/i18n';

const SUPPORTED = ['en', 'fr'];

/** The account's saved language follows the user across devices. */
function applyUserLanguage(user) {
  if (user?.language && SUPPORTED.includes(user.language)) {
    changeLanguage(user.language);
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readSession();
      if (!stored) {
        if (!cancelled) setBooting(false);
        return;
      }
      applyUserLanguage(stored?.user);
      try {
        const current = await api.auth.me();
        if (!cancelled) {
          applyUserLanguage(current?.user);
          setSession(current || stored);
        }
      } catch (err) {
        // Only an explicit 401 means the stored session is gone. A network blip or
        // server error keeps the cached session so pages can render (and retry).
        if (!cancelled && err?.status === 401) setSession(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const next = await api.auth.login(credentials);
    applyUserLanguage(next?.user);
    writeSession(next, credentials.remember !== false);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    writeSession(null);
    setSession(null);
  }, []);

  /** Refreshes the profile (permissions, forced password change) from the API. */
  const refresh = useCallback(async () => {
    try {
      const current = await api.auth.me();
      if (!current?.user) return null;
      const next = { ...(readSession() || {}), ...current };
      writeSession(next, !isEphemeralSession());
      setSession(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const setUser = useCallback((user) => {
    const next = { ...(readSession() || {}), user };
    writeSession(next, !isEphemeralSession());
    setSession(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      isAuthenticated: Boolean(session),
      booting,
      login,
      logout,
      refresh,
      setUser,
      mustChangePassword: Boolean(session?.user?.mustChangePassword),
      can: (module) => permissionsOf(session?.user).includes(module),
    }),
    [session, booting, login, logout, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
