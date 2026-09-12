'use strict';

const crypto = require('node:crypto');

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Escapes user input before it is used inside a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Crockford-style alphabet: no 0/O or 1/I/L confusion in printed order numbers.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** e.g. KRT-260911-7Q4ZK — readable, sortable by date and hard to guess. */
function generateOrderNumber(date = new Date()) {
  const y = String(date.getUTCFullYear()).slice(2);
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `KRT-${y}${m}${d}-${randomCode(5)}`;
}

function generateTransactionId() {
  return `TXN${Date.now().toString(36).toUpperCase()}${randomCode(6)}`;
}

/** Only allow same-site relative redirects (prevents open-redirect attacks). */
function safeRedirectPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

function initials(name = '') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

module.exports = {
  slugify,
  escapeRegex,
  randomCode,
  generateOrderNumber,
  generateTransactionId,
  safeRedirectPath,
  initials,
};
