import { useTranslation } from 'react-i18next';

export const LOCALES = { en: 'en-GB', fr: 'fr-FR' };

export function localeFor(lang) {
  return LOCALES[lang] || LOCALES.en;
}

export function formatCurrency(value, { lang = 'en', currency = 'EUR', maximumFractionDigits = 0 } = {}) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'currency',
    currency,
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format(amount);
}

export function formatNumber(value, { lang = 'en', maximumFractionDigits = 0 } = {}) {
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits }).format(
    Number(value) || 0,
  );
}

export function formatPercent(value, { lang = 'en', maximumFractionDigits = 0 } = {}) {
  return `${new Intl.NumberFormat(localeFor(lang), {
    maximumFractionDigits,
  }).format(Number(value) || 0)}%`;
}

export function formatDate(value, { lang = 'en', style = 'medium' } = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  const options =
    style === 'short'
      ? { day: '2-digit', month: 'short' }
      : style === 'long'
        ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(localeFor(lang), options).format(date);
}

export function formatDateTime(value, { lang = 'en', timeZone } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatMonth(date, { lang = 'en' } = {}) {
  return new Intl.DateTimeFormat(localeFor(lang), { month: 'long', year: 'numeric' }).format(date);
}

export function formatWeekday(date, { lang = 'en' } = {}) {
  return new Intl.DateTimeFormat(localeFor(lang), { weekday: 'narrow' }).format(date);
}

export function formatTime(value, { lang = 'en' } = {}) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return value || '—';
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(localeFor(lang), { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Locale-aware formatters bound to the active language and workspace currency. */
export function useFormat(currency = 'EUR', timeZone) {
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  return {
    lang,
    currency: (value, opts = {}) => formatCurrency(value, { lang, currency, ...opts }),
    number: (value, opts = {}) => formatNumber(value, { lang, ...opts }),
    percent: (value, opts = {}) => formatPercent(value, { lang, ...opts }),
    date: (value, opts = {}) => formatDate(value, { lang, ...opts }),
    dateTime: (value, opts = {}) => formatDateTime(value, { lang, timeZone, ...opts }),
    month: (value, opts = {}) => formatMonth(value, { lang, ...opts }),
    weekday: (value, opts = {}) => formatWeekday(value, { lang, ...opts }),
    time: (value, opts = {}) => formatTime(value, { lang, ...opts }),
  };
}
