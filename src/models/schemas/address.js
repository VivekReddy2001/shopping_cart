'use strict';

const { Schema } = require('mongoose');

/** Embedded shipping address (used by User and Order). */
const addressSchema = new Schema(
  {
    fullName: { type: String, trim: true, maxlength: 80, required: true },
    phone: { type: String, trim: true, maxlength: 20, required: true },
    line1: { type: String, trim: true, maxlength: 120, required: true },
    line2: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, trim: true, maxlength: 60, required: true },
    state: { type: String, trim: true, maxlength: 60, required: true },
    postalCode: { type: String, trim: true, maxlength: 12, required: true },
    country: { type: String, trim: true, maxlength: 60, default: 'India' },
  },
  { _id: false }
);

module.exports = addressSchema;
