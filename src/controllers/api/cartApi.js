'use strict';

const cartService = require('../../services/cartService');
const { addToCartSchema, updateCartItemSchema } = require('../../validators');
const { parseOrThrow } = require('../../utils/validation');
const serialize = require('../../utils/serializers');

const owner = (req) => cartService.ownerFromRequest(req);

async function respond(req, res, cart, status = 200, extra = {}) {
  cartService.rememberGuestCart(req, cart);
  const view = await cartService.buildView(cart);
  res.status(status).json({ data: serialize.cart(view), ...extra });
}

async function getCart(req, res) {
  const cart = await cartService.findCart(owner(req));
  await respond(req, res, cart);
}

async function addItem(req, res) {
  const { productId, quantity } = parseOrThrow(addToCartSchema, req.body);
  const { cart, added, capped } = await cartService.addItem(owner(req), productId, quantity);
  await respond(req, res, cart, 201, {
    meta: {
      added,
      message: capped
        ? `Added ${added} — that's the most you can buy of this item.`
        : 'Added to your cart.',
    },
  });
}

async function updateItem(req, res) {
  const { quantity } = parseOrThrow(updateCartItemSchema, req.body);
  const cart = await cartService.setQuantity(owner(req), req.params.productId, quantity);
  await respond(req, res, cart);
}

async function removeItem(req, res) {
  const cart = await cartService.removeItem(owner(req), req.params.productId);
  await respond(req, res, cart);
}

async function clearCart(req, res) {
  await cartService.clear(owner(req));
  res.status(204).end();
}

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
