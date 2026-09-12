'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const cartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * A cart belongs either to a signed-in user (`user`) or to an anonymous
 * visitor (no `user`, referenced from their session). Guest carts carry an
 * `expiresAt` date and are removed automatically by a TTL index.
 */
const cartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    items: { type: [cartItemSchema], default: [] },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

cartSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }
);
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
