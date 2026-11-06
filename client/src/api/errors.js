export class ApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 400, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error) {
  return error instanceof ApiError;
}
