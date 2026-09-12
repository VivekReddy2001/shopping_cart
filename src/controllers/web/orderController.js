'use strict';

const orderService = require('../../services/orderService');
const { renderInvoicePdf } = require('../../services/invoiceService');
const { isCancellableByCustomer, FULFILMENT_STEPS } = require('../../utils/orderStatus');
const { pageQuerySchema } = require('../../validators');

async function list(req, res) {
  const { page } = pageQuerySchema.parse(req.query);
  const orders = await orderService.listOrdersForUser(req.user._id, { page });
  res.render('pages/orders', { title: 'Your orders', orders });
}

async function detail(req, res) {
  const order = await orderService.getOrderForUser(req.user._id, req.params.orderNumber);
  res.render('pages/order', {
    title: `Order ${order.orderNumber}`,
    order,
    placed: req.query.placed === '1',
    canCancel: isCancellableByCustomer(order.status),
    steps: FULFILMENT_STEPS,
  });
}

async function cancel(req, res) {
  try {
    await orderService.cancelByCustomer(req.user._id, req.params.orderNumber);
    req.flash('success', 'Your order has been cancelled.');
  } catch (err) {
    if (!err.status || err.status >= 500 || err.status === 404) throw err;
    req.flash('error', err.message);
  }
  res.redirect(303, `/orders/${encodeURIComponent(req.params.orderNumber)}`);
}

async function invoice(req, res) {
  const order = await orderService.getOrderForUser(req.user._id, req.params.orderNumber);
  res.render('pages/invoice', {
    title: `Invoice ${order.invoiceNumber}`,
    order,
    layout: 'layouts/print',
  });
}

async function invoicePdf(req, res) {
  const order = await orderService.getOrderForUser(req.user._id, req.params.orderNumber);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Kartly-${order.invoiceNumber}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  renderInvoicePdf(order, res);
}

module.exports = { list, detail, cancel, invoice, invoicePdf };
