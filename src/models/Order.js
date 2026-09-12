'use strict';

const mongoose = require('mongoose');
const addressSchema = require('./schemas/address');
const { ORDER_STATUSES } = require('../utils/orderStatus');

const { Schema } = mongoose;

/** Items are snapshotted so later catalogue edits never change past orders. */
const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String, required: true },
    brand: { type: String, default: '' },
    category: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const statusEventSchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    invoiceNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
    },
    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, 'An order needs at least one item'],
    },
    shippingAddress: { type: addressSchema, required: true },
    payment: {
      method: { type: String, enum: ['COD', 'ONLINE'], required: true },
      status: { type: String, enum: ['PENDING', 'PAID', 'REFUNDED'], default: 'PENDING' },
      transactionId: { type: String },
      paidAt: { type: Date },
    },
    amounts: {
      subtotal: { type: Number, required: true, min: 0 },
      shipping: { type: Number, required: true, min: 0 },
      tax: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'PLACED', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
