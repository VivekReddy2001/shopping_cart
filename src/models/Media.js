'use strict';

const mongoose = require('mongoose');

/**
 * Images uploaded from the admin panel are stored in MongoDB rather than on
 * disk, because free hosting tiers (e.g. Render) have ephemeral filesystems.
 */
const mediaSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Media || mongoose.model('Media', mediaSchema);
