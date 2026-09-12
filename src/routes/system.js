'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { pingDatabase } = require('../config/db');
const { Media, Product, Category } = require('../models');
const { baseUrl } = require('../utils/urls');
const pkg = require('../../package.json');

const router = express.Router();

/**
 * Liveness/readiness probe for Render and uptime monitors. It also touches
 * the database, which keeps a free MongoDB Atlas cluster from auto-pausing.
 */
router.get('/health', async (_req, res) => {
  const db = await pingDatabase();
  res
    .status(db ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json({
      status: db ? 'ok' : 'degraded',
      database: db ? 'up' : 'down',
      version: pkg.version,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
});

/** Serves product images uploaded through the admin panel. */
router.get('/media/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next();
  const media = await Media.findById(req.params.id).lean();
  if (!media) return next();
  const body = Buffer.from(media.data.buffer || media.data);
  res.set({
    'Content-Type': media.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': 'inline',
  });
  return res.send(body);
});

const STATIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/products', priority: '0.9', changefreq: 'daily' },
  { path: '/login', priority: '0.3', changefreq: 'yearly' },
  { path: '/register', priority: '0.3', changefreq: 'yearly' },
];

const xmlEscape = (value) =>
  String(value).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]
  );

/** XML sitemap of everything a crawler should index. */
router.get('/sitemap.xml', async (req, res) => {
  const base = baseUrl(req);
  const [categories, products] = await Promise.all([
    Category.find().select('slug updatedAt').sort({ name: 1 }).lean(),
    Product.find({ isActive: true })
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .limit(10_000)
      .lean(),
  ]);

  const urls = [
    ...STATIC_PATHS.map((p) => ({ loc: p.path, priority: p.priority, changefreq: p.changefreq })),
    ...categories.map((c) => ({
      loc: `/products?category=${encodeURIComponent(c.slug)}`,
      lastmod: c.updatedAt,
      priority: '0.8',
      changefreq: 'daily',
    })),
    ...products.map((p) => ({
      loc: `/products/${p.slug}`,
      lastmod: p.updatedAt,
      priority: '0.7',
      changefreq: 'weekly',
    })),
  ];

  const body = urls
    .map(({ loc, lastmod, priority, changefreq }) =>
      [
        '  <url>',
        `    <loc>${xmlEscape(base + loc)}</loc>`,
        lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : '',
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');

  res
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
    );
});

/** Served dynamically so the Sitemap line always carries the real host. */
router.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=86400')
    .send(
      [
        'User-agent: *',
        'Disallow: /admin',
        'Disallow: /account',
        'Disallow: /checkout',
        'Disallow: /orders',
        'Disallow: /cart',
        'Disallow: /api/',
        '',
        `Sitemap: ${baseUrl(req)}/sitemap.xml`,
        '',
      ].join('\n')
    );
});

module.exports = router;
