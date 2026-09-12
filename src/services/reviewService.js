'use strict';

const { Review, Order, Product } = require('../models');
const ApiError = require('../utils/ApiError');

async function listForProduct(productId, { limit = 20 } = {}) {
  const [reviews, distribution] = await Promise.all([
    Review.find({ product: productId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Review.aggregate([
      { $match: { product: productId } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const d of distribution) counts[d._id] = d.count;
  return { reviews, distribution: counts };
}

/** Only customers who ordered the product (and didn't cancel) may review it. */
async function hasPurchased(userId, productId) {
  return Boolean(
    await Order.exists({ user: userId, 'items.product': productId, status: { $ne: 'CANCELLED' } })
  );
}

async function getUserReview(userId, productId) {
  return Review.findOne({ user: userId, product: productId }).lean();
}

async function upsertReview(user, productId, { rating, title = '', comment }) {
  const product = await Product.findOne({ _id: productId, isActive: true }).select('_id').lean();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  if (!(await hasPurchased(user._id, productId))) {
    throw ApiError.forbidden('You can review products you have ordered.', 'NOT_PURCHASED');
  }
  const review = await Review.findOneAndUpdate(
    { user: user._id, product: productId },
    {
      $set: { rating, title, comment, authorName: user.name, verifiedPurchase: true },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await Review.refreshProductRating(productId);
  return review;
}

module.exports = { listForProduct, hasPurchased, getUserReview, upsertReview };
