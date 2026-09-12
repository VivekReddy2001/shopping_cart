'use strict';

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const config = require('../config/env');
const logger = require('../utils/logger');
const {
  User,
  Category,
  Brand,
  Product,
  Cart,
  Order,
  Review,
  Counter,
  Media,
} = require('../models');
const { CATEGORIES, BRANDS, PRODUCTS } = require('./catalog');
const { DEMO_ACCOUNTS } = require('./accounts');
const { slugify, generateOrderNumber, generateTransactionId } = require('../utils/strings');
const { calculateTotals, round2 } = require('../utils/money');

const DAY = 24 * 60 * 60 * 1000;
const productImage = (slug) => `/images/products/${slug}.webp`;

/** Small deterministic PRNG so every seed produces the same demo data. */
function createRandom(seed = 20251109) {
  let state = seed;
  const next = () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

async function ensureUser({
  name,
  email,
  password,
  role = 'customer',
  readOnly = false,
  isDemo = false,
}) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const user = new User({ name, email, role, readOnly, isDemo });
  await user.setPassword(password);
  await user.save();
  return user;
}

/** Creates the store admin (from env) and the public demo accounts. */
async function ensureAccounts() {
  const accounts = {};
  if (config.admin.password) {
    accounts.admin = await ensureUser({
      name: config.admin.name,
      email: config.admin.email,
      password: config.admin.password,
      role: 'admin',
    });
  } else {
    logger.warn('ADMIN_PASSWORD is not set — skipping creation of the store admin account.');
  }
  if (config.seed.demoAccounts) {
    for (const account of DEMO_ACCOUNTS) {
      accounts[account.role === 'admin' ? 'demoAdmin' : 'demoCustomer'] = await ensureUser({
        ...account,
        isDemo: true,
      });
    }
  }
  return accounts;
}

async function seedCatalog(random) {
  await Category.bulkWrite(
    CATEGORIES.map((c, index) => ({
      updateOne: {
        filter: { slug: c.slug },
        update: {
          $setOnInsert: { slug: c.slug },
          $set: {
            name: c.name,
            description: c.description,
            image: productImage(c.image),
            sortOrder: index,
          },
        },
        upsert: true,
      },
    }))
  );
  await Brand.bulkWrite(
    BRANDS.map((name) => ({
      updateOne: { filter: { slug: slugify(name) }, update: { $set: { name } }, upsert: true },
    }))
  );

  const [categories, brands] = await Promise.all([Category.find().lean(), Brand.find().lean()]);
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const brandByName = new Map(brands.map((b) => [b.name, b]));
  const tagsByCategory = new Map(CATEGORIES.map((c) => [c.slug, c.tags]));

  const now = Date.now();
  const docs = PRODUCTS.map((p) => {
    const createdAt = new Date(now - random.int(1, 90) * DAY - random.int(0, 86_399) * 1000);
    return {
      name: p.name,
      slug: p.slug,
      description: p.description,
      highlights: p.highlights,
      category: categoryBySlug.get(p.category)._id,
      brand: brandByName.get(p.brand)._id,
      price: p.price,
      mrp: p.mrp,
      discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
      stock: p.stock,
      image: productImage(p.slug),
      tags: [...new Set([...(tagsByCategory.get(p.category) || []), ...(p.tags || [])])],
      featured: Boolean(p.featured),
      isActive: true,
      soldCount: 0,
      rating: { average: 0, count: 0 },
      createdAt,
      updatedAt: createdAt,
      __v: 0,
    };
  });
  // Raw insert keeps the staggered createdAt values (so "Newest" sorting is meaningful).
  await Product.collection.insertMany(docs);
  return Product.find().lean();
}

const CITIES = [
  { city: 'Bengaluru', state: 'Karnataka', postalCode: '560034' },
  { city: 'Hyderabad', state: 'Telangana', postalCode: '500081' },
  { city: 'Mumbai', state: 'Maharashtra', postalCode: '400050' },
  { city: 'Chennai', state: 'Tamil Nadu', postalCode: '600040' },
  { city: 'Pune', state: 'Maharashtra', postalCode: '411014' },
  { city: 'New Delhi', state: 'Delhi', postalCode: '110017' },
  { city: 'Kochi', state: 'Kerala', postalCode: '682016' },
  { city: 'Jaipur', state: 'Rajasthan', postalCode: '302017' },
];

