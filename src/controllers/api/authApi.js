'use strict';

const authService = require('../../services/authService');
const { signIn } = require('../web/authController');
const { loginSchema, registerSchema } = require('../../validators');
const { parseOrThrow } = require('../../utils/validation');
const serialize = require('../../utils/serializers');

async function register(req, res) {
  const data = parseOrThrow(registerSchema, req.body);
  const user = await authService.register(data);
  await signIn(req, user);
  res.status(201).json({ data: { user: serialize.user(user), csrfToken: req.csrfToken() } });
}

async function login(req, res) {
  const data = parseOrThrow(loginSchema, req.body);
  const user = await authService.authenticate(data);
  await signIn(req, user);
  res.json({ data: { user: serialize.user(user), csrfToken: req.csrfToken() } });
}

async function logout(req, res) {
  await authService.destroySession(req);
  res.clearCookie('kartly.sid');
  res.status(204).end();
}

function me(req, res) {
  res.json({ data: { user: req.user ? serialize.user(req.user) : null } });
}

function csrfToken(req, res) {
  res.json({ data: { csrfToken: req.csrfToken() } });
}

module.exports = { register, login, logout, me, csrfToken };
