import { useSettings } from '@/contexts/SettingsContext';
import { useFormat } from '@/lib/format';

/** Locale- and currency-aware formatters for the active workspace. */
export function useMoney() {
  const { settings } = useSettings();
  return useFormat(settings?.currency || 'EUR');
}
