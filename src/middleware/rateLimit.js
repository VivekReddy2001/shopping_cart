'use strict';

const { rateLimit } = require('express-rate-limit');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

function limiter({ windowMinutes, limit, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, _res, next) => next(new ApiError(429, message, 'RATE_LIMITED')),
  });
}

/** Brute-force protection for sign-in and registration. */
const authLimiter = limiter({
  windowMinutes: 15,
  limit: 20,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

/** General API throttle. */
const apiLimiter = limiter({
  windowMinutes: 15,
  limit: 900,
  message: 'Too many requests. Please slow down and try again shortly.',
});

module.exports = { authLimiter, apiLimiter };
