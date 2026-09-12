'use strict';

const mongoose = require('mongoose');
const session = require('express-session');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const models = require('../src/models');
const { createApp } = require('../src/app');

let mongod;

async function startDatabase() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('kartly-test'));
  await Promise.all(Object.values(models).map((Model) => Model.init()));
}

async function stopDatabase() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function clearDatabase() {
  await Promise.all(Object.values(models).map((Model) => Model.deleteMany({})));
  require('../src/services/catalogService').invalidateCaches();
}

/** A fresh app with an in-memory session store (fast and isolated). */
function buildApp() {
  return createApp({ sessionStore: new session.MemoryStore() });
}

/** Supertest agent that remembers cookies and sends the CSRF header. */
async function agent(app) {
  const a = request.agent(app);
  const res = await a.get('/api/v1/auth/csrf-token');
  a.csrf = res.body.data.csrfToken;
  a.send = (method, url, body) => {
    const req = a[method](url).set('X-CSRF-Token', a.csrf).set('Accept', 'application/json');
    return body === undefined ? req : req.send(body);
  };
  return a;
}

async function createUser({
  name = 'Test Customer',
  email,
  password = 'Passw0rd!',
  role = 'customer',
  readOnly = false,
  isDemo = false,
} = {}) {
  const user = new models.User({ name, email, role, readOnly, isDemo });
  await user.setPassword(password);
  await user.save();
  return user;
}

/** Signs an agent in through the API and refreshes its CSRF token. */
async function login(a, email, password = 'Passw0rd!') {
  const res = await a.send('post', '/api/v1/auth/login', { email, password });
  if (res.status !== 200)
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  a.csrf = res.body.data.csrfToken;
  return res.body.data.user;
}

/** Minimal catalogue used across test files. */
async function seedCatalog() {
  const [phones, furniture] = await models.Category.create([
    { name: 'Mobiles', slug: 'mobiles', sortOrder: 0 },
    { name: 'Furniture', slug: 'furniture', sortOrder: 1 },
  ]);
  const [apple, samsung, kartlyHome] = await models.Brand.create([
    { name: 'Apple', slug: 'apple' },
    { name: 'Samsung', slug: 'samsung' },
    { name: 'Kartly Home', slug: 'kartly-home' },
  ]);
  const base = {
    description: 'A great product for testing purposes.',
    image: '/images/products/test.webp',
  };
  const products = await models.Product.create([
    {
      ...base,
      name: 'Apple iPhone 11 (Black, 64GB)',
      slug: 'apple-iphone-11',
      category: phones._id,
      brand: apple._id,
      price: 43900,
      mrp: 49900,
      stock: 10,
      tags: ['phone', 'iphone'],
    },
    {
      ...base,
      name: 'Samsung Galaxy F13 (4GB, 64GB)',
      slug: 'samsung-galaxy-f13',
      category: phones._id,
      brand: samsung._id,
      price: 11999,
      mrp: 14999,
      stock: 1,
      tags: ['phone', 'android'],
    },
    {
      ...base,
      name: 'Samsung Galaxy S21 Ultra',
      slug: 'samsung-galaxy-s21-ultra',
      category: phones._id,
      brand: samsung._id,
      price: 105999,
      mrp: 116999,
      stock: 0,
      tags: ['phone', 'android'],
    },
    {
      ...base,
      name: 'Moon Swivel Accent Chair',
      slug: 'moon-swivel-accent-chair',
      category: furniture._id,
      brand: kartlyHome._id,
      price: 499,
      mrp: 699,
      stock: 25,
      tags: ['chair'],
    },
  ]);
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  return {
    categories: { phones, furniture },
    brands: { apple, samsung, kartlyHome },
    products: bySlug,
  };
}

const ADDRESS = {
  fullName: 'Test Customer',
  phone: '+91 98765 43210',
  line1: '221B MG Road',
  line2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
};

/** 1×1 transparent PNG. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = {
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  agent,
  createUser,
  login,
  seedCatalog,
  ADDRESS,
  PNG_BYTES,
  models,
};
