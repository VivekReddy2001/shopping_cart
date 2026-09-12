'use strict';

const catalogService = require('../../services/catalogService');
const reviewService = require('../../services/reviewService');
const config = require('../../config/env');
const { listQuerySchema, reviewSchema } = require('../../validators');
const { fieldErrors } = require('../../utils/validation');

async function home(req, res) {
  const data = await catalogService.getHomepageData();
  res.render('pages/home', {
    title: 'Everything you need, one cart away',
    description:
      'Shop phones, laptops, TVs, home appliances, furniture and fashion on Kartly — fast search, voice search, secure checkout and order tracking.',
    ...data,
  });
}

function headingFor(result, query) {
  if (query.q) return `Results for “${query.q}”`;
  if (result.category) return result.category.name;
  return 'All products';
}

async function products(req, res) {
  const query = listQuerySchema.parse(req.query);
  const result = await catalogService.listProducts(query);
  const heading = headingFor(result, query);
  const locals = {
    title: heading,
    description: result.category
      ? `Shop ${result.category.name} on Kartly — compare prices, filter by brand and order online.`
      : 'Browse the Kartly catalogue with filters, sorting and voice search.',
    heading,
    result,
    query,
    activeCategory: query.category || '',
    sortOptions: catalogService.SORT_OPTIONS,
    scripts: ['/js/shop.js'],
  };
  if (req.get('x-requested-with') === 'fetch') {
    return res.render('partials/shop-results', { ...locals, layout: false });
  }
  return res.render('pages/products', locals);
}

async function productDetail(req, res) {
  const product = await catalogService.getProduct(req.params.slug);
  const [related, reviewData, canReview, userReview] = await Promise.all([
    catalogService.getRelatedProducts(product),
    reviewService.listForProduct(product._id),
    req.user ? reviewService.hasPurchased(req.user._id, product._id) : false,
    req.user ? reviewService.getUserReview(req.user._id, product._id) : null,
  ]);
  res.render('pages/product', {
    title: product.name,
    description: product.description.slice(0, 155),
    product,
    activeCategory: product.category ? product.category.slug : '',
    related,
    reviews: reviewData.reviews,
    distribution: reviewData.distribution,
    canReview,
    userReview,
    maxQty: Math.max(0, Math.min(product.stock, config.store.maxQuantityPerItem)),
    scripts: ['/js/product.js'],
  });
}

async function submitReview(req, res) {
  const product = await catalogService.getProduct(req.params.slug);
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    req.flash('error', Object.values(errors)[0]);
    return res.redirect(303, `/products/${product.slug}#write-review`);
  }
  try {
    await reviewService.upsertReview(req.user, product._id, parsed.data);
    req.flash('success', 'Thanks! Your review has been published.');
  } catch (err) {
    if (!err.status || err.status >= 500) throw err;
    req.flash('error', err.message);
  }
  return res.redirect(303, `/products/${product.slug}#reviews`);
}

module.exports = { home, products, productDetail, submitReview };
