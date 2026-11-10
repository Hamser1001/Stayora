export class ApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 400, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function fail(message, code, status = 400) {
  throw new ApiError(message, { code, status });
}

export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const status = error instanceof ApiError ? error.status : error.status || 500;
  if (status >= 500) console.error(error);

  const payload = {
    message: status >= 500 ? 'The request could not be completed.' : error.message,
    code: error.code || 'REQUEST_FAILED',
  };
  if (error.details) payload.details = error.details;
  res.status(status).json(payload);
}
