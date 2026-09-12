'use strict';

const { z } = require('zod');
const mongoose = require('mongoose');
const { ORDER_STATUSES } = require('../utils/orderStatus');

/* ─────────────── Reusable field schemas ─────────────── */

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);
const trimmed = (min, max, label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const email = z
  .string({ required_error: 'Email is required', invalid_type_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

const password = z
  .string({ required_error: 'Password is required', invalid_type_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/\d/, 'Password must include a number');

const objectId = (label) =>
  z
    .string({ required_error: `Choose a ${label}`, invalid_type_error: `Choose a ${label}` })
    .refine(
      (v) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v),
      `Choose a valid ${label}`
    );

const money = (label) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({
        required_error: `${label} is required`,
        invalid_type_error: `${label} must be a number`,
      })
      .positive(`${label} must be greater than 0`)
      .max(10_000_000, `${label} is too large`)
      .transform((v) => Math.round(v * 100) / 100)
  );

const checkbox = z.preprocess(
  (v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1,
  z.boolean()
);

/* ─────────────── Auth & account ─────────────── */

const registerSchema = z
  .object({
    name: trimmed(2, 60, 'Name'),
    email,
    password,
    confirmPassword: z.string().optional(),
  })
  .refine((d) => d.confirmPassword === undefined || d.confirmPassword === d.password, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email,
  password: z
    .string({ required_error: 'Enter your password' })
    .min(1, 'Enter your password')
    .max(200),
});

const profileSchema = z.object({
  name: trimmed(2, 60, 'Name'),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^$|^[+]?[0-9\s-]{7,15}$/, 'Enter a valid phone number')
    .optional()
    .default(''),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/* ─────────────── Checkout ─────────────── */

const addressSchema = z.object({
  fullName: trimmed(2, 80, 'Full name'),
  phone: z
    .string({ required_error: 'Phone number is required' })
    .trim()
    .regex(/^[+]?[0-9\s-]{7,15}$/, 'Enter a valid phone number'),
  line1: trimmed(3, 120, 'Address'),
  line2: z.string().trim().max(120).optional().default(''),
  city: trimmed(2, 60, 'City'),
  state: trimmed(2, 60, 'State'),
  postalCode: z
    .string({ required_error: 'PIN code is required' })
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, 'Enter a valid PIN / postal code'),
  country: z.string().trim().min(2).max(60).optional().default('India'),
});

const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  paymentMethod: z.enum(['COD', 'ONLINE'], {
    errorMap: () => ({ message: 'Choose a payment method' }),
  }),
});

/* ─────────────── Cart ─────────────── */

const quantity = z.coerce
  .number({ invalid_type_error: 'Quantity must be a number' })
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(99, 'Quantity is too large');

const addToCartSchema = z.object({
  productId: objectId('product'),
  quantity: quantity.optional().default(1),
});

const updateCartItemSchema = z.object({ quantity });

/**
 * The cart page without JavaScript: the quantity input posts `quantity`, and the
 * − / + buttons post `delta` alongside it, so one form handles both.
 */
const cartLineFormSchema = z.object({
  quantity,
  delta: z.coerce.number().int().min(-1).max(1).optional().catch(undefined),
});

/* ─────────────── Catalogue ─────────────── */

const optionalNumber = z
  .preprocess(emptyToUndefined, z.coerce.number().min(0).max(10_000_000).optional())
  .catch(undefined);

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().toLowerCase().max(80).optional().catch(undefined),
  brand: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      (Array.isArray(v) ? v : v ? v.split(',') : [])
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    )
    .catch([]),
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  inStock: z.preprocess((v) => v === '1' || v === 'true' || v === 'on', z.boolean()).catch(false),
  sort: z
    .enum(['relevance', 'price_asc', 'price_desc', 'newest', 'rating', 'discount'])
    .catch('relevance'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  limit: z.coerce.number().int().min(1).max(48).catch(12),
});

const highlights = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((s) => s.trim()).filter(Boolean)
  )
  .pipe(
    z
      .array(z.string().max(160, 'Each highlight must be at most 160 characters'))
      .max(8, 'Add at most 8 highlights')
  );

const productBase = {
  name: trimmed(3, 140, 'Product name'),
  description: trimmed(10, 4000, 'Description'),
  highlights,
  category: objectId('category'),
  brand: objectId('brand'),
  price: money('Price'),
  mrp: z.preprocess(emptyToUndefined, money('MRP').optional()),
  stock: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ required_error: 'Stock is required', invalid_type_error: 'Stock must be a number' })
      .int('Stock must be a whole number')
      .min(0, 'Stock cannot be negative')
      .max(100_000, 'Stock is too large')
  ),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      (Array.isArray(v) ? v : String(v || '').split(','))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    ),
  featured: checkbox.optional(),
  isActive: checkbox.optional(),
};

const productSchema = z.object(productBase).refine((d) => d.mrp === undefined || d.mrp >= d.price, {
  message: 'MRP must be greater than or equal to the selling price',
  path: ['mrp'],
});

/** For PATCH: every field optional; price/MRP relation checked in the service. */
const productPatchSchema = z.object(productBase).partial();

const categorySchema = z.object({
  name: trimmed(2, 60, 'Category name'),
  description: z.string().trim().max(240).optional().default(''),
});

const brandSchema = z.object({ name: trimmed(2, 60, 'Brand name') });

/* ─────────────── Reviews & orders ─────────────── */

const reviewSchema = z.object({
  rating: z.coerce
    .number({ invalid_type_error: 'Choose a rating' })
    .int()
    .min(1, 'Choose a rating from 1 to 5 stars')
    .max(5, 'Choose a rating from 1 to 5 stars'),
  title: z.string().trim().max(100, 'Title must be at most 100 characters').optional().default(''),
  comment: trimmed(3, 1000, 'Review'),
});

const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, { errorMap: () => ({ message: 'Choose a valid status' }) }),
  note: z.string().trim().max(200).optional().default(''),
});

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
});

module.exports = {
  registerSchema,
  loginSchema,
  profileSchema,
  changePasswordSchema,
  addressSchema,
  checkoutSchema,
  addToCartSchema,
  updateCartItemSchema,
  cartLineFormSchema,
  listQuerySchema,
  productSchema,
  productPatchSchema,
  categorySchema,
  brandSchema,
  reviewSchema,
  orderStatusSchema,
  pageQuerySchema,
};
