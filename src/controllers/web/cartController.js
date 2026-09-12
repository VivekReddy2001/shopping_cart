'use strict';

const cartService = require('../../services/cartService');
const { addToCartSchema, cartLineFormSchema } = require('../../validators');
const { parseOrThrow } = require('../../utils/validation');
const { safeRedirectPath } = require('../../utils/strings');

const owner = (req) => cartService.ownerFromRequest(req);

/**
 * Where a plain form submission should land afterwards: an explicit same-site
 * `next` field, else the referring page, else the cart.
 */
function backTo(req, fallback = '/cart') {
  const explicit = safeRedirectPath(req.body && req.body.next, '');
  if (explicit) return explicit;
  const referer = req.get('referer');
  if (referer) {
    try {
      const url = new URL(referer, `${req.protocol}://${req.get('host')}`);
      if (url.host === req.get('host')) return `${url.pathname}${url.search}`;
    } catch {
      /* fall through to the default */
    }
  }
  return fallback;
}

/**
 * Cart forms are progressive enhancements: with JavaScript the browser never
 * submits them, and without it a rejected change should flash a message and
 * return to the page rather than render a full error screen.
 */
function cartForm(handler) {
  return async function wrapped(req, res, next) {
    try {
      await handler(req, res);
    } catch (err) {
      if (!err || !err.status || err.status >= 500) return next(err);
      req.flash('error', err.message);
      return res.redirect(303, backTo(req));
    }
    return undefined;
  };
}

async function show(req, res) {
  const cart = await cartService.getView(owner(req));
  const locals = { title: 'Your cart', cart, scripts: ['/js/cart.js'] };
  if (req.get('x-requested-with') === 'fetch') {
    return res.render('partials/cart-contents', { ...locals, layout: false });
  }
  return res.render('pages/cart', locals);
}

const add = cartForm(async (req, res) => {
  const { productId, quantity } = parseOrThrow(addToCartSchema, req.body);
  const { cart, added, capped } = await cartService.addItem(owner(req), productId, quantity);
  cartService.rememberGuestCart(req, cart);
  if (req.body.buyNow) return res.redirect(303, '/checkout');
  req.flash(
    'success',
    capped ? `Added ${added} — that's the most you can buy of this item.` : 'Added to your cart.'
  );
  return res.redirect(303, backTo(req));
});

const updateLine = cartForm(async (req, res) => {
  if (req.body.remove !== undefined) {
    await cartService.removeItem(owner(req), req.params.productId);
    req.flash('success', 'Item removed from your cart.');
    return res.redirect(303, backTo(req));
  }
  const { quantity, delta } = parseOrThrow(cartLineFormSchema, req.body);
  await cartService.setQuantity(
    owner(req),
    req.params.productId,
    Math.max(1, quantity + (delta || 0))
  );
  return res.redirect(303, backTo(req));
});

const clear = cartForm(async (req, res) => {
  await cartService.clear(owner(req));
  req.flash('success', 'Your cart is now empty.');
  return res.redirect(303, backTo(req));
});

module.exports = { show, add, updateLine, clear };
