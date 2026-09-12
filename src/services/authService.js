'use strict';

const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const mailService = require('./mailService');

async function register({ name, email, password }) {
  const exists = await User.exists({ email });
  if (exists) {
    throw ApiError.conflict('An account with this email already exists.', 'EMAIL_TAKEN', {
      email: 'An account with this email already exists',
    });
  }
  const user = new User({ name, email, role: 'customer' });
  await user.setPassword(password);
  await user.save();
  mailService.sendWelcome(user).catch((err) => logger.warn('Welcome email failed:', err.message));
  return user;
}

/** Same error for unknown email and wrong password (prevents account enumeration). */
async function authenticate({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = user ? await user.verifyPassword(password) : false;
  if (!user || !valid) {
    throw new ApiError(401, 'Incorrect email or password.', 'INVALID_CREDENTIALS');
  }
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

async function updateProfile(userId, { name, phone }) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { name, phone: phone || '' } },
    { new: true, runValidators: true }
  );
  if (!user) throw ApiError.notFound('Account not found');
  return user;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');
  if (user.isDemo) {
    throw ApiError.forbidden('Demo account passwords cannot be changed.', 'DEMO_ACCOUNT');
  }
  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.validation({ currentPassword: 'Your current password is incorrect' });
  }
  await user.setPassword(newPassword);
  await user.save();
}

/** Promisified session regeneration (prevents session fixation on sign-in). */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

module.exports = {
  register,
  authenticate,
  updateProfile,
  changePassword,
  regenerateSession,
  saveSession,
  destroySession,
};
