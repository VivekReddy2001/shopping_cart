'use strict';

const mongoose = require('mongoose');
const { Cart, Product } = require('../models');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { calculateTotals, round2 } = require('../utils/money');

const GUEST_CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QTY = config.store.maxQuantityPerItem;

/**
 * A cart "owner" is either a signed-in user or an anonymous visitor whose
 * guest cart id lives in their session.
 */
function ownerFromRequest(req) {
  if (req.user) return { userId: req.user._id };
  return { guestCartId: req.session ? req.session.guestCartId : undefined };
}

function rememberGuestCart(req, cart) {
  if (!req.user && req.session && cart && String(req.session.guestCartId) !== String(cart._id)) {
    req.session.guestCartId = String(cart._id);
  }
}

async function findCart(owner) {
  if (owner.userId) return Cart.findOne({ user: owner.userId });
  if (owner.guestCartId && mongoose.isValidObjectId(owner.guestCartId)) {
    return Cart.findOne({ _id: owner.guestCartId, user: { $exists: false } });
  }
  return null;
}

async function findOrCreateCart(owner) {
  if (owner.userId) {
    return Cart.findOneAndUpdate(
      { user: owner.userId },
      { $setOnInsert: { user: owner.userId, items: [] } },
      { upsert: true, new: true }
    );
  }
  const existing = await findCart(owner);
  if (existing) return existing;
  return Cart.create({ items: [], expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS) });
}

