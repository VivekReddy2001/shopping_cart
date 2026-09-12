'use strict';

const mongoose = require('mongoose');
const { Product, Category, Brand, Media } = require('../models');
const ApiError = require('../utils/ApiError');
const { escapeRegex, slugify } = require('../utils/strings');
const { detectImageType } = require('../middleware/upload');

/* ───────────────────────── Sorting ───────────────────────── */

const SORTS = {
  relevance: { featured: -1, soldCount: -1, createdAt: -1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  rating: { 'rating.average': -1, 'rating.count': -1, _id: 1 },
  discount: { discountPercent: -1, price: 1, _id: 1 },
};

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest first' },
  { value: 'rating', label: 'Top rated' },
  { value: 'discount', label: 'Biggest discount' },
];

/* ───────────────────── Search (text & voice) ───────────────────── */

const STOP_WORDS = new Set(
  (
    'a an the and or for of in on with to me my i im want need looking look find search show ' +
    'give get buy some any please can you us best good new latest cheap price prices priced ' +
    'rs rupees rupee inr under below less than over above more between from within budget'
  ).split(' ')
);

/** Parses "20k", "20,000", "₹20000" etc. into a number. */
function parseAmount(raw) {
  if (!raw) return undefined;
  const match = String(raw)
    .replace(/[₹,\s]/g, '')
    .match(/^(\d+(?:\.\d+)?)(k|thousand|lakh|lac)?$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = (match[2] || '').toLowerCase();
  const multiplier =
    unit === 'k' || unit === 'thousand' ? 1_000 : unit === 'lakh' || unit === 'lac' ? 100_000 : 1;
  return Math.round(value * multiplier);
}

const AMOUNT = String.raw`₹?\s*(\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|lakh|lac)?)`;

/**
 * Understands natural phrases — typed or spoken via the Web Speech API — e.g.
 * "show me samsung phones under 20k" → terms [samsung, phone], maxPrice 20000.
 */
function parseSearchIntent(input) {
  let text = ` ${String(input || '').toLowerCase()} `;
  const intent = { terms: [], minPrice: undefined, maxPrice: undefined };

  const between = text.match(
    new RegExp(String.raw`\bbetween\s+${AMOUNT}\s+(?:and|to|-)\s+${AMOUNT}`, 'i')
  );
  if (between) {
    intent.minPrice = parseAmount(between[1]);
    intent.maxPrice = parseAmount(between[2]);
    text = text.replace(between[0], ' ');
  }
  const under = text.match(
    new RegExp(String.raw`\b(?:under|below|less than|within|upto|up to|max)\s+${AMOUNT}`, 'i')
  );
  if (under) {
    intent.maxPrice = parseAmount(under[1]);
    text = text.replace(under[0], ' ');
  }
  const over = text.match(
    new RegExp(String.raw`\b(?:over|above|more than|min|from)\s+${AMOUNT}`, 'i')
  );
  if (over) {
    intent.minPrice = parseAmount(over[1]);
    text = text.replace(over[0], ' ');
  }

  intent.terms = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t) && (t.length > 1 || /\d/.test(t)))
    .map((t) => {
      if (t.length > 4 && /(ches|shes|sses|xes|zes)$/.test(t)) return t.slice(0, -2); // watches → watch
      if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1); // phones → phone
      return t;
    })
    .slice(0, 6);

  return intent;
}

/** Each search term must match the name, tags, brand or category (AND across terms). */
async function buildTextClauses(terms) {
  return Promise.all(
    terms.map(async (term) => {
      const rx = new RegExp(`\\b${escapeRegex(term)}`, 'i');
      const [brandIds, categoryIds] = await Promise.all([
        Brand.distinct('_id', { name: rx }),
        Category.distinct('_id', { name: rx }),
      ]);
      return {
        $or: [
          { name: rx },
          { tags: rx },
          { brand: { $in: brandIds } },
          { category: { $in: categoryIds } },
        ],
      };
    })
  );
}

const and = (clauses) => {
  const list = clauses.filter(Boolean);
  if (list.length === 0) return {};
  if (list.length === 1) return list[0];
  return { $and: list };
};

/* ───────────────────────── Caching ───────────────────────── */

let navCache = { at: 0, data: null };
const NAV_TTL_MS = 60_000;

async function getNavCategories() {
  if (navCache.data && Date.now() - navCache.at < NAV_TTL_MS) return navCache.data;
  const data = await Category.find()
    .sort({ sortOrder: 1, name: 1 })
    .select('name slug image')
    .lean();
  navCache = { at: Date.now(), data };
  return data;
}

function invalidateCaches() {
  navCache = { at: 0, data: null };
}

/* ───────────────────────── Listing ───────────────────────── */

/**
 * Catalogue listing with search, category/brand/price/stock filters, sorting,
 * pagination and facet counts for the filter sidebar.
 * `query` is expected to be normalised by validators/catalog.listQuerySchema.
 */
