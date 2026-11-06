import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/api';

const SettingsContext = createContext(null);

const FALLBACK = {
  name: 'Maison Nomade',
  currency: 'EUR',
  city: 'Paris',
  country: 'France',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  taxRate: 10,
  cityTax: 1.5,
  deposit: 30,
  cancellationPolicy: 'free24',
  notifications: {},
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api.settings.get();
      setSettings((prev) => ({ ...prev, ...result }));
    } catch {
      setSettings(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateSettings = useCallback(async (patch) => {
    const next = await api.settings.update(patch);
    setSettings(next);
    return next;
  }, []);

  const resetSettings = useCallback(async () => {
    const next = await api.settings.reset();
    setSettings(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({ settings, setSettings, loading, reload: load, updateSettings, resetSettings }),
    [settings, loading, load, updateSettings, resetSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
