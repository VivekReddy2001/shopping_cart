'use strict';

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Removes MongoDB operator keys (`$gt`, `$where`, …), dotted paths and
 * prototype-pollution keys from request bodies, preventing NoSQL injection
 * such as `{ "email": { "$ne": null } }`.
 */
function clean(value, depth = 0) {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.') || BLOCKED_KEYS.has(key)) {
        delete value[key];
      } else {
        value[key] = clean(value[key], depth + 1);
      }
    }
  }
  return value;
}

function sanitizeInput(req, _res, next) {
  if (req.body === undefined) req.body = {};
  if (req.body && typeof req.body === 'object') clean(req.body);
  next();
}

module.exports = { sanitizeInput, clean };
