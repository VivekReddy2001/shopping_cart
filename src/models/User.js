'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const addressSchema = require('./schemas/address');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    /** Read-only admins (the public demo admin) can view the dashboard but not change data. */
    readOnly: { type: Boolean, default: false },
    /** Shared demo accounts cannot change their credentials. */
    isDemo: { type: Boolean, default: false },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    address: { type: addressSchema, default: undefined },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, config.bcryptRounds);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash || '');
};

userSchema.virtual('isAdmin').get(function isAdmin() {
  return this.role === 'admin';
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
