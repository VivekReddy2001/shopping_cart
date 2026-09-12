'use strict';

const { calculateTotals, round2, formatPrice } = require('../src/utils/money');
const { parseSearchIntent, parseAmount } = require('../src/services/catalogService');
const { canTransition, isCancellableByCustomer } = require('../src/utils/orderStatus');
const { slugify, safeRedirectPath, generateOrderNumber } = require('../src/utils/strings');
const { clean } = require('../src/middleware/sanitize');
const { detectImageType } = require('../src/middleware/upload');
const { niceCeil } = require('../src/services/adminService');
const { PNG_BYTES } = require('./helpers');

describe('money', () => {
  test('round2 avoids floating point drift', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  test('charges shipping below the free-delivery threshold', () => {
    const totals = calculateTotals([{ price: 499, quantity: 1 }]);
    expect(totals).toMatchObject({
      subtotal: 499,
      shipping: 49,
      total: 548,
      itemCount: 1,
      freeShippingRemaining: 500,
    });
  });

  test('ships free at or above the threshold and reports included GST', () => {
    const totals = calculateTotals([{ price: 590, quantity: 2 }]);
    expect(totals.subtotal).toBe(1180);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(1180);
    expect(totals.tax).toBe(180); // 1180 includes 18% GST → 180
  });

  test('an empty cart costs nothing', () => {
    expect(calculateTotals([])).toMatchObject({ subtotal: 0, shipping: 0, total: 0, itemCount: 0 });
  });

  test('formats prices in Indian rupees', () => {
    expect(formatPrice(123456)).toBe('₹1,23,456');
  });
});

describe('search intent (text & voice)', () => {
  test('extracts a maximum price and strips filler words', () => {
    const intent = parseSearchIntent('show me Samsung phones under 20k');
    expect(intent.maxPrice).toBe(20000);
    expect(intent.terms).toEqual(['samsung', 'phone']);
  });

  test('understands ranges and minimums', () => {
    expect(parseSearchIntent('laptops between 40000 and 60,000')).toMatchObject({
      minPrice: 40000,
      maxPrice: 60000,
      terms: ['laptop'],
    });
    expect(parseSearchIntent('tv above 30000')).toMatchObject({ minPrice: 30000 });
  });

  test('parses amounts with units', () => {
    expect(parseAmount('1.5 lakh')).toBe(150000);
    expect(parseAmount('₹2,499')).toBe(2499);
    expect(parseAmount('abc')).toBeUndefined();
  });

  test('singularises plurals', () => {
    expect(parseSearchIntent('watches').terms).toEqual(['watch']);
    expect(parseSearchIntent('dress').terms).toEqual(['dress']);
  });
});

describe('order status machine', () => {
  test('allows only forward transitions', () => {
    expect(canTransition('PLACED', 'PROCESSING')).toBe(true);
    expect(canTransition('PLACED', 'SHIPPED')).toBe(false);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransition('DELIVERED', 'PLACED')).toBe(false);
  });

  test('customers can cancel only before shipping', () => {
    expect(isCancellableByCustomer('PLACED')).toBe(true);
    expect(isCancellableByCustomer('PROCESSING')).toBe(true);
    expect(isCancellableByCustomer('SHIPPED')).toBe(false);
  });
});

describe('utilities', () => {
  test('slugify', () => {
    expect(slugify("Men's Fashion & Accessories")).toBe('men-s-fashion-and-accessories');
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });

  test('safeRedirectPath blocks open redirects', () => {
    expect(safeRedirectPath('/checkout')).toBe('/checkout');
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('https://evil.example')).toBe('/');
  });

  test('order numbers are readable and unique', () => {
    const a = generateOrderNumber(new Date('2026-01-02T00:00:00Z'));
    expect(a).toMatch(/^KRT-260102-[2-9A-HJ-NP-Z]{5}$/);
    expect(generateOrderNumber()).not.toBe(generateOrderNumber());
  });

  test('sanitizer strips Mongo operators and prototype keys', () => {
    const body = JSON.parse(
      '{"email":{"$ne":null},"a.b":1,"__proto__":{"x":1},"ok":"yes","nested":[{"$where":"1"}]}'
    );
    clean(body);
    expect(body).toEqual({ email: {}, ok: 'yes', nested: [{}] });
  });

  test('detects real image types by magic bytes', () => {
    expect(detectImageType(PNG_BYTES)).toBe('image/png');
    expect(detectImageType(Buffer.from('<?php echo "hi"; ?>'))).toBeNull();
  });

  test('niceCeil produces clean axis maxima', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(87)).toBe(100);
    expect(niceCeil(1234)).toBe(2000);
    expect(niceCeil(2100)).toBe(2500);
    expect(niceCeil(41000)).toBe(50000);
  });
});
