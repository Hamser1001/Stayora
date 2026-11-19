import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { isFreshRateCache, readRateCache, writeRateCache } from '@/lib/fx';
import { CURRENCIES } from '@/lib/constants';

const SettingsContext = createContext(null);

const FALLBACK = {
  name: 'Maison Nomade',
  currency: 'EUR',
  baseCurrency: 'EUR',
  timezone: 'Europe/Paris',
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

const EMPTY_FX = {
  base: 'EUR',
  rates: null,
  date: null,
  fetchedAt: null,
  stale: false,
  cached: false,
  loading: false,
  error: '',
};

export function SettingsProvider({ children }) {
  const { isAuthenticated, booting } = useAuth();
  const [settings, setSettings] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  // Whether the saved workspace has actually been read at least once. Editing
  // stays disabled until then, so the fallback values above can never be saved
  // over the real workspace.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fx, setFx] = useState(EMPTY_FX);

  const load = useCallback(async () => {
    try {
      const result = await api.settings.get();
      setSettings((prev) => ({ ...prev, ...result }));
      setLoaded(true);
      setLoadError('');
    } catch (error) {
      // Keep whatever is already known: replacing it with the fallback here
      // would let a later save write those defaults over the saved workspace.
      setLoadError(error?.message || '');
    } finally {
      setLoading(false);
    }
  }, []);

  // Workspace settings are private: load them once a session exists, and reset to
  // safe defaults when signing out. Without this a fresh login kept fallback
  // currency/property values until the page was reloaded.
  useEffect(() => {
    if (booting) return;
    if (!isAuthenticated) {
      setSettings(FALLBACK);
      setLoaded(false);
      setLoadError('');
      setLoading(false);
      return;
    }
    load();
  }, [booting, isAuthenticated, load]);

  const baseCurrency = String(settings?.baseCurrency || 'EUR').toUpperCase();

  /** Rates for the ledger's base currency, with a localStorage fallback. */
  const loadRates = useCallback(
    async (base, { force = false } = {}) => {
      if (!isAuthenticated) return;
      const code = String(base || 'EUR').toUpperCase();
      const cached = readRateCache(code);
      // A snapshot that predates a newly selectable currency must be refreshed,
      // otherwise that currency would silently fall back to the base currency.
      const coversCurrencies =
        cached &&
        CURRENCIES.every(
          (currency) => currency === code || Number(cached.rates?.[currency]) > 0,
        );
      const fresh = coversCurrencies && isFreshRateCache(cached);

      if (cached) {
        setFx((prev) => ({ ...prev, ...cached, base: code, loading: !fresh, stale: !fresh, error: '' }));
      } else {
        setFx((prev) => ({ ...prev, base: code, loading: true, error: '' }));
      }
      if (fresh && !force) return;

      try {
        const data = await api.currency.rates({ base: code });
        if (!data?.rates) throw new Error('No exchange rates were returned.');
        const next = {
          base: String(data.base || code).toUpperCase(),
          rates: data.rates,
          date: data.date || null,
          fetchedAt: data.fetchedAt || new Date().toISOString(),
          stale: Boolean(data.stale),
          cached: Boolean(data.cached),
          loading: false,
          error: '',
        };
        writeRateCache(code, next);
        setFx(next);
      } catch (error) {
        setFx((prev) => ({
          ...prev,
          base: code,
          loading: false,
          stale: Boolean(prev.rates),
          error: error?.message || 'Exchange rates are unavailable.',
        }));
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    if (booting) return;
    if (!isAuthenticated) {
      setFx(EMPTY_FX);
      return;
    }
    loadRates(baseCurrency);
  }, [booting, isAuthenticated, baseCurrency, loadRates]);

  const refreshRates = useCallback(
    () => loadRates(baseCurrency, { force: true }),
    [loadRates, baseCurrency],
  );

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
    () => ({
      settings,
      setSettings,
      loading,
      loaded,
      loadError,
      reload: load,
      updateSettings,
      resetSettings,
      fx,
      baseCurrency,
      refreshRates,
    }),
    [
      settings,
      loading,
      loaded,
      loadError,
      load,
      updateSettings,
      resetSettings,
      fx,
      baseCurrency,
      refreshRates,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
