'use strict';

const config = require('../config/env');
const { formatPrice } = require('./money');
const { initials } = require('./strings');
const {
  FULFILMENT_STEPS,
  STATUS_META,
  PAYMENT_METHODS,
  PAYMENT_STATUS_META,
  statusLabel,
  statusTone,
} = require('./orderStatus');

const dateFormatter = new Intl.DateTimeFormat(config.store.locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: config.store.timezone,
});

const dateTimeFormatter = new Intl.DateTimeFormat(config.store.locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: config.store.timezone,
});

const numberFormatter = new Intl.NumberFormat(config.store.locale);
const compactFormatter = new Intl.NumberFormat(config.store.locale, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const { version: assetVersion } = require('../../package.json');

const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : '');
const formatDateTime = (value) => (value ? dateTimeFormatter.format(new Date(value)) : '');
const formatNumber = (value) => numberFormatter.format(value || 0);

/** Inline SVG icon from the sprite in /img/icons.svg (safe: names are hard-coded in templates). */
function icon(name, className = '') {
  const cls = ['icon', className].filter(Boolean).join(' ');
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="/img/icons.svg#${name}"></use></svg>`;
}

/** ★★★★☆ markup for a rating (rounded to the nearest whole star). */
function stars(value = 0, label = true) {
  const filled = Math.round(Number(value) || 0);
  let html = `<span class="stars"${label ? ` role="img" aria-label="Rated ${(Number(value) || 0).toFixed(1)} out of 5"` : ' aria-hidden="true"'}>`;
  for (let i = 1; i <= 5; i += 1) html += icon('star', i <= filled ? 'on' : '');
  return `${html}</span>`;
}

/** ₹12.5K style labels for chart axes. */
function formatCompactPrice(value) {
  return `${config.store.currency === 'INR' ? '₹' : ''}${compactFormatter.format(value || 0)}`;
}

const pluralize = (count, singular, plural = `${singular}s`) =>
  `${formatNumber(count)} ${count === 1 ? singular : plural}`;

/** Builds a query string from the current filters, applying overrides (null removes a key). */
function buildQuery(base = {}, overrides = {}) {
  const params = new URLSearchParams();
  const merged = { ...base, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Values available in every template. */
module.exports = {
  appName: config.appName,
  appUrl: config.appUrl,
  store: config.store,
  isProduction: config.isProduction,
  year: new Date().getFullYear(),
  formatPrice,
  formatDate,
  formatDateTime,
  formatNumber,
  formatCompactPrice,
  assetVersion,
  icon,
  stars,
  initials,
  pluralize,
  buildQuery,
  statusLabel,
  statusTone,
  STATUS_META,
  FULFILMENT_STEPS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_META,
  // Per-request defaults (overridden by res.locals in the web router).
  currentUser: null,
  currentPath: '/',
  cartCount: 0,
  navCategories: [],
  flashMessages: [],
  csrfToken: () => '',
  title: '',
  description: '',
  scripts: [],
  bodyClass: '',
  searchQuery: '',
  activeCategory: '',
};
