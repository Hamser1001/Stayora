const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export const SITE_SLUG = import.meta.env.VITE_SITE_SLUG || 'brothers-surf-camp';
export const SITE_ORIGIN = (
  import.meta.env.VITE_SITE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new ApiError(payload?.message || 'Something went wrong. Please try again.', {
        code: payload?.code || 'REQUEST_FAILED',
        status: response.status,
      });
    }

    return payload?.data ?? payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new ApiError('The request took too long. Please try again.', { code: 'TIMEOUT' });
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'We could not reach the booking service. Check your connection and try again.',
      { code: 'NETWORK' },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Real room-level availability for the property. */
export function getAvailability({ arrival, departure, guests = 1 }, options = {}) {
  const query = new URLSearchParams({
    arrival,
    departure,
    guests: String(guests),
  });
  return request(`/public/sites/${encodeURIComponent(SITE_SLUG)}/availability?${query}`, options);
}

/**
 * Creates a real reservation (status `pending`, unpaid) in the hostel engine.
 * Payment is arranged by the team after they confirm the booking.
 */
export function createBooking(payload, options = {}) {
  return request(`/public/sites/${encodeURIComponent(SITE_SLUG)}/bookings`, {
    ...options,
    method: 'POST',
    body: payload,
    timeout: 20000,
  });
}
