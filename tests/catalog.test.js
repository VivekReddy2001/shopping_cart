'use strict';

const request = require('supertest');
const {
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  agent,
  createUser,
  login,
  seedCatalog,
  PNG_BYTES,
  models,
} = require('./helpers');

let app;
let fixtures;
beforeAll(async () => {
  await startDatabase();
  app = buildApp();
});
afterAll(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  fixtures = await seedCatalog();
});

const names = (res) => res.body.data.map((p) => p.slug);

describe('Catalogue API', () => {
  test('lists active products with pagination metadata and facets', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.meta).toMatchObject({ total: 4, page: 1, pages: 1 });
    expect(res.body.meta.facets.categories.find((c) => c.slug === 'mobiles').count).toBe(3);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        price: expect.any(Number),
        inStock: expect.any(Boolean),
      })
    );
  });

  test('filters by category, brand, price and stock', async () => {
    expect(names(await request(app).get('/api/v1/products?category=furniture'))).toEqual([
      'moon-swivel-accent-chair',
    ]);
    expect(names(await request(app).get('/api/v1/products?brand=samsung&sort=price_asc'))).toEqual([
      'samsung-galaxy-f13',
      'samsung-galaxy-s21-ultra',
    ]);
    expect(
      names(await request(app).get('/api/v1/products?brand=apple,kartly-home&sort=price_asc'))
    ).toEqual(['moon-swivel-accent-chair', 'apple-iphone-11']);
    expect(
      names(
        await request(app).get('/api/v1/products?minPrice=10000&maxPrice=50000&sort=price_desc')
      )
    ).toEqual(['apple-iphone-11', 'samsung-galaxy-f13']);
    expect(
      names(await request(app).get('/api/v1/products?category=mobiles&inStock=1&sort=price_asc'))
    ).toEqual(['samsung-galaxy-f13', 'apple-iphone-11']);
  });

  test('unknown category or brand returns an empty list', async () => {
    const res = await request(app).get('/api/v1/products?category=does-not-exist');
    expect(res.body.data).toHaveLength(0);
  });

  test('searches names, tags, brands and categories', async () => {
    expect(names(await request(app).get('/api/v1/products?q=iphone'))).toEqual(['apple-iphone-11']);
    expect(names(await request(app).get('/api/v1/products?q=samsung&sort=price_asc'))).toEqual([
      'samsung-galaxy-f13',
      'samsung-galaxy-s21-ultra',
    ]);
    expect(names(await request(app).get('/api/v1/products?q=chairs'))).toEqual([
      'moon-swivel-accent-chair',
    ]);
  });

  test('understands spoken-style queries with price limits', async () => {
    const res = await request(app).get(
      '/api/v1/products?q=' + encodeURIComponent('show me phones under 20000')
    );
    expect(names(res)).toEqual(['samsung-galaxy-f13']);
    expect(res.body.meta.appliedFilters.maxPrice).toBe(20000);
  });

  test('ignores malformed query parameters instead of failing', async () => {
    const res = await request(app).get(
      '/api/v1/products?page=-3&limit=9999&sort=hack&minPrice=abc'
    );
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
  });

  test('returns product details by slug or id', async () => {
    const bySlug = await request(app).get('/api/v1/products/apple-iphone-11');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data).toMatchObject({
      name: 'Apple iPhone 11 (Black, 64GB)',
      discountPercent: 12,
      brand: { slug: 'apple' },
    });
    const byId = await request(app).get(
      `/api/v1/products/${fixtures.products['apple-iphone-11']._id}`
    );
    expect(byId.body.data.slug).toBe('apple-iphone-11');
    const missing = await request(app).get('/api/v1/products/nope');
    expect(missing.status).toBe(404);
  });

  test('lists categories and brands with counts', async () => {
    const cats = await request(app).get('/api/v1/categories');
    expect(cats.body.data.map((c) => [c.slug, c.productCount])).toEqual([
      ['mobiles', 3],
      ['furniture', 1],
    ]);
    const brands = await request(app).get('/api/v1/brands');
    expect(brands.body.data.find((b) => b.slug === 'samsung').productCount).toBe(2);
  });
});

describe('Admin product management', () => {
  const productFields = () => ({
    name: 'Kartly Test Lamp',
    description: 'A warm lamp for your desk and bedside.',
    category: String(fixtures.categories.furniture._id),
    brand: String(fixtures.brands.kartlyHome._id),
    price: '1499',
    mrp: '1999',
    stock: '12',
    highlights: 'Warm white LED\nTouch dimmer',
  });

  async function multipartCreate(a, fields, file = PNG_BYTES) {
    const req = a
      .post('/api/v1/products')
      .set('X-CSRF-Token', a.csrf)
      .set('Accept', 'application/json');
    Object.entries(fields).forEach(([k, v]) => req.field(k, v));
    if (file) req.attach('image', file, { filename: 'lamp.png', contentType: 'image/png' });
    return req;
  }

  test('requires an admin', async () => {
    const anon = await agent(app);
    expect((await multipartCreate(anon, productFields())).status).toBe(401);

    await createUser({ email: 'customer@example.com' });
    const customer = await agent(app);
    await login(customer, 'customer@example.com');
    expect((await multipartCreate(customer, productFields())).status).toBe(403);
  });

  test('read-only demo admin cannot change data', async () => {
    await createUser({ email: 'viewer@example.com', role: 'admin', readOnly: true });
    const a = await agent(app);
    await login(a, 'viewer@example.com');
    const res = await multipartCreate(a, productFields());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('READ_ONLY_ADMIN');
    expect((await a.get('/api/v1/admin/stats')).status).toBe(200);
  });

  test('creates, updates and archives a product with an uploaded image', async () => {
    await createUser({ email: 'admin@example.com', role: 'admin' });
    const a = await agent(app);
    await login(a, 'admin@example.com');

    const created = await multipartCreate(a, productFields());
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      slug: 'kartly-test-lamp',
      price: 1499,
      mrp: 1999,
      discountPercent: 25,
      highlights: ['Warm white LED', 'Touch dimmer'],
    });

    const image = await request(app).get(created.body.data.image);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');

    const id = created.body.data.id;
    const patched = await a.send('patch', `/api/v1/products/${id}`, { price: 1299, stock: 3 });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ price: 1299, stock: 3, mrp: 1999 });

    const invalid = await a.send('patch', `/api/v1/products/${id}`, { price: 5000, mrp: 4000 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.details.mrp).toBeDefined();

    // Raising the price above the MRP without a new MRP simply removes the discount.
    const raised = await a.send('patch', `/api/v1/products/${id}`, { price: 2500 });
    expect(raised.body.data).toMatchObject({ price: 2500, mrp: 2500, discountPercent: 0 });

    expect((await a.send('delete', `/api/v1/products/${id}`)).status).toBe(204);
    expect((await request(app).get('/api/v1/products/kartly-test-lamp')).status).toBe(404);
    expect(await models.Product.countDocuments({ _id: id, isActive: false })).toBe(1);
  });

  test('rejects missing or disguised images', async () => {
    await createUser({ email: 'admin@example.com', role: 'admin' });
    const a = await agent(app);
    await login(a, 'admin@example.com');
    const noImage = await multipartCreate(a, productFields(), null);
    expect(noImage.status).toBe(422);
    expect(noImage.body.error.details.image).toBeDefined();

    const fake = await multipartCreate(
      a,
      productFields(),
      Buffer.from('<?php system($_GET["c"]); ?> padding')
    );
    expect(fake.status).toBe(422);
  });
});
