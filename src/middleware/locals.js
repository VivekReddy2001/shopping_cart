'use strict';

const catalogService = require('../services/catalogService');
const cartService = require('../services/cartService');
const { baseUrl } = require('../utils/urls');

/** Per-request template data for server-rendered pages. */
async function pageLocals(req, res, next) {
  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.siteUrl = baseUrl(req);
  // Canonical keeps only `category`, the one query parameter that makes a listing
  // a genuinely different page. Sorting, paging, brand and price permutations all
  // consolidate onto the same URL, and it matches what sitemap.xml advertises.
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const suffix = category ? `?category=${encodeURIComponent(category.toLowerCase())}` : '';
  res.locals.canonicalUrl = `${res.locals.siteUrl}${req.path}${suffix}`;
  res.locals.csrfToken = () => req.csrfToken();
  res.locals.searchQuery = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';

  const [navCategories, cartCount] = await Promise.all([
    catalogService.getNavCategories(),
    cartService.countItems(cartService.ownerFromRequest(req)),
  ]);
  res.locals.navCategories = navCategories;
  res.locals.cartCount = cartCount;
  next();
}

module.exports = { pageLocals };
