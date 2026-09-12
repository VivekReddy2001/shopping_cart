'use strict';

const catalogService = require('../../services/catalogService');
const reviewService = require('../../services/reviewService');
const {
  listQuerySchema,
  productSchema,
  productPatchSchema,
  reviewSchema,
} = require('../../validators');
const { parseOrThrow } = require('../../utils/validation');
const serialize = require('../../utils/serializers');

async function listProducts(req, res) {
  const query = listQuerySchema.parse(req.query);
  const result = await catalogService.listProducts(query);
  res.json({
    data: result.items.map((p) => serialize.product(p)),
    meta: {
      total: result.total,
      page: result.page,
      pages: result.pages,
      limit: result.limit,
      appliedFilters: {
        q: query.q || null,
        category: query.category || null,
        brand: query.brand,
        minPrice: result.intent.minPrice ?? null,
        maxPrice: result.intent.maxPrice ?? null,
        inStock: query.inStock,
        sort: query.sort,
      },
      facets: result.facets,
    },
  });
}

async function getProduct(req, res) {
  const product = await catalogService.getProduct(req.params.idOrSlug);
  res.json({ data: serialize.product(product, { detail: true }) });
}

async function listCategories(req, res) {
  const categories = await catalogService.listCategoriesWithCounts();
  res.json({
    data: categories.map((c) => ({
      id: String(c._id),
      name: c.name,
      slug: c.slug,
      productCount: c.productCount,
    })),
  });
}

async function listBrands(req, res) {
  const brands = await catalogService.listBrandsWithCounts();
  res.json({
    data: brands.map((b) => ({
      id: String(b._id),
      name: b.name,
      slug: b.slug,
      productCount: b.productCount,
    })),
  });
}

async function createProduct(req, res) {
  const data = parseOrThrow(productSchema, req.body);
  const product = await catalogService.createProduct(data, req.file);
  const full = await catalogService.getProduct(product._id, { includeInactive: true });
  res
    .status(201)
    .location(`/api/v1/products/${full.slug}`)
    .json({ data: serialize.product(full, { detail: true }) });
}

async function updateProduct(req, res) {
  const data = parseOrThrow(productPatchSchema, req.body);
  const product = await catalogService.updateProduct(req.params.id, data, req.file);
  const full = await catalogService.getProduct(product._id, { includeInactive: true });
  res.json({ data: serialize.product(full, { detail: true }) });
}

async function archiveProduct(req, res) {
  await catalogService.setProductActive(req.params.id, false);
  res.status(204).end();
}

async function listReviews(req, res) {
  const product = await catalogService.getProduct(req.params.idOrSlug);
  const { reviews, distribution } = await reviewService.listForProduct(product._id);
  res.json({
    data: reviews.map(serialize.review),
    meta: { average: product.rating.average, count: product.rating.count, distribution },
  });
}

async function upsertReview(req, res) {
  const product = await catalogService.getProduct(req.params.idOrSlug);
  const data = parseOrThrow(reviewSchema, req.body);
  const review = await reviewService.upsertReview(req.user, product._id, data);
  res.status(201).json({ data: serialize.review(review) });
}

module.exports = {
  listProducts,
  getProduct,
  listCategories,
  listBrands,
  createProduct,
  updateProduct,
  archiveProduct,
  listReviews,
  upsertReview,
};
