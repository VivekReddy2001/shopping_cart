'use strict';

const config = require('../../config/env');
const authService = require('../../services/authService');
const cartService = require('../../services/cartService');
const { loginSchema, registerSchema } = require('../../validators');
const { fieldErrors } = require('../../utils/validation');
const { safeRedirectPath } = require('../../utils/strings');
const { DEMO_ACCOUNTS } = require('../../seed/accounts');

/** Signs a user in: new session id (anti-fixation) + guest cart merge. */
async function signIn(req, user) {
  const guestCartId = req.session.guestCartId;
  await authService.regenerateSession(req);
  req.session.userId = String(user._id);
  await cartService.mergeGuestCart(guestCartId, user._id);
}

const demoAccounts = () => (config.seed.demoAccounts ? DEMO_ACCOUNTS : []);

function showLogin(req, res) {
  res.render('pages/login', {
    title: 'Sign in',
    values: {},
    errors: {},
    next: safeRedirectPath(req.query.next, ''),
    demoAccounts: demoAccounts(),
  });
}

async function login(req, res) {
  const next = safeRedirectPath(req.body.next, '');
  const parsed = loginSchema.safeParse(req.body);
  const renderError = (status, errors) =>
    res.status(status).render('pages/login', {
      title: 'Sign in',
      values: { email: req.body.email || '' },
      errors,
      next,
      demoAccounts: demoAccounts(),
    });

  if (!parsed.success) return renderError(422, fieldErrors(parsed.error));
  let user;
  try {
    user = await authService.authenticate(parsed.data);
  } catch (err) {
    if (err.status === 401) return renderError(401, { _form: err.message });
    throw err;
  }
  await signIn(req, user);
  req.flash('success', `Welcome back, ${user.name.split(' ')[0]}!`);
  return res.redirect(303, next || (user.role === 'admin' ? '/admin' : '/'));
}

function showRegister(req, res) {
  res.render('pages/register', {
    title: 'Create your account',
    values: {},
    errors: {},
    next: safeRedirectPath(req.query.next, ''),
  });
}

async function register(req, res) {
  const next = safeRedirectPath(req.body.next, '');
  const renderError = (status, errors) =>
    res.status(status).render('pages/register', {
      title: 'Create your account',
      values: { name: req.body.name || '', email: req.body.email || '' },
      errors,
      next,
    });

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return renderError(422, fieldErrors(parsed.error));
  let user;
  try {
    user = await authService.register(parsed.data);
  } catch (err) {
    if (err.status === 409) return renderError(409, err.details || { email: err.message });
    throw err;
  }
  await signIn(req, user);
  req.flash('success', `Welcome to Kartly, ${user.name.split(' ')[0]}! Your account is ready.`);
  return res.redirect(303, next || '/');
}

async function logout(req, res) {
  await authService.destroySession(req);
  res.clearCookie('kartly.sid');
  res.redirect(303, '/');
}

module.exports = { showLogin, login, showRegister, register, logout, signIn };
