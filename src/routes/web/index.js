'use strict';

const express = require('express');
const { requireAuth, redirectIfAuthenticated } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimit');
const shop = require('../../controllers/web/shopController');
const auth = require('../../controllers/web/authController');
const cart = require('../../controllers/web/cartController');
const checkout = require('../../controllers/web/checkoutController');
const orders = require('../../controllers/web/orderController');
const account = require('../../controllers/web/accountController');

const router = express.Router();

// Storefront
router.get('/', shop.home);
router.get('/products', shop.products);
router.get('/products/:slug', shop.productDetail);
router.post('/products/:slug/reviews', requireAuth, shop.submitReview);

// Cart & checkout — the POST routes are the no-JavaScript fallback for the
// fetch calls in public/js; both run the same cartService functions.
router.get('/cart', cart.show);
router.post('/cart/items', cart.add);
router.post('/cart/items/:productId', cart.updateLine);
router.post('/cart/clear', cart.clear);
router.get('/checkout', requireAuth, checkout.show);
router.post('/checkout', requireAuth, checkout.place);

// Orders
router.get('/orders', requireAuth, orders.list);
router.get('/orders/:orderNumber', requireAuth, orders.detail);
router.post('/orders/:orderNumber/cancel', requireAuth, orders.cancel);
router.get('/orders/:orderNumber/invoice', requireAuth, orders.invoice);
router.get('/orders/:orderNumber/invoice.pdf', requireAuth, orders.invoicePdf);

// Authentication
router.get('/login', redirectIfAuthenticated, auth.showLogin);
router.post('/login', authLimiter, redirectIfAuthenticated, auth.login);
router.get('/register', redirectIfAuthenticated, auth.showRegister);
router.post('/register', authLimiter, redirectIfAuthenticated, auth.register);
router.post('/logout', auth.logout);

// Account
router.get('/account', requireAuth, account.show);
router.post('/account', requireAuth, account.update);
router.post('/account/password', requireAuth, account.changePassword);

module.exports = router;
