import mockAdapter from './adapter.mock';
import httpAdapter from './adapter.http';

/**
 * The UI talks only to this contract. Set VITE_API_MODE=http (and VITE_API_URL)
 * to swap the seeded demo adapter for the Express/MongoDB API — no page changes.
 */
const mode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';

export const api = mode === 'http' ? httpAdapter : mockAdapter;
export const apiMode = mode;
export { ApiError, isApiError } from './errors';