async function listProducts(query, { includeInactive = false } = {}) {
  const intent = query.q ? parseSearchIntent(query.q) : { terms: [] };
  const minPrice = query.minPrice ?? intent.minPrice;
  const maxPrice = query.maxPrice ?? intent.maxPrice;

  const [category, selectedBrands, textClauses] = await Promise.all([
    query.category ? Category.findOne({ slug: query.category }).lean() : null,
    query.brand.length ? Brand.find({ slug: { $in: query.brand } }).lean() : [],
    buildTextClauses(intent.terms),
  ]);

  const base = [];
  if (!includeInactive) base.push({ isActive: true });
  if (minPrice !== undefined || maxPrice !== undefined) {
    const price = {};
    if (minPrice !== undefined) price.$gte = minPrice;
    if (maxPrice !== undefined) price.$lte = maxPrice;
    base.push({ price });
  }
  if (query.inStock) base.push({ stock: { $gt: 0 } });
  base.push(...textClauses);

  let categoryClause = null;
  if (query.category) categoryClause = { category: category ? category._id : null };
  const brandClause = selectedBrands.length
    ? { brand: { $in: selectedBrands.map((b) => b._id) } }
    : query.brand.length
      ? { brand: null }
      : null;

  const filter = and([...base, categoryClause, brandClause]);
  const { page, limit } = query;

  const [total, items, categoryCounts, brandCounts] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(SORTS[query.sort] || SORTS.relevance)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('brand', 'name slug')
      .populate('category', 'name slug')
      .lean(),
    Product.aggregate([
      { $match: and([...base, brandClause]) },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: and([...base, categoryClause]) },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
    ]),
  ]);

  const [allCategories, allBrands] = await Promise.all([
    getNavCategories(),
    Brand.find({ _id: { $in: brandCounts.map((b) => b._id) } })
      .sort({ name: 1 })
      .lean(),
  ]);
  const catCount = new Map(categoryCounts.map((c) => [String(c._id), c.count]));
  const brandCount = new Map(brandCounts.map((b) => [String(b._id), b.count]));
  const selectedSlugs = new Set(query.brand);

  const brandFacets = allBrands.map((b) => ({
    name: b.name,
    slug: b.slug,
    count: brandCount.get(String(b._id)) || 0,
    selected: selectedSlugs.has(b.slug),
  }));
  for (const b of selectedBrands) {
    if (!brandFacets.some((f) => f.slug === b.slug)) {
      brandFacets.push({ name: b.name, slug: b.slug, count: 0, selected: true });
    }
  }

  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    category,
    selectedBrands,
    intent: { ...intent, minPrice, maxPrice },
    facets: {
      categories: allCategories.map((c) => ({
        name: c.name,
        slug: c.slug,
        count: catCount.get(String(c._id)) || 0,
        selected: query.category === c.slug,
      })),
      brands: brandFacets,
    },
  };
}

/* ───────────────────────── Single product ───────────────────────── */

async function getProduct(slugOrId, { includeInactive = false } = {}) {
  const key = String(slugOrId);
  const match =
    mongoose.isValidObjectId(key) && /^[a-f0-9]{24}$/i.test(key)
      ? { _id: key }
      : { slug: key.toLowerCase() };
  if (!includeInactive) match.isActive = true;
  const product = await Product.findOne(match)
    .populate('brand', 'name slug')
    .populate('category', 'name slug')
    .lean();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  return product;
}

async function getRelatedProducts(product, limit = 4) {
  return Product.find({
    isActive: true,
    category: product.category._id || product.category,
    _id: { $ne: product._id },
  })
    .sort({ soldCount: -1, _id: 1 })
    .limit(limit)
    .populate('brand', 'name slug')
    .populate('category', 'name slug')
    .lean();
}

const HERO_SLUGS = [
  'apple-macbook-air-m1',
  'apple-iphone-11',
  'groovy-swivel-lounge-chair',
  'nike-dri-fit-training-tshirt',
];

async function getHomepageData() {
  const populate = (q) => q.populate('brand', 'name slug').populate('category', 'name slug').lean();
  const active = { isActive: true };
  const [heroCandidates, featured, deals, bestSellers, newArrivals, categories, brands] =
    await Promise.all([
      Product.find({ ...active, slug: { $in: HERO_SLUGS } })
        .select('name slug image price')
        .lean(),
      populate(
        Product.find({ ...active, featured: true })
          .sort({ soldCount: -1 })
          .limit(8)
      ),
      populate(
        Product.find({ ...active, stock: { $gt: 0 } })
          .sort(SORTS.discount)
          .limit(8)
      ),
      populate(Product.find(active).sort({ soldCount: -1, _id: 1 }).limit(8)),
      populate(Product.find(active).sort(SORTS.newest).limit(8)),
      getNavCategories(),
      Brand.find().sort({ name: 1 }).lean(),
    ]);
  const hero = HERO_SLUGS.map((slug) => heroCandidates.find((p) => p.slug === slug)).filter(
    Boolean
  );
  for (const p of featured) {
    if (hero.length >= 4) break;
    if (!hero.some((h) => h.slug === p.slug)) hero.push(p);
  }
  return { hero, featured, deals, bestSellers, newArrivals, categories, brands };
}

