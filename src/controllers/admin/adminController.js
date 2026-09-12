'use strict';

const adminService = require('../../services/adminService');
const catalogService = require('../../services/catalogService');
const orderService = require('../../services/orderService');
const { Product } = require('../../models');
const {
  productSchema,
  categorySchema,
  brandSchema,
  orderStatusSchema,
  pageQuerySchema,
} = require('../../validators');
const { fieldErrors } = require('../../utils/validation');
const { TRANSITIONS, ORDER_STATUSES } = require('../../utils/orderStatus');

const layout = 'layouts/admin';

/* ─────────────── Dashboard ─────────────── */

async function dashboard(req, res) {
  const dash = await adminService.getDashboard();
  res.render('admin/dashboard', { layout, title: 'Dashboard', dash, scripts: ['/js/admin.js'] });
}

/* ─────────────── Products ─────────────── */

async function products(req, res) {
  const { page, q } = pageQuerySchema.parse(req.query);
  const status = ['active', 'archived', 'low', 'all'].includes(req.query.status)
    ? req.query.status
    : 'active';
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const [result, taxonomy] = await Promise.all([
    catalogService.listAdminProducts({ q, category, status, page }),
    catalogService.getTaxonomy(),
  ]);
  res.render('admin/products', {
    layout,
    title: 'Products',
    result,
    taxonomy,
    filters: { q: q || '', status, category },
    scripts: ['/js/admin.js'],
  });
}

function formValues(product) {
  if (!product) {
    return {
      name: '',
      description: '',
      highlights: '',
      category: '',
      brand: '',
      price: '',
      mrp: '',
      stock: '',
      tags: '',
      featured: false,
      isActive: true,
    };
  }
  return {
    name: product.name,
    description: product.description,
    highlights: (product.highlights || []).join('\n'),
    category: String(product.category),
    brand: String(product.brand),
    price: product.price,
    mrp: product.mrp,
    stock: product.stock,
    tags: (product.tags || []).join(', '),
    featured: product.featured,
    isActive: product.isActive,
  };
}

async function renderForm(req, res, { product = null, values, errors = {}, status = 200 }) {
  const taxonomy = await catalogService.getTaxonomy();
  res.status(status).render('admin/product-form', {
    layout,
    title: product ? `Edit ${product.name}` : 'Add product',
    product,
    values,
    errors,
    taxonomy,
    scripts: ['/js/admin.js'],
  });
}

async function newProduct(req, res) {
  return renderForm(req, res, { values: formValues(null) });
}

async function editProduct(req, res, next) {
  const product = await Product.findById(req.params.id)
    .lean()
    .catch(() => null);
  if (!product) return next();
  return renderForm(req, res, { product, values: formValues(product) });
}

/** HTML checkboxes are absent when unchecked — normalise before validating. */
function normaliseProductBody(body) {
  return { ...body, featured: body.featured === 'on', isActive: body.isActive === 'on' };
}

async function createProduct(req, res) {
  const body = normaliseProductBody(req.body);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return renderForm(req, res, { values: body, errors: fieldErrors(parsed.error), status: 422 });
  }
  try {
    const product = await catalogService.createProduct(parsed.data, req.file);
    req.flash('success', `“${product.name}” was added to the catalogue.`);
    return res.redirect(303, '/admin/products');
  } catch (err) {
    if (err.status === 422)
      return renderForm(req, res, { values: body, errors: err.details, status: 422 });
    throw err;
  }
}

async function updateProduct(req, res, next) {
  const product = await Product.findById(req.params.id)
    .lean()
    .catch(() => null);
  if (!product) return next();
  const body = normaliseProductBody(req.body);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return renderForm(req, res, {
      product,
      values: body,
      errors: fieldErrors(parsed.error),
      status: 422,
    });
  }
  try {
    const updated = await catalogService.updateProduct(product._id, parsed.data, req.file);
    req.flash('success', `“${updated.name}” was updated.`);
    return res.redirect(303, '/admin/products');
  } catch (err) {
    if (err.status === 422)
      return renderForm(req, res, { product, values: body, errors: err.details, status: 422 });
    throw err;
  }
}

