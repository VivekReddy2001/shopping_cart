'use strict';

const config = require('../config/env');

/** Rounds to 2 decimal places without floating-point drift (e.g. 1.005 → 1.01). */
function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const makeFormatter = (digits) =>
  new Intl.NumberFormat(config.store.locale, {
    style: 'currency',
    currency: config.store.currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const wholeFormatter = makeFormatter(0);
const decimalFormatter = makeFormatter(2);

/** ₹1,23,456 — decimals only when the amount actually has them. */
function formatPrice(value) {
  const amount = round2(value || 0);
  return Number.isInteger(amount) ? wholeFormatter.format(amount) : decimalFormatter.format(amount);
}

/**
 * Cart/order totals. Catalogue prices are GST-inclusive (as is standard in
 * Indian retail), so tax is reported as the portion already included.
 */
function calculateTotals(lines, store = config.store) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const shipping =
    subtotal === 0 || subtotal >= store.freeShippingThreshold ? 0 : round2(store.shippingFee);
  // GST is already contained in the price; invoices report it in whole rupees.
  const tax = Math.round(subtotal - subtotal / (1 + store.taxRate));
  const total = round2(subtotal + shipping);
  const freeShippingRemaining =
    subtotal > 0 && shipping > 0 ? round2(store.freeShippingThreshold - subtotal) : 0;
  return { subtotal, shipping, tax, total, itemCount, freeShippingRemaining };
}

module.exports = { round2, formatPrice, calculateTotals };