const SAMPLE_SHOPPERS = [
  'Aarav Sharma',
  'Diya Patel',
  'Rohan Mehta',
  'Ananya Iyer',
  'Kabir Singh',
  'Meera Nair',
  'Ishaan Gupta',
  'Sara Khan',
];

function buildAddress(random, name) {
  const place = random.pick(CITIES);
  return {
    fullName: name,
    phone: `+91 9${random.int(100000000, 999999999)}`,
    line1: `${random.int(12, 480)}, ${random.pick(['MG Road', 'Park Street', 'Lake View Colony', 'Green Avenue', 'Station Road', 'Temple Street'])}`,
    line2: random.chance(0.5)
      ? `${random.pick(['Near City Mall', 'Opp. Metro Station', 'Block B', '2nd Floor'])}`
      : '',
    ...place,
    country: 'India',
  };
}

/** Status progression for a demo order based on its age. */
function statusFor(random, ageDays) {
  if (random.chance(0.08) && ageDays > 1) return 'CANCELLED';
  if (ageDays >= 8) return 'DELIVERED';
  if (ageDays >= 5) return random.pick(['SHIPPED', 'DELIVERED']);
  if (ageDays >= 2) return random.pick(['PROCESSING', 'SHIPPED']);
  if (ageDays >= 1) return 'PROCESSING';
  return 'PLACED';
}

const FLOW = ['PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

async function seedDemoOrders(random, products, accounts) {
  const shoppers = [];
  for (const name of SAMPLE_SHOPPERS) {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    const user = await ensureUser({
      name,
      email,
      password: crypto.randomBytes(18).toString('base64url'),
    });
    await User.updateOne(
      { _id: user._id },
      { $set: { createdAt: new Date(Date.now() - random.int(15, 60) * DAY) } }
    );
    shoppers.push(user);
  }
  const buyers = accounts.demoCustomer ? [accounts.demoCustomer, ...shoppers] : shoppers;
  const sellable = products.filter((p) => p.stock > 0);

  // Plan orders oldest → newest so invoice numbers increase with time.
  const plans = [];
  for (let ageDays = 27; ageDays >= 0; ageDays -= 1) {
    const perDay = random.int(0, ageDays < 14 ? 3 : 2);
    for (let n = 0; n < perDay; n += 1) plans.push({ ageDays, buyer: random.pick(buyers) });
  }
  if (accounts.demoCustomer) {
    // Guarantee the demo customer a varied order history to explore.
    [18, 9, 4, 2, 0].forEach((ageDays) =>
      plans.push({ ageDays, buyer: accounts.demoCustomer, forced: true })
    );
  }
  plans.sort((a, b) => b.ageDays - a.ageDays);

  const soldCounts = new Map();
  const orders = [];
  for (const plan of plans) {
    const createdAt = new Date(Date.now() - plan.ageDays * DAY - random.int(600, 36_000) * 1000);
    const lines = [];
    const itemCount = random.int(1, 3);
    for (let i = 0; i < itemCount; i += 1) {
      const product = random.pick(sellable);
      if (lines.some((l) => l.product.equals(product._id))) continue;
      const quantity = product.price > 20_000 ? 1 : random.int(1, 2);
      lines.push({ product: product._id, source: product, quantity });
    }
    const items = lines.map(({ source, quantity }) => ({
      product: source._id,
      name: source.name,
      slug: source.slug,
      image: source.image,
      brand: BRAND_NAME.get(String(source.brand)) || '',
      category: CATEGORY_NAME.get(String(source.category)) || '',
      price: source.price,
      mrp: source.mrp,
      quantity,
      lineTotal: round2(source.price * quantity),
    }));
    const totals = calculateTotals(items);

    let status = statusFor(random, plan.ageDays);
    if (plan.forced)
      status = { 18: 'DELIVERED', 9: 'CANCELLED', 4: 'SHIPPED', 2: 'PROCESSING', 0: 'PLACED' }[
        plan.ageDays
      ];

    const method = random.chance(0.55) ? 'ONLINE' : 'COD';
    const history = [];
    let at = createdAt.getTime();
    const target = status === 'CANCELLED' ? random.pick(['PLACED', 'PROCESSING']) : status;
    for (const step of FLOW.slice(0, FLOW.indexOf(target) + 1)) {
      history.push({
        status: step,
        at: new Date(at),
        note: step === 'PLACED' ? 'Order placed by customer' : '',
      });
      at += random.int(8, 40) * 60 * 60 * 1000;
    }
    if (status === 'CANCELLED') {
      history.push({
        status: 'CANCELLED',
        at: new Date(Math.min(at, Date.now())),
        note: 'Cancelled by customer',
      });
    }

    const paid = method === 'ONLINE' || status === 'DELIVERED';
    const payment = {
      method,
      status:
        status === 'CANCELLED' && method === 'ONLINE' ? 'REFUNDED' : paid ? 'PAID' : 'PENDING',
      transactionId: method === 'ONLINE' ? generateTransactionId() : undefined,
      paidAt: paid ? (method === 'ONLINE' ? createdAt : history[history.length - 1].at) : undefined,
    };

    const year = createdAt.getFullYear();
    const seq = await Counter.next(`invoice-${year}`);
    orders.push({
      orderNumber: generateOrderNumber(createdAt),
      invoiceNumber: `INV-${year}-${String(seq).padStart(6, '0')}`,
      user: plan.buyer._id,
      customer: { name: plan.buyer.name, email: plan.buyer.email },
      items,
      shippingAddress: buildAddress(random, plan.buyer.name),
      payment,
      amounts: {
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        tax: totals.tax,
        total: totals.total,
      },
      status,
      statusHistory: history,
      createdAt,
      updatedAt: history[history.length - 1].at,
    });
    if (status !== 'CANCELLED') {
      for (const item of items)
        soldCounts.set(
          String(item.product),
          (soldCounts.get(String(item.product)) || 0) + item.quantity
        );
    }
  }

  if (orders.length) await Order.collection.insertMany(orders);
  if (soldCounts.size) {
    await Product.bulkWrite(
      [...soldCounts].map(([id, count]) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { soldCount: count } },
        },
      }))
    );
  }
  if (accounts.demoCustomer) {
    const last = orders.filter((o) => String(o.user) === String(accounts.demoCustomer._id)).pop();
    if (last)
      await User.updateOne(
        { _id: accounts.demoCustomer._id },
        { $set: { address: last.shippingAddress, phone: last.shippingAddress.phone } }
      );
  }
  return orders.length;
}

