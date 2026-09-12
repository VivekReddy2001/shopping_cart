'use strict';

const { Cart, Order, Product, User, Counter } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { calculateTotals, round2 } = require('../utils/money');
const { generateOrderNumber, generateTransactionId, escapeRegex } = require('../utils/strings');
const {
  canTransition,
  isCancellableByCustomer,
  statusLabel,
  ORDER_STATUSES,
} = require('../utils/orderStatus');
const mailService = require('./mailService');

async function nextInvoiceNumber(date = new Date()) {
  const year = date.getFullYear();
  const seq = await Counter.next(`invoice-${year}`);
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}

/** Returns stock reserved for an order to the catalogue. */
async function restock(items) {
  await Promise.all(
    items.map((item) =>
      Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity, soldCount: -item.quantity } }
      )
    )
  );
}

/**
 * Checkout: validates the cart against live stock, reserves stock with
 * atomic conditional updates (no overselling under concurrency), snapshots
 * prices into the order, clears the cart and emails a confirmation.
 * If anything fails midway, reserved stock is released again.
 */
async function placeOrder(user, { shippingAddress, paymentMethod }) {
  const cart = await Cart.findOne({ user: user._id }).populate({
    path: 'items.product',
    populate: [
      { path: 'brand', select: 'name' },
      { path: 'category', select: 'name' },
    ],
  });
  if (!cart || cart.items.length === 0) {
    throw ApiError.badRequest('Your cart is empty.', 'CART_EMPTY');
  }

  const lines = cart.items.map((item) => ({ product: item.product, quantity: item.quantity }));
  for (const { product, quantity } of lines) {
    if (!product || !product.isActive) {
      throw ApiError.conflict(
        'An item in your cart is no longer available. Please review your cart.',
        'ITEM_UNAVAILABLE'
      );
    }
    if (product.stock < quantity) {
      throw ApiError.conflict(
        product.stock === 0
          ? `${product.name} is out of stock. Please remove it from your cart.`
          : `Only ${product.stock} × ${product.name} left in stock. Please update your cart.`,
        'OUT_OF_STOCK'
      );
    }
  }

  const reserved = [];
  try {
    for (const { product, quantity } of lines) {
      const result = await Product.updateOne(
        { _id: product._id, isActive: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity, soldCount: quantity } }
      );
      if (result.modifiedCount !== 1) {
        throw ApiError.conflict(
          `${product.name} just sold out. Please update your cart.`,
          'OUT_OF_STOCK'
        );
      }
      reserved.push({ product: product._id, quantity });
    }

    const items = lines.map(({ product, quantity }) => ({
      product: product._id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      brand: product.brand ? product.brand.name : '',
      category: product.category ? product.category.name : '',
      price: product.price,
      mrp: product.mrp,
      quantity,
      lineTotal: round2(product.price * quantity),
    }));
    const { subtotal, shipping, tax, total } = calculateTotals(items);
    const now = new Date();
    const paidOnline = paymentMethod === 'ONLINE';

    const order = await Order.create({
      orderNumber: generateOrderNumber(now),
      invoiceNumber: await nextInvoiceNumber(now),
      user: user._id,
      customer: { name: user.name, email: user.email },
      items,
      shippingAddress,
      payment: {
        method: paymentMethod,
        status: paidOnline ? 'PAID' : 'PENDING',
        transactionId: paidOnline ? generateTransactionId() : undefined,
        paidAt: paidOnline ? now : undefined,
      },
      amounts: { subtotal, shipping, tax, total },
      status: 'PLACED',
      statusHistory: [{ status: 'PLACED', at: now, note: 'Order placed by customer' }],
    });

    await Promise.all([
      Cart.updateOne({ _id: cart._id }, { $set: { items: [] } }),
      User.updateOne(
        { _id: user._id },
        { $set: { address: shippingAddress, phone: shippingAddress.phone } }
      ),
    ]);

    mailService
      .sendOrderConfirmation(order)
      .catch((err) => logger.warn('Order confirmation email failed:', err.message));
    return order;
  } catch (err) {
    if (reserved.length) await restock(reserved);
    throw err;
  }
}

async function listOrdersForUser(userId, { page = 1, limit = 10 } = {}) {
  const [total, items] = await Promise.all([
    Order.countDocuments({ user: userId }),
    Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Customers can only see their own orders (404 otherwise, to avoid leaking existence). */
async function getOrderForUser(userId, orderNumber) {
  const order = await Order.findOne({ orderNumber: String(orderNumber), user: userId }).lean();
  if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
  return order;
}

async function getOrder(orderNumber) {
  const order = await Order.findOne({ orderNumber: String(orderNumber) }).lean();
  if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
  return order;
}

/**
 * Moves an order to a new status using an atomic compare-and-set on the
 * current status, so two admins (or a double click) can't apply the same
 * transition twice. Cancelling restocks items and refunds online payments;
 * delivering a COD order marks it paid.
 */
async function changeStatus(orderNumber, nextStatus, { actorId, note = '', userId } = {}) {
  if (!ORDER_STATUSES.includes(nextStatus)) {
    throw ApiError.validation({ status: 'Unknown order status' });
  }
  const filter = { orderNumber: String(orderNumber) };
  if (userId) filter.user = userId;
  const order = await Order.findOne(filter).lean();
  if (!order) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');

  if (order.status === nextStatus) return order;
  if (!canTransition(order.status, nextStatus)) {
    throw ApiError.conflict(
      `An order that is ${statusLabel(order.status).toLowerCase()} can't be marked as ${statusLabel(nextStatus).toLowerCase()}.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const now = new Date();
  const set = { status: nextStatus };
  if (nextStatus === 'CANCELLED' && order.payment.status === 'PAID')
    set['payment.status'] = 'REFUNDED';
  if (
    nextStatus === 'DELIVERED' &&
    order.payment.method === 'COD' &&
    order.payment.status === 'PENDING'
  ) {
    set['payment.status'] = 'PAID';
    set['payment.paidAt'] = now;
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: set, $push: { statusHistory: { status: nextStatus, at: now, note, by: actorId } } },
    { new: true }
  ).lean();
  if (!updated) {
    throw ApiError.conflict(
      'This order was updated by someone else. Refresh and try again.',
      'STALE_ORDER'
    );
  }

  if (nextStatus === 'CANCELLED') await restock(updated.items);

  mailService
    .sendOrderStatusUpdate(updated)
    .catch((err) => logger.warn('Status email failed:', err.message));
  return updated;
}

async function cancelByCustomer(userId, orderNumber) {
  const order = await getOrderForUser(userId, orderNumber);
  if (!isCancellableByCustomer(order.status)) {
    throw ApiError.conflict(
      'This order has already shipped and can no longer be cancelled.',
      'NOT_CANCELLABLE'
    );
  }
  return changeStatus(orderNumber, 'CANCELLED', {
    actorId: userId,
    userId,
    note: 'Cancelled by customer',
  });
}

async function listAllOrders({ status = '', q = '', page = 1, limit = 20 } = {}) {
  const filter = {};
  if (status && ORDER_STATUSES.includes(status)) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ orderNumber: rx }, { 'customer.email': rx }, { 'customer.name': rx }];
  }
  const [total, items, counts] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  for (const c of counts) statusCounts[c._id] = c.count;
  return {
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    statusCounts,
    allCount: Object.values(statusCounts).reduce((a, b) => a + b, 0),
  };
}

module.exports = {
  nextInvoiceNumber,
  placeOrder,
  listOrdersForUser,
  getOrderForUser,
  getOrder,
  changeStatus,
  cancelByCustomer,
  listAllOrders,
};
