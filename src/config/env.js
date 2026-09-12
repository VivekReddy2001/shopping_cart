'use strict';

/**
 * Centralised, validated configuration.
 * Every setting is read from environment variables (see .env.example)
 * so the same build runs locally, in tests and in production.
 */
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function toNumber(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const port = toNumber(process.env.PORT, 3000);

const config = {
  env: NODE_ENV,
  isProduction,
  isTest,
  isDevelopment: !isProduction && !isTest,

  port,
  appName: process.env.APP_NAME || 'Kartly',
  appUrl: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  trustProxy: toNumber(process.env.TRUST_PROXY, isProduction ? 1 : 0),
  // HTTPS-only cookies + upgrade-insecure-requests. Defaults to on in production;
  // set COOKIE_SECURE=false when running production mode over plain http (e.g. Docker locally).
  secureCookies: toBool(process.env.COOKIE_SECURE, isProduction),
  logLevel: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),

  mongoUri: process.env.MONGODB_URI || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionMaxAgeDays: toNumber(process.env.SESSION_MAX_AGE_DAYS, 7),
  bcryptRounds: toNumber(process.env.BCRYPT_ROUNDS, isTest ? 4 : 12),

  seed: {
    auto: toBool(process.env.AUTO_SEED, true),
    demoOrders: toBool(process.env.SEED_DEMO_ORDERS, true),
    demoAccounts: toBool(process.env.DEMO_ACCOUNTS, true),
  },

  admin: {
    name: process.env.ADMIN_NAME || 'Store Admin',
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
    // In development a default password is used so the project runs with zero setup.
    password: process.env.ADMIN_PASSWORD || (isProduction ? '' : 'Admin@12345'),
  },

  store: {
    currency: process.env.CURRENCY || 'INR',
    locale: process.env.LOCALE || 'en-IN',
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
    taxRate: toNumber(process.env.TAX_RATE, 0.18), // GST — catalogue prices are tax-inclusive
    shippingFee: toNumber(process.env.SHIPPING_FEE, 49),
    freeShippingThreshold: toNumber(process.env.FREE_SHIPPING_THRESHOLD, 999),
    maxQuantityPerItem: toNumber(process.env.MAX_QTY_PER_ITEM, 10),
    lowStockThreshold: toNumber(process.env.LOW_STOCK_THRESHOLD, 5),
    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: toNumber(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Kartly <no-reply@example.com>',
  },

  uploads: {
    maxBytes: toNumber(process.env.UPLOAD_MAX_MB, 2) * 1024 * 1024,
  },
};

if (isProduction) {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (config.sessionSecret.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

if (!config.sessionSecret) {
  config.sessionSecret = 'development-only-session-secret-do-not-use-in-production';
}

/**
 * Frozen so configuration can only ever change through the environment.
 * A stray `config.store.taxRate = 0` anywhere in the codebase now throws in
 * strict mode instead of silently altering every calculation that follows.
 */
function deepFreeze(value) {
  for (const key of Object.getOwnPropertyNames(value)) {
    const child = value[key];
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

module.exports = deepFreeze(config);