async function countItems(owner) {
  let filter = null;
  if (owner.userId) filter = { user: owner.userId };
  else if (owner.guestCartId && mongoose.isValidObjectId(owner.guestCartId)) {
    filter = { _id: owner.guestCartId, user: { $exists: false } };
  }
  if (!filter) return 0;
  const cart = await Cart.findOne(filter).select('items.quantity').lean();
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

function emptyView() {
  return { id: null, lines: [], ...calculateTotals([]), canCheckout: false, issues: [] };
}

/**
 * Builds the cart "view": live prices from the catalogue, stock checks and totals.
 * Items whose product was removed from the store are dropped automatically.
 */
async function buildView(cart) {
  if (!cart || cart.items.length === 0)
    return { ...emptyView(), id: cart ? String(cart._id) : null };

  const originalIds = cart.items.map((item) => item.product);
  await cart.populate({
    path: 'items.product',
    select: 'name slug price mrp discountPercent stock image isActive brand category',
    populate: [
      { path: 'brand', select: 'name slug' },
      { path: 'category', select: 'name slug' },
    ],
  });

  const lines = [];
  const issues = [];
  const staleIds = cart.items
    .map((item, index) => (!item.product || !item.product.isActive ? originalIds[index] : null))
    .filter(Boolean);
  for (const item of cart.items) {
    const p = item.product;
    if (!p || !p.isActive) continue;
    const available = Math.max(0, Math.min(p.stock, MAX_QTY));
    const inStock = p.stock >= item.quantity;
    if (!inStock) {
      issues.push(
        p.stock === 0
          ? `${p.name} is out of stock. Remove it to continue.`
          : `Only ${p.stock} × ${p.name} left in stock. Reduce the quantity to continue.`
      );
    }
    lines.push({
      productId: String(p._id),
      name: p.name,
      slug: p.slug,
      image: p.image,
      brand: p.brand ? p.brand.name : '',
      category: p.category ? p.category.name : '',
      price: p.price,
      mrp: p.mrp,
      discountPercent: p.discountPercent,
      quantity: item.quantity,
      maxQuantity: available,
      stock: p.stock,
      inStock,
      lineTotal: round2(p.price * item.quantity),
    });
  }

  if (staleIds.length) {
    await Cart.updateOne(
      { _id: cart._id },
      { $pull: { items: { product: { $in: staleIds.map((id) => (id && id._id ? id._id : id)) } } } }
    );
    issues.push('Some items are no longer available and were removed from your cart.');
  }

  const totals = calculateTotals(lines);
  return {
    id: String(cart._id),
    lines,
    ...totals,
    canCheckout: lines.length > 0 && lines.every((l) => l.inStock),
    issues,
  };
}

async function getView(owner) {
  return buildView(await findCart(owner));
}

async function loadSellableProduct(productId) {
  if (!mongoose.isValidObjectId(productId))
    throw ApiError.badRequest('Invalid product id', 'INVALID_ID');
  const product = await Product.findOne({ _id: productId, isActive: true })
    .select('name stock')
    .lean();
  if (!product)
    throw ApiError.notFound('This product is no longer available.', 'PRODUCT_NOT_FOUND');
  return product;
}

async function addItem(owner, productId, quantity = 1) {
  const product = await loadSellableProduct(productId);
  if (product.stock < 1)
    throw ApiError.conflict(`${product.name} is out of stock.`, 'OUT_OF_STOCK');

  const cart = await findOrCreateCart(owner);
  const line = cart.items.find((i) => String(i.product) === String(product._id));
  const limit = Math.min(product.stock, MAX_QTY);
  const current = line ? line.quantity : 0;

  if (current >= limit) {
    throw ApiError.conflict(
      limit === MAX_QTY
        ? `You can buy up to ${MAX_QTY} of this item per order.`
        : `Only ${product.stock} left in stock — they're all in your cart.`,
      'QUANTITY_LIMIT'
    );
  }
  const next = Math.min(current + quantity, limit);
  if (line) line.quantity = next;
  else cart.items.push({ product: product._id, quantity: next });
  if (!owner.userId) cart.expiresAt = new Date(Date.now() + GUEST_CART_TTL_MS);
  await cart.save();
  return { cart, added: next - current, capped: next < current + quantity };
}

async function setQuantity(owner, productId, quantity) {
  const cart = await findCart(owner);
  const line = cart && cart.items.find((i) => String(i.product) === String(productId));
  if (!line) throw ApiError.notFound('That item is not in your cart.', 'CART_ITEM_NOT_FOUND');

  const product = await loadSellableProduct(productId);
  if (quantity > MAX_QTY) {
    throw ApiError.conflict(
      `You can buy up to ${MAX_QTY} of this item per order.`,
      'QUANTITY_LIMIT'
    );
  }
  if (quantity > product.stock) {
    throw ApiError.conflict(
      `Only ${product.stock} of ${product.name} left in stock.`,
      'OUT_OF_STOCK'
    );
  }
  line.quantity = quantity;
  await cart.save();
  return cart;
}

async function removeItem(owner, productId) {
  const cart = await findCart(owner);
  if (!cart) throw ApiError.notFound('That item is not in your cart.', 'CART_ITEM_NOT_FOUND');
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => String(i.product) !== String(productId));
  if (cart.items.length === before) {
    throw ApiError.notFound('That item is not in your cart.', 'CART_ITEM_NOT_FOUND');
  }
  await cart.save();
  return cart;
}

async function clear(owner) {
  const cart = await findCart(owner);
  if (cart) {
    cart.items = [];
    await cart.save();
  }
  return cart;
}

/** Moves a guest cart into the user's cart after sign-in/registration. */
async function mergeGuestCart(guestCartId, userId) {
  if (!guestCartId || !mongoose.isValidObjectId(guestCartId)) return;
  const guest = await Cart.findOne({ _id: guestCartId, user: { $exists: false } });
  if (!guest) return;
  if (guest.items.length) {
    const cart = await findOrCreateCart({ userId });
    for (const item of guest.items) {
      const line = cart.items.find((i) => String(i.product) === String(item.product));
      if (line) line.quantity = Math.min(line.quantity + item.quantity, MAX_QTY);
      else cart.items.push({ product: item.product, quantity: Math.min(item.quantity, MAX_QTY) });
    }
    await cart.save();
  }
  await Cart.deleteOne({ _id: guest._id });
}

module.exports = {
  MAX_QTY,
  ownerFromRequest,
  rememberGuestCart,
  findCart,
  countItems,
  buildView,
  getView,
  addItem,
  setQuantity,
  removeItem,
  clear,
  mergeGuestCart,
};
