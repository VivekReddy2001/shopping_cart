'use strict';

const { User } = require('../../models');
const cartService = require('../../services/cartService');
const orderService = require('../../services/orderService');
const { checkoutSchema } = require('../../validators');
const { fieldErrors } = require('../../utils/validation');

const ADDRESS_FIELDS = [
  'fullName',
  'phone',
  'line1',
  'line2',
  'city',
  'state',
  'postalCode',
  'country',
];

async function renderCheckout(req, res, { values, errors = {}, status = 200 }) {
  const cart = await cartService.getView({ userId: req.user._id });
  if (!cart.lines.length) {
    req.flash('info', 'Your cart is empty — add something first.');
    return res.redirect('/cart');
  }
  return res.status(status).render('pages/checkout', { title: 'Checkout', cart, values, errors });
}

async function show(req, res) {
  const user = await User.findById(req.user._id).lean();
  const address = user.address || {};
  const values = {
    fullName: address.fullName || user.name,
    phone: address.phone || user.phone || '',
    line1: address.line1 || '',
    line2: address.line2 || '',
    city: address.city || '',
    state: address.state || '',
    postalCode: address.postalCode || '',
    country: address.country || 'India',
    paymentMethod: 'COD',
  };
  return renderCheckout(req, res, { values });
}

async function place(req, res) {
  const body = req.body;
  const values = Object.fromEntries(
    ADDRESS_FIELDS.map((f) => [f, typeof body[f] === 'string' ? body[f] : ''])
  );
  values.paymentMethod = body.paymentMethod;

  const parsed = checkoutSchema.safeParse({
    shippingAddress: Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, values[f]])),
    paymentMethod: body.paymentMethod,
  });
  if (!parsed.success) {
    const errors = {};
    for (const [key, message] of Object.entries(fieldErrors(parsed.error))) {
      errors[key.replace(/^shippingAddress\./, '')] = message;
    }
    return renderCheckout(req, res, { values, errors, status: 422 });
  }

  try {
    const order = await orderService.placeOrder(req.user, parsed.data);
    return res.redirect(303, `/orders/${order.orderNumber}?placed=1`);
  } catch (err) {
    if (err.status === 409 || err.status === 400) {
      req.flash('error', err.message);
      return res.redirect(303, '/cart');
    }
    throw err;
  }
}

module.exports = { show, place };
