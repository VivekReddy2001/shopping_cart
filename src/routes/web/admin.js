'use strict';

const express = require('express');
const { requireAdmin } = require('../../middleware/auth');
const { upload } = require('../../middleware/upload');
const admin = require('../../controllers/admin/adminController');

const router = express.Router();

router.use(requireAdmin);

router.get('/', admin.dashboard);

router.get('/products', admin.products);
router.get('/products/new', admin.newProduct);
router.post('/products', upload.single('image'), admin.createProduct);
router.get('/products/:id/edit', admin.editProduct);
router.post('/products/:id', upload.single('image'), admin.updateProduct);
router.post('/products/:id/archive', admin.toggleArchive);

router.get('/orders', admin.orders);
router.get('/orders/:orderNumber', admin.orderDetail);
router.post('/orders/:orderNumber/status', admin.updateOrderStatus);

router.get('/customers', admin.customers);

router.get('/catalog', admin.catalog);
router.post('/categories', admin.createCategory);
router.post('/brands', admin.createBrand);

module.exports = router;
