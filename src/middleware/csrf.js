'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getOrCreateToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  return req.session.csrfToken;
}

function tokensMatch(expected, provided) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(provided));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Synchronizer-token CSRF protection (defence in depth on top of SameSite cookies).
 * - HTML forms send the token in a hidden `_csrf` field.
 * - fetch() calls send it in the `X-CSRF-Token` header (read from a <meta> tag).
 * - multipart forms (file uploads) send it in the header or `?_csrf=` query
 *   string, because the body is only parsed later by multer.
 */
function csrfProtection(req, _res, next) {
  req.csrfToken = () => getOrCreateToken(req);
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = req.session && req.session.csrfToken;
  const isMultipart = req.is('multipart/form-data');
  const provided =
    req.get('x-csrf-token') || (isMultipart ? req.query._csrf : req.body && req.body._csrf);

  if (!expected || !provided || !tokensMatch(expected, provided)) {
    return next(
      new ApiError(
        403,
        'Your session has expired. Please refresh the page and try again.',
        'CSRF_INVALID'
      )
    );
  }
  return next();
}

module.exports = { csrfProtection };
