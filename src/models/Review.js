'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true, maxlength: 60 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100, default: '' },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One review per customer per product (re-submitting updates it).
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

/** Recomputes the cached rating summary stored on the product. */
reviewSchema.statics.refreshProductRating = async function refreshProductRating(productId) {
  const [summary] = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)) } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const Product = mongoose.model('Product');
  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        'rating.average': summary ? Math.round(summary.average * 10) / 10 : 0,
        'rating.count': summary ? summary.count : 0,
      },
    }
  );
};

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
