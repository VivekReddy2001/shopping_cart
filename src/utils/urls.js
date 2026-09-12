'use strict';

const config = require('../config/env');

/**
 * The site's absolute base URL. Behind Render's proxy `req.protocol` reflects
 * X-Forwarded-Proto (trust proxy is enabled), so this works in every
 * environment without hard-coding a host; APP_URL is the fallback.
 */
function baseUrl(req) {
  const host = req && req.get && req.get('host');
  if (!host) return config.appUrl;
  return `${req.protocol}://${host}`;
}

/** Absolute URL for a same-site path. */
function absoluteUrl(req, path = '/') {
  return `${baseUrl(req)}${path.startsWith('/') ? path : `/${path}`}`;
}

module.exports = { baseUrl, absoluteUrl };
