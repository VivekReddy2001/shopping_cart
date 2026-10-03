'use strict';

const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when the client expects JSON (REST API calls and fetch requests). */
function wantsJson(req) {
  if (req.originalUrl.startsWith('/api/')) return true;
  if (req.get('x-requested-with')) return true;
  const accept = req.get('accept') || '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

/** Loads the signed-in user (if any) on every request. */
async function attachUser(req, res, next) {
  const userId = req.session && req.session.userId;
  if (userId) {
    const user = await User.findById(userId).select('name email role readOnly isDemo').lean();
    if (user) {
      req.user = user;
    } else {
      delete req.session.userId;
    }
  }
  res.locals.currentUser = req.user || null;
  next();
}

function redirectToLogin(req, res) {
  req.flash('info', 'Please sign in to continue.');
  const nextPath = req.method === 'GET' ? req.originalUrl : req.get('referer') || '/';
  let target;
  try {
    target = nextPath.startsWith('http') ? new URL(nextPath).pathname : nextPath;
  } catch {
    target = '/';
  }
  return res.redirect(`/login?next=${encodeURIComponent(target)}`);
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return next(ApiError.unauthorized());
  return redirectToLogin(req, res);
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) return next(ApiError.unauthorized());
    return redirectToLogin(req, res);
  }
  if (req.user.role !== 'admin') {
    return next(ApiError.forbidden('This area is only available to store administrators.'));
  }
  if (req.user.readOnly && !SAFE_METHODS.has(req.method)) {
    return next(
      ApiError.forbidden(
        'The demo admin account is read-only. Changes are disabled on the public demo.',
        'READ_ONLY_ADMIN'
      )
    );
  }
  return next();
}

/** Redirects signed-in users away from /login and /register. */
function redirectIfAuthenticated(req, res, next) {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/');
  return next();
}

module.exports = { attachUser, requireAuth, requireAdmin, redirectIfAuthenticated, wantsJson };