async function toggleArchive(req, res) {
  const activate = req.body.action === 'restore';
  const product = await catalogService.setProductActive(req.params.id, activate);
  req.flash(
    'success',
    activate
      ? `“${product.name}” is back in the store.`
      : `“${product.name}” was archived and hidden from the store.`
  );
  res.redirect(303, req.get('referer') || '/admin/products');
}

/* ─────────────── Orders ─────────────── */

async function orders(req, res) {
  const { page, q } = pageQuerySchema.parse(req.query);
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : '';
  const result = await orderService.listAllOrders({ status, q, page });
  res.render('admin/orders', {
    layout,
    title: 'Orders',
    result,
    filters: { status, q: q || '' },
    transitions: TRANSITIONS,
    scripts: ['/js/admin.js'],
  });
}

async function orderDetail(req, res) {
  const order = await orderService.getOrder(req.params.orderNumber);
  res.render('admin/order', {
    layout,
    title: `Order ${order.orderNumber}`,
    order,
    nextStatuses: TRANSITIONS[order.status],
    scripts: ['/js/admin.js'],
  });
}

async function updateOrderStatus(req, res) {
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    req.flash('error', Object.values(fieldErrors(parsed.error))[0]);
  } else {
    try {
      const order = await orderService.changeStatus(req.params.orderNumber, parsed.data.status, {
        actorId: req.user._id,
        note: parsed.data.note,
      });
      req.flash('success', `Order ${order.orderNumber} updated.`);
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      req.flash('error', err.message);
    }
  }
  res.redirect(303, `/admin/orders/${encodeURIComponent(req.params.orderNumber)}`);
}

/* ─────────────── Customers ─────────────── */

async function customers(req, res) {
  const { page, q } = pageQuerySchema.parse(req.query);
  const result = await adminService.listCustomers({ page, q });
  res.render('admin/customers', { layout, title: 'Customers', result, q: q || '' });
}

/* ─────────────── Categories & brands ─────────────── */

async function renderCatalog(req, res, extra = {}, status = 200) {
  const [categories, brands] = await Promise.all([
    catalogService.listCategoriesWithCounts(),
    catalogService.listBrandsWithCounts(),
  ]);
  res.status(status).render('admin/catalog', {
    layout,
    title: 'Categories & brands',
    categories,
    brands,
    categoryErrors: {},
    brandErrors: {},
    values: {},
    ...extra,
  });
}

const catalog = (req, res) => renderCatalog(req, res);

async function createCategory(req, res) {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success)
    return renderCatalog(
      req,
      res,
      { categoryErrors: fieldErrors(parsed.error), values: req.body },
      422
    );
  try {
    const category = await catalogService.createCategory(parsed.data);
    req.flash('success', `Category “${category.name}” created.`);
  } catch (err) {
    if (err.code === 11000)
      return renderCatalog(
        req,
        res,
        { categoryErrors: { name: 'A category with this name already exists' }, values: req.body },
        409
      );
    throw err;
  }
  return res.redirect(303, '/admin/catalog');
}

async function createBrand(req, res) {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success)
    return renderCatalog(
      req,
      res,
      { brandErrors: fieldErrors(parsed.error), values: req.body },
      422
    );
  try {
    const brand = await catalogService.createBrand(parsed.data);
    req.flash('success', `Brand “${brand.name}” created.`);
  } catch (err) {
    if (err.code === 11000)
      return renderCatalog(
        req,
        res,
        { brandErrors: { name: 'A brand with this name already exists' }, values: req.body },
        409
      );
    throw err;
  }
  return res.redirect(303, '/admin/catalog');
}

module.exports = {
  dashboard,
  products,
  newProduct,
  editProduct,
  createProduct,
  updateProduct,
  toggleArchive,
  orders,
  orderDetail,
  updateOrderStatus,
  customers,
  catalog,
  createCategory,
  createBrand,
};
