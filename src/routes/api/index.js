'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { apiLimiter, authLimiter } = require('../../middleware/rateLimit');
const { upload } = require('../../middleware/upload');
const ApiError = require('../../utils/ApiError');
const auth = require('../../controllers/api/authApi');
const catalog = require('../../controllers/api/catalogApi');
const cart = require('../../controllers/api/cartApi');
const orders = require('../../controllers/api/orderApi');

/**
 * REST API v1 — JSON over HTTP, session-cookie authentication.
 * State-changing requests must send the `X-CSRF-Token` header
 * (GET /api/v1/auth/csrf-token returns one).
 */
const router = express.Router();

router.use(apiLimiter);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Auth
router.get('/auth/csrf-token', auth.csrfToken);
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);

// Catalogue
router.get('/categories', catalog.listCategories);
router.get('/brands', catalog.listBrands);
router.get('/products', catalog.listProducts);
router.get('/products/:idOrSlug', catalog.getProduct);
router.post('/products', requireAdmin, upload.single('image'), catalog.createProduct);
router.patch('/products/:id', requireAdmin, upload.single('image'), catalog.updateProduct);
router.delete('/products/:id', requireAdmin, catalog.archiveProduct);

// Reviews
router.get('/products/:idOrSlug/reviews', catalog.listReviews);
router.post('/products/:idOrSlug/reviews', requireAuth, catalog.upsertReview);

// Cart (works for guests and signed-in users)
router.get('/cart', cart.getCart);
router.post('/cart/items', cart.addItem);
router.patch('/cart/items/:productId', cart.updateItem);
router.delete('/cart/items/:productId', cart.removeItem);
router.delete('/cart', cart.clearCart);

// Orders
router.get('/orders', requireAuth, orders.listMine);
router.post('/orders', requireAuth, orders.create);
router.get('/orders/:orderNumber', requireAuth, orders.getMine);
router.post('/orders/:orderNumber/cancel', requireAuth, orders.cancelMine);

// Admin
router.get('/admin/stats', requireAdmin, orders.adminStats);
router.get('/admin/orders', requireAdmin, orders.adminList);
router.patch('/admin/orders/:orderNumber/status', requireAdmin, orders.adminUpdateStatus);

router.use((req, _res, next) =>
  next(ApiError.notFound(`No API endpoint for ${req.method} ${req.originalUrl}`))
);

module.exports = router;
