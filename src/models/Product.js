'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    highlights: {
      type: [{ type: String, trim: true, maxlength: 160 }],
      default: [],
      validate: [(v) => v.length <= 8, 'A product can have at most 8 highlights'],
    },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    /** Maximum retail price (list price) — shown struck-through when higher than price. */
    mrp: { type: Number, required: true, min: 0 },
    /** Stored (not virtual) so the catalogue can be sorted by discount. */
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    stock: {
      type: Number,
      required: true,
      min: 0,
      validate: [Number.isInteger, 'Stock must be a whole number'],
    },
    soldCount: { type: Number, default: 0, min: 0 },
    image: { type: String, required: true, trim: true },
    /** Set when the image was uploaded through the admin panel (stored in MongoDB). */
    imageMedia: { type: Schema.Types.ObjectId, ref: 'Media' },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }], default: [] },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
    featured: { type: Boolean, default: false },
    /** Archived products are hidden from the store but kept for order history. */
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

productSchema.index({ isActive: 1, category: 1, price: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, discountPercent: -1 });
productSchema.index({ isActive: 1, soldCount: -1 });

productSchema.pre('validate', async function computeDiscount() {
  if (this.mrp == null || this.mrp < this.price) this.mrp = this.price;
  this.discountPercent =
    this.mrp > this.price ? Math.round(((this.mrp - this.price) / this.mrp) * 100) : 0;
});

productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
