import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/api';
import { readSession, writeSession } from '@/data/store';

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
      try {
        const current = await api.auth.me();
        if (!cancelled) setSession(current || stored);
      } catch {
        if (!cancelled) setSession(null);
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
    writeSession(next);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user || null, isAuthenticated: Boolean(session), booting, login, logout }),
    [session, booting, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
