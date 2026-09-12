'use strict';

const request = require('supertest');
const {
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  seedCatalog,
  models,
} = require('./helpers');

let app;
beforeAll(async () => {
  await startDatabase();
  app = buildApp();
});
afterAll(stopDatabase);
beforeEach(clearDatabase);

/** Reads the session's CSRF token out of a rendered page, like a form would. */
const csrfFrom = (html) => html.match(/name="csrf-token" content="([^"]+)"/)[1];

/** A cookie-keeping agent that only ever posts HTML forms — no JavaScript. */
async function browser() {
  const a = request.agent(app);
  const home = await a.get('/');
  a.csrf = csrfFrom(home.text);
  a.form = (url, body) =>
    a
      .post(url)
      .type('form')
      .send({ _csrf: a.csrf, ...body });
  return a;
}

describe('The store works without JavaScript', () => {
  let catalog;
  beforeEach(async () => {
    catalog = await seedCatalog();
  });

  test('product pages ship a real add-to-cart form, not a JavaScript-only button', async () => {
    const res = await request(app).get('/products/apple-iphone-11');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<form class="purchase" method="post" action="/cart/items"');
    expect(res.text).toContain('name="productId"');
    expect(res.text).toContain('name="quantity"');
    expect(res.text).toContain('name="_csrf"');
  });

  test('a guest can add, change quantity, remove and clear — all by form post', async () => {
    const a = await browser();
    const id = String(catalog.products['apple-iphone-11']._id);

    const added = await a.form('/cart/items', { productId: id, quantity: 2 });
    expect(added.status).toBe(303);
    expect(added.headers.location).toBe('/cart'); // no `next`, no referer

    // The hidden `next` field returns the shopper to the page they were on.
    const fromListing = await a.form('/cart/items', {
      productId: id,
      quantity: 1,
      next: '/products?category=mobiles',
    });
    expect(fromListing.headers.location).toBe('/products?category=mobiles');

    // ...but only to a same-site path.
    const offSite = await a.form('/cart/items', {
      productId: id,
      quantity: 1,
      next: 'https://evil.example/steal',
    });
    expect(offSite.headers.location).toBe('/cart');

    let cart = await a.get('/cart');
    expect(cart.text).toContain('Apple iPhone 11');
    expect(cart.text).toContain('value="4"'); // 2 + 1 + 1

    // The "+" button posts delta alongside the current quantity.
    const stepped = await a.form(`/cart/items/${id}`, { quantity: 4, delta: 1 });
    expect(stepped.status).toBe(303);
    cart = await a.get('/cart');
    expect(cart.text).toContain('value="5"');

    // The "Update" button posts the typed quantity on its own.
    await a.form(`/cart/items/${id}`, { quantity: 3, update: '1' });
    cart = await a.get('/cart');
    expect(cart.text).toContain('value="3"');

    await a.form(`/cart/items/${id}`, { quantity: 3, remove: '1' });
    cart = await a.get('/cart');
    expect(cart.text).toContain('Your cart is empty');

    await a.form('/cart/items', { productId: id, quantity: 1 });
    const cleared = await a.form('/cart/clear', {});
    expect(cleared.status).toBe(303);
    cart = await a.get('/cart');
    expect(cart.text).toContain('Your cart is empty');
  });

  test('"Buy now" sends a guest to sign in and keeps the cart', async () => {
    const a = await browser();
    const id = String(catalog.products['moon-swivel-accent-chair']._id);

    const res = await a.form('/cart/items', { productId: id, quantity: 1, buyNow: '1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/checkout');

    const checkout = await a.get('/checkout');
    expect(checkout.status).toBe(302);
    expect(checkout.headers.location).toBe('/login?next=%2Fcheckout');

    const cart = await a.get('/cart');
    expect(cart.text).toContain('Moon Swivel Accent Chair');
  });

  test('a rejected change flashes a message instead of an error page', async () => {
    const a = await browser();
    const id = String(catalog.products['samsung-galaxy-f13']._id); // stock: 1

    const res = await a.form('/cart/items', { productId: id, quantity: 9 });
    expect(res.status).toBe(303);

    const cart = await a.get('/cart');
    // Capped at the single unit in stock rather than failing.
    expect(cart.text).toContain('Samsung Galaxy F13');

    const tooMany = await a.form(`/cart/items/${id}`, { quantity: 4, update: '1' });
    expect(tooMany.status).toBe(303);
    const after = await a.get('/cart');
    expect(after.text).toContain('Only 1 of Samsung Galaxy F13');
    expect(after.text).toContain('left in stock');
  });

  test('forms without a CSRF token are rejected', async () => {
    const a = await browser();
    const id = String(catalog.products['apple-iphone-11']._id);
    const res = await a.post('/cart/items').type('form').send({ productId: id });
    expect(res.status).toBe(303); // redirected back with a flash, not a hard error
    const cart = await a.get('/cart');
    expect(cart.text).toContain('Your cart is empty');
  });
});

describe('Crawlable metadata', () => {
  beforeEach(seedCatalog);

  test('sitemap.xml lists pages, categories and in-stock products', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<urlset');
    expect(res.text).toContain('/products/apple-iphone-11</loc>');
    expect(res.text).toContain('/products?category=mobiles</loc>');
    expect(res.text).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  test('archived products drop out of the sitemap', async () => {
    await models.Product.updateOne({ slug: 'apple-iphone-11' }, { $set: { isActive: false } });
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).not.toContain('/products/apple-iphone-11</loc>');
  });

  test('robots.txt points at the sitemap on the requesting host', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Disallow: /admin');
    expect(res.text).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test('category listings canonicalise to themselves, other filters consolidate', async () => {
    const cat = await request(app).get('/products?category=mobiles&sort=price_asc&page=2');
    expect(cat.text).toMatch(
      /<link rel="canonical" href="https?:\/\/[^"]+\/products\?category=mobiles">/
    );

    const filtered = await request(app).get('/products?sort=discount&page=3');
    expect(filtered.text).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/products">/);
  });

  test('pages carry canonical, Open Graph and Twitter card metadata', async () => {
    const res = await request(app).get('/products/apple-iphone-11');
    expect(res.text).toMatch(
      /<link rel="canonical" href="https?:\/\/[^"]+\/products\/apple-iphone-11">/
    );
    expect(res.text).toContain('property="og:image"');
    expect(res.text).toContain('/img/og-cover.png');
    expect(res.text).toContain('name="twitter:card"');
  });
});