async function listCategoriesWithCounts() {
  const [categories, counts] = await Promise.all([
    Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({ ...c, productCount: map.get(String(c._id)) || 0 }));
}

async function listBrandsWithCounts() {
  const [brands, counts] = await Promise.all([
    Brand.find().sort({ name: 1 }).lean(),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
    ]),
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  return brands.map((b) => ({ ...b, productCount: map.get(String(b._id)) || 0 }));
}

/* ───────────────────────── Admin: products ───────────────────────── */

async function listAdminProducts({
  q = '',
  category = '',
  status = 'active',
  page = 1,
  limit = 20,
}) {
  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'archived') filter.isActive = false;
  if (status === 'low') {
    filter.isActive = true;
    filter.stock = { $lte: 5 };
  }
  if (q) filter.name = new RegExp(escapeRegex(q.trim()), 'i');
  if (category) {
    const cat = await Category.findOne({ slug: category }).select('_id').lean();
    filter.category = cat ? cat._id : null;
  }
  const [total, items] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ updatedAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('brand', 'name')
      .populate('category', 'name slug')
      .lean(),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

async function ensureUniqueSlug(name, excludeId) {
  const base = slugify(name) || 'product';
  let slug = base;
  for (let i = 2; ; i += 1) {
    const clash = await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
}

async function storeImage(file) {
  const detected = detectImageType(file.buffer);
  if (!detected) {
    throw ApiError.validation({
      image: 'The uploaded file is not a valid JPEG, PNG, WebP or GIF image.',
    });
  }
  const media = await Media.create({
    data: file.buffer,
    contentType: detected,
    size: file.size,
    originalName: String(file.originalname || '').slice(0, 200),
  });
  return media;
}

async function assertReferences({ category, brand }) {
  const [cat, br] = await Promise.all([
    category ? Category.exists({ _id: category }) : true,
    brand ? Brand.exists({ _id: brand }) : true,
  ]);
  const details = {};
  if (!cat) details.category = 'Choose a valid category';
  if (!br) details.brand = 'Choose a valid brand';
  if (Object.keys(details).length) throw ApiError.validation(details);
}

async function createProduct(input, file) {
  await assertReferences(input);
  if (!file) throw ApiError.validation({ image: 'Upload a product image' });
  const media = await storeImage(file);
  try {
    const product = new Product({
      ...input,
      mrp: input.mrp ?? input.price,
      slug: await ensureUniqueSlug(input.name),
      image: `/media/${media._id}`,
      imageMedia: media._id,
    });
    await product.save();
    return product;
  } catch (err) {
    await Media.deleteOne({ _id: media._id });
    throw err;
  }
}

async function updateProduct(id, input, file) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  await assertReferences(input);

  const nextPrice = input.price ?? product.price;
  const nextMrp =
    input.mrp ??
    (input.price !== undefined && product.mrp < input.price ? input.price : product.mrp);
  if (nextMrp < nextPrice) {
    throw ApiError.validation({ mrp: 'MRP must be greater than or equal to the selling price' });
  }

  const nameChanged = input.name && input.name !== product.name;
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) product[key] = value;
  }
  product.mrp = nextMrp;
  if (nameChanged) product.slug = await ensureUniqueSlug(input.name, product._id);

  let oldMedia = null;
  if (file) {
    const media = await storeImage(file);
    oldMedia = product.imageMedia;
    product.image = `/media/${media._id}`;
    product.imageMedia = media._id;
  }
  await product.save();
  if (oldMedia) await Media.deleteOne({ _id: oldMedia });
  return product;
}

async function setProductActive(id, isActive) {
  const product = await Product.findByIdAndUpdate(id, { $set: { isActive } }, { new: true });
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  return product;
}

/* ───────────────────────── Admin: taxonomy ───────────────────────── */

async function createCategory({ name, description = '' }) {
  const category = await Category.create({ name, slug: slugify(name), description });
  invalidateCaches();
  return category;
}

async function createBrand({ name }) {
  const brand = await Brand.create({ name, slug: slugify(name) });
  invalidateCaches();
  return brand;
}

async function getTaxonomy() {
  const [categories, brands] = await Promise.all([
    Category.find().sort({ sortOrder: 1, name: 1 }).select('name slug').lean(),
    Brand.find().sort({ name: 1 }).select('name slug').lean(),
  ]);
  return { categories, brands };
}

module.exports = {
  SORT_OPTIONS,
  parseSearchIntent,
  parseAmount,
  getNavCategories,
  invalidateCaches,
  listProducts,
  getProduct,
  getRelatedProducts,
  getHomepageData,
  listCategoriesWithCounts,
  listBrandsWithCounts,
  listAdminProducts,
  createProduct,
  updateProduct,
  setProductActive,
  createCategory,
  createBrand,
  getTaxonomy,
};
