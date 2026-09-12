'use strict';

/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Thrown from services/controllers and translated by the error middleware
 * into JSON (API) or an error page (website).
 */
class ApiError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details) {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Please sign in to continue.', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'You do not have permission to do that.', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new ApiError(409, message, code, details);
  }

  static validation(details, message = 'Please correct the highlighted fields.') {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }
}

module.exports = ApiError;
