import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrency, useFormat } from '@/lib/format';
import { convertAmount, rateFor } from '@/lib/fx';

/**
 * Locale-, currency-, timezone- and exchange-rate-aware money formatting.
 *
 * Ledger values are always in `baseCurrency`. `currency(value)` converts them
 * into the currency chosen in settings. If no rate exists for that pair the
 * value is formatted in the currency it was recorded in rather than mislabelled.
 */
export function useMoney() {
  const { settings, fx } = useSettings();
  const base = String(settings?.baseCurrency || 'EUR').toUpperCase();
  const requested = String(settings?.currency || base).toUpperCase();
  const rate = requested === base ? 1 : rateFor(base, requested, fx);
  const canConvert = requested === base || rate !== null;
  const display = canConvert ? requested : base;
  const format = useFormat(display, settings?.timezone || undefined);

  const convert = (value, from = base, to = display) => {
    const converted = convertAmount(value, from, to, fx);
    const amount = converted === null ? Number(value) || 0 : converted;
    return Math.round(amount * 100) / 100;
  };

  return {
    ...format,
    currencyCode: display,
    requestedCurrency: requested,
    baseCurrency: base,
    rate: display === base ? 1 : rate,
    ratesUnavailable: !canConvert,
    ratesError: fx?.error || '',
    loadingRates: Boolean(fx?.loading),
    rateDate: fx?.date || null,
    rateStale: Boolean(fx?.stale),

    currency: (value, opts = {}) => {
      const { from = base, ...rest } = opts;
      const fromCode = String(from || base).toUpperCase();
      const converted = convertAmount(value, fromCode, display, fx);
      if (converted === null) {
        return formatCurrency(value, { lang: format.lang, currency: fromCode, ...rest });
      }
      return formatCurrency(converted, { lang: format.lang, currency: display, ...rest });
    },

    /** Convert a base-currency ledger value into the display currency. */
    toDisplay: (value, from = base) => convert(value, from, display),
    /** Convert an amount entered in the display currency back into the ledger. */
    toBase: (value, from = display) => convert(value, from, base),
    /** Format a value in the currency it was originally recorded in. */
    original: (value, from = base, opts = {}) =>
      formatCurrency(value, {
        lang: format.lang,
        currency: String(from || base).toUpperCase(),
        ...opts,
      }),
  };
}
