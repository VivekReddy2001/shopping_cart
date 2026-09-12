'use strict';

const { Order, Product, User } = require('../models');
const config = require('../config/env');
const { round2 } = require('../utils/money');
const { ORDER_STATUSES } = require('../utils/orderStatus');

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in the store's timezone. */
function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.store.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Rounds an axis maximum up to a clean number (1, 2, 2.5, 5 × 10^n). */
function niceCeil(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const step = [1, 2, 2.5, 5, 10].find((s) => s * base >= value);
  return step * base;
}

async function revenueSeries(days) {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(start.getTime() - DAY_MS) },
        status: { $ne: 'CANCELLED' },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: config.store.timezone,
          },
        },
        revenue: { $sum: '$amounts.total' },
        orders: { $sum: 1 },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(end.getTime() - i * DAY_MS);
    const key = dayKey(date);
    const row = byDay.get(key);
    series.push({
      key,
      date,
      revenue: row ? round2(row.revenue) : 0,
      orders: row ? row.orders : 0,
    });
  }
  return series;
}

/** Geometry for the server-rendered SVG column chart (keeps the page JS-light). */
function buildChart(series, { width = 720, height = 240 } = {}) {
  const pad = { top: 16, right: 12, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceCeil(Math.max(...series.map((s) => s.revenue), 0));
  const band = innerW / series.length;
  const barWidth = Math.min(24, band * 0.6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: max * f,
    y: pad.top + innerH - innerH * f,
  }));
  const peak = series.reduce((best, s) => (s.revenue > best.revenue ? s : best), series[0]);
  const bars = series.map((s, i) => {
    const h = max ? (s.revenue / max) * innerH : 0;
    const x = pad.left + band * i + (band - barWidth) / 2;
    const y = pad.top + innerH - h;
    const r = Math.min(4, h, barWidth / 2);
    // Rounded data-end (top), square at the baseline.
    const path =
      h <= 0
        ? ''
        : `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barWidth - r}Q${x + barWidth},${y} ${x + barWidth},${y + r}V${y + h}Z`;
    return {
      ...s,
      x,
      y,
      h,
      barWidth,
      path,
      cx: x + barWidth / 2,
      hitX: pad.left + band * i,
      hitWidth: band,
      isPeak: s === peak && s.revenue > 0,
      showLabel: i % 2 === (series.length - 1) % 2,
    };
  });
  return { width, height, pad, innerW, innerH, max, ticks, bars, baseline: pad.top + innerH };
}

async function getDashboard() {
  const now = Date.now();
  const since14 = new Date(now - 14 * DAY_MS);
  const since28 = new Date(now - 28 * DAY_MS);
  const notCancelled = { status: { $ne: 'CANCELLED' } };

  const [
    totals,
    current,
    previous,
    statusRows,
    recentOrders,
    lowStock,
    topProducts,
    customerCount,
    newCustomers,
    productCount,
    series,
  ] = await Promise.all([
    Order.aggregate([
      { $match: notCancelled },
      { $group: { _id: null, revenue: { $sum: '$amounts.total' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...notCancelled, createdAt: { $gte: since14 } } },
      { $group: { _id: null, revenue: { $sum: '$amounts.total' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...notCancelled, createdAt: { $gte: since28, $lt: since14 } } },
      { $group: { _id: null, revenue: { $sum: '$amounts.total' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.find().sort({ createdAt: -1 }).limit(6).lean(),
    Product.find({ isActive: true, stock: { $lte: config.store.lowStockThreshold } })
      .sort({ stock: 1, name: 1 })
      .limit(6)
      .select('name slug stock image')
      .lean(),
    Order.aggregate([
      { $match: notCancelled },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          slug: { $first: '$items.slug' },
          image: { $first: '$items.image' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]),
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: 'customer', createdAt: { $gte: since14 } }),
    Product.countDocuments({ isActive: true }),
    revenueSeries(14),
  ]);

  const t = totals[0] || { revenue: 0, orders: 0 };
  const c = current[0] || { revenue: 0, orders: 0 };
  const p = previous[0] || { revenue: 0, orders: 0 };
  const delta = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  for (const row of statusRows) statusCounts[row._id] = row.count;

  return {
    kpis: {
      revenue: round2(t.revenue),
      orders: t.orders,
      averageOrderValue: t.orders ? round2(t.revenue / t.orders) : 0,
      customers: customerCount,
      products: productCount,
      revenue14: round2(c.revenue),
      revenueDelta: delta(c.revenue, p.revenue),
      orders14: c.orders,
      ordersDelta: delta(c.orders, p.orders),
      newCustomers,
    },
    statusCounts,
    recentOrders,
    lowStock,
    topProducts,
    series,
    chart: buildChart(series),
  };
}

async function listCustomers({ page = 1, limit = 20, q = '' } = {}) {
  const filter = {};
  if (q) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('name email role readOnly isDemo createdAt lastLoginAt')
      .lean(),
  ]);
  const stats = await Order.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) }, status: { $ne: 'CANCELLED' } } },
    {
      $group: {
        _id: '$user',
        orders: { $sum: 1 },
        spent: { $sum: '$amounts.total' },
        last: { $max: '$createdAt' },
      },
    },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));
  return {
    items: users.map((u) => {
      const s = byUser.get(String(u._id));
      return {
        ...u,
        orders: s ? s.orders : 0,
        spent: s ? round2(s.spent) : 0,
        lastOrderAt: s ? s.last : null,
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

module.exports = { getDashboard, listCustomers, buildChart, niceCeil };
