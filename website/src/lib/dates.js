export function isoDate(value = new Date()) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nightsBetween(arrival, departure) {
  if (!arrival || !departure) return 0;
  const start = new Date(`${arrival}T12:00:00Z`).getTime();
  const end = new Date(`${departure}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

const LONG = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export function formatDate(iso) {
  if (!iso) return '—';
  return LONG.format(new Date(`${iso}T12:00:00Z`));
}

export function formatShort(iso) {
  if (!iso) return '—';
  return SHORT.format(new Date(`${iso}T12:00:00Z`));
}

export function formatRange(arrival, departure) {
  if (!arrival || !departure) return 'Choose your dates';
  const sameYear =
    new Date(`${arrival}T12:00:00Z`).getUTCFullYear() ===
    new Date(`${departure}T12:00:00Z`).getUTCFullYear();
  if (!sameYear) return `${formatDate(arrival)} → ${formatDate(departure)}`;
  return `${formatShort(arrival)} → ${formatDate(departure)}`;
}

export function money(value, currency = 'EUR') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const amount = Number(value);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Default search window shown before the guest picks dates: two weeks out. */
export function defaultStay() {
  const arrival = addDaysISO(isoDate(), 14);
  return { arrival, departure: addDaysISO(arrival, 3), guests: 1 };
}
