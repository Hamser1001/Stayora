import { useSettings } from '@/contexts/SettingsContext';
import { useFormat } from '@/lib/format';

/** Locale-, currency- and timezone-aware formatters for the active workspace. */
export function useMoney() {
  const { settings } = useSettings();
  return useFormat(settings?.currency || 'EUR', settings?.timezone || undefined);
}
