export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value);
  return new Date(`${value}T12:00:00`);
}

export function addDays(value, amount) {
  const date = parseDate(value) || new Date();
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

export function startOfDay(value = new Date()) {
  return toISODate(value);
}

export function nightsBetween(arrival, departure) {
  if (!arrival || !departure) return 0;
  const start = parseDate(arrival);
  const end = parseDate(departure);
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function isBetween(dateStr, startStr, endStr) {
  return dateStr >= startStr && dateStr < endStr;
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function todayISO() {
  return toISODate(new Date());
}

export function diffDays(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

export function clampRange(start, end) {
  if (!start || !end) return { start, end };
  return start <= end ? { start, end } : { start: end, end: start };
}

export function buildDateRange(preset, custom = {}) {
  const today = new Date();
  if (preset === 'today') {
    return { start: toISODate(today), end: toISODate(today) };
  }
  if (preset === 'week') {
    const start = new Date(today);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    return { start: toISODate(start), end: toISODate(today) };
  }
  if (preset === 'month') {
    return {
      start: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: toISODate(today),
    };
  }
  if (preset === 'quarter') {
    const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
    return {
      start: toISODate(new Date(today.getFullYear(), quarterMonth, 1)),
      end: toISODate(today),
    };
  }
  if (preset === 'year') {
    return {
      start: toISODate(new Date(today.getFullYear(), 0, 1)),
      end: toISODate(today),
    };
  }
  if (preset === 'custom' && custom.start && custom.end) {
    return clampRange(custom.start, custom.end);
  }
  // Default: last 30 days, inclusive of today.
  return { start: addDays(today, -29), end: toISODate(today) };
}

/** Number of days represented by an inclusive range. */
export function rangeLength(start, end) {
  return diffDays(start, end) + 1;
}

/** Every date in an inclusive range, as ISO strings. */
export function eachDay(start, end) {
  const days = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

/** The previous period of equal length, used for trend comparisons. */
export function previousRange(start, end) {
  const length = rangeLength(start, end);
  return { start: addDays(start, -length), end: addDays(start, -1) };
}

/** First day of the month containing an ISO date string. */
export function monthStart(value) {
  const date = parseDate(value) || new Date();
  return toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function monthMatrix(monthDate) {
  const first = startOfMonth(monthDate);
  const last = endOfMonth(monthDate);
  const offset = (first.getDay() + 6) % 7; // Monday-first grid
  const days = [];
  for (let i = 0; i < offset; i += 1) days.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(toISODate(new Date(first.getFullYear(), first.getMonth(), day)));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export function isSameMonth(dateStr, monthDate) {
  const d = parseDate(dateStr);
  return d && d.getMonth() === monthDate.getMonth() && d.getFullYear() === monthDate.getFullYear();
}