// Filled in seedDatabase() once brands/categories exist.
const BRAND_NAME = new Map();
const CATEGORY_NAME = new Map();

async function resetDatabase() {
  await Promise.all(
    [User, Category, Brand, Product, Cart, Order, Review, Counter, Media].map((Model) =>
      Model.deleteMany({})
    )
  );
  await mongoose.connection
    .collection('sessions')
    .deleteMany({})
    .catch(() => {});
}

/**
 * Seeds the demo store. With `reset: true` all data is wiped first.
 * Safe to run repeatedly: accounts and taxonomy are upserted, products and
 * demo orders are only created when the catalogue is empty.
 */
async function seedDatabase({ reset = false, withOrders = config.seed.demoOrders } = {}) {
  await Promise.all(
    [User, Category, Brand, Product, Cart, Order, Review, Counter, Media].map((Model) =>
      Model.init()
    )
  );
  if (reset) await resetDatabase();

  const random = createRandom();
  const hasProducts = (await Product.estimatedDocumentCount()) > 0;
  const accounts = await ensureAccounts();
  if (hasProducts) {
    logger.info('Catalogue already present — accounts ensured, nothing else to seed.');
    return { products: 0, orders: 0 };
  }

  const products = await seedCatalog(random);
  (await Brand.find().lean()).forEach((b) => BRAND_NAME.set(String(b._id), b.name));
  (await Category.find().lean()).forEach((c) => CATEGORY_NAME.set(String(c._id), c.name));

  const orderCount = withOrders ? await seedDemoOrders(random, products, accounts) : 0;
  logger.info(
    `Seeded ${products.length} products, ${CATEGORIES.length} categories, ${BRANDS.length} brands and ${orderCount} demo orders.`
  );
  return { products: products.length, orders: orderCount };
}

async function seedIfEmpty() {
  return seedDatabase({ reset: false });
}

module.exports = { seedDatabase, seedIfEmpty, ensureAccounts, createRandom };
