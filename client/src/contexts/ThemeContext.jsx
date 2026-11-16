import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'stayora.theme';
const MODES = ['light', 'dark', 'system'];

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStoredMode = () => {
  if (typeof localStorage === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  return MODES.includes(stored) ? stored : 'light';
};

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }, [resolved]);

  const update = useCallback((next) => {
    const value = MODES.includes(next) ? next : 'light';
    setMode(value);
    localStorage.setItem(STORAGE_KEY, value);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      resolved,
      setMode: update,
      toggle: () => update(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [mode, resolved, update],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
