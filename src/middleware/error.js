'use strict';

const mongoose = require('mongoose');
const multer = require('multer');
const config = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { wantsJson } = require('./auth');

function notFound(req, _res, next) {
  next(ApiError.notFound(`We couldn't find ${req.originalUrl}.`));
}

/** Maps any thrown error to an ApiError-like shape. */
function normalise(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([path, e]) => [path, e.message])
    );
    return ApiError.validation(details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}.`, 'INVALID_ID');
  }
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`That ${field} is already in use.`, 'DUPLICATE', {
      [field]: 'Already in use',
    });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Images must be ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB or smaller.`
        : err.message;
    return new ApiError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message, err.code);
  }
  if (err && err.type === 'entity.parse.failed') {
    return ApiError.badRequest('The request body is not valid JSON.', 'INVALID_JSON');
  }
  if (err && err.type === 'entity.too.large') {
    return new ApiError(413, 'The request body is too large.', 'PAYLOAD_TOO_LARGE');
  }

  const status = Number.isInteger(err && err.status) && err.status >= 400 ? err.status : 500;
  const e = new ApiError(
    status,
    status < 500 && err && err.message ? err.message : 'Something went wrong on our side.',
    status < 500 ? 'ERROR' : 'INTERNAL_ERROR'
  );
  e.original = err;
  return e;
}

function errorHandler(err, req, res, _next) {
  const error = normalise(err);

  if (error.status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} →`, error.original || err);
  }

  if (res.headersSent) return undefined;

  if (wantsJson(req)) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  // Friendly handling for expired forms: go back with a message.
  if (error.code === 'CSRF_INVALID' && req.method !== 'GET' && req.flash) {
    req.flash('error', error.message);
    return res.redirect(303, req.get('referer') || '/');
  }
  if (error.code === 'READ_ONLY_ADMIN' && req.flash) {
    req.flash('warning', error.message);
    return res.redirect(303, req.get('referer') || '/admin');
  }

  res.status(error.status);
  return res.render('pages/error', {
    layout: 'layouts/main',
    title: error.status === 404 ? 'Page not found' : 'Something went wrong',
    status: error.status,
    message: error.message,
    stack: config.isDevelopment && error.status >= 500 ? (error.original || err).stack : null,
  });
}

module.exports = { notFound, errorHandler };
