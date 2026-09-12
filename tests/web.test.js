'use strict';

const request = require('supertest');
const {
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  createUser,
  seedCatalog,
  ADDRESS,
  models,
} = require('./helpers');
const { seedDatabase } = require('../src/seed/seedDatabase');

let app;
beforeAll(async () => {
  await startDatabase();
  app = buildApp();
});
afterAll(stopDatabase);
beforeEach(clearDatabase);

/** Reads the CSRF token from a rendered page, like a real browser form would. */
const csrfFrom = (html) => html.match(/name="csrf-token" content="([^"]+)"/)[1];

describe('Server-rendered pages', () => {
  beforeEach(seedCatalog);

  test('home, catalogue and product pages render', async () => {
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('Everything you need');
    expect(home.text).toContain('Apple iPhone 11');

    const list = await request(app).get('/products?category=mobiles');
    expect(list.status).toBe(200);
    expect(list.text).toContain('Samsung Galaxy F13');
    expect(list.text).not.toContain('Moon Swivel Accent Chair');

    const product = await request(app).get('/products/apple-iphone-11');
    expect(product.status).toBe(200);
    expect(product.text).toContain('₹43,900');
    expect(product.text).toContain('data-add-to-cart');
  });

  test('catalogue returns an HTML fragment for in-page filtering', async () => {
    const res = await request(app).get('/products?q=samsung').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<html');
    expect(res.text).toContain('Samsung Galaxy F13');
  });

  test('unknown pages and products show a friendly 404', async () => {
    const res = await request(app).get('/products/not-a-real-product');
    expect(res.status).toBe(404);
    expect(res.text).toContain('We couldn’t find that page');
    const api = await request(app).get('/api/v1/nothing-here');
    expect(api.status).toBe(404);
    expect(api.body.error.code).toBe('NOT_FOUND');
  });

  test('protected pages redirect guests to sign in', async () => {
    const checkout = await request(app).get('/checkout');
    expect(checkout.status).toBe(302);
    expect(checkout.headers.location).toBe('/login?next=%2Fcheckout');
    expect((await request(app).get('/admin')).status).toBe(302);
    expect((await request(app).get('/orders')).headers.location).toMatch(/^\/login/);
  });

  test('sends strict security headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const cookie = (res.headers['set-cookie'] || []).join(';');
    expect(cookie).toMatch(/kartly\.sid=.*HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test('health check reports database status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('Browser flows with forms', () => {
  beforeEach(seedCatalog);

  test('sign in with the HTML form, check out and see the order page', async () => {
    await createUser({ email: 'form@example.com', name: 'Form User' });
    const browser = request.agent(app);

    const loginPage = await browser.get('/login?next=/checkout');
    const token = csrfFrom(loginPage.text);
    const bad = await browser
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'form@example.com', password: 'wrong-pass1' });
    expect(bad.status).toBe(401);
    expect(bad.text).toContain('Incorrect email or password');

    const ok = await browser
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'form@example.com', password: 'Passw0rd!', next: '/cart' });
    expect(ok.status).toBe(303);
    expect(ok.headers.location).toBe('/cart');

    const cartPage = await browser.get('/cart');
    const fresh = csrfFrom(cartPage.text);
    const chair = await models.Product.findOne({ slug: 'moon-swivel-accent-chair' });
    await browser
      .post('/api/v1/cart/items')
      .set('X-CSRF-Token', fresh)
      .send({ productId: String(chair._id), quantity: 2 });

    const checkout = await browser.get('/checkout');
    expect(checkout.status).toBe(200);
    expect(checkout.text).toContain('Place order');

    const invalid = await browser
      .post('/checkout')
      .type('form')
      .send({ _csrf: fresh, ...ADDRESS, phone: '', paymentMethod: 'COD' });
    expect(invalid.status).toBe(422);
    expect(invalid.text).toContain('Enter a valid phone number');

    const placed = await browser
      .post('/checkout')
      .type('form')
      .send({ _csrf: fresh, ...ADDRESS, paymentMethod: 'COD' });
    expect(placed.status).toBe(303);
    expect(placed.headers.location).toMatch(/^\/orders\/KRT-.+\?placed=1$/);

    const orderPage = await browser.get(placed.headers.location);
    expect(orderPage.status).toBe(200);
    expect(orderPage.text).toContain('Thank you! Your order has been placed.');
    expect(orderPage.text).toContain('Cancel order');

    const printable = await browser.get(placed.headers.location.replace('?placed=1', '/invoice'));
    expect(printable.status).toBe(200);
    expect(printable.text).toContain('INVOICE');
  });

  test('register form validates and creates an account', async () => {
    const browser = request.agent(app);
    const token = csrfFrom((await browser.get('/register')).text);
    const invalid = await browser
      .post('/register')
      .type('form')
      .send({ _csrf: token, name: 'N', email: 'x', password: '123', confirmPassword: '456' });
    expect(invalid.status).toBe(422);
    expect(invalid.text).toContain('Enter a valid email address');

    const created = await browser.post('/register').type('form').send({
      _csrf: token,
      name: 'New Person',
      email: 'new@example.com',
      password: 'Secret123',
      confirmPassword: 'Secret123',
    });
    expect(created.status).toBe(303);
    const account = await browser.get('/account');
    expect(account.text).toContain('New Person');
  });

  test('forms without a CSRF token are rejected', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'a@example.com', password: 'x' });
    expect(res.status).toBe(303); // redirected back with an error message
  });
});

describe('Admin panel', () => {
  test('dashboard, products, orders and customers render for an admin', async () => {
    await seedDatabase({ reset: true });
    const browser = request.agent(app);
    const token = csrfFrom((await browser.get('/login')).text);
    const res = await browser
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'admin@example.com', password: 'Admin@12345' });
    expect(res.headers.location).toBe('/admin');

    const dashboard = await browser.get('/admin');
    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('Revenue — last 14 days');
    expect(dashboard.text).toContain('class="bar"');

    for (const path of [
      '/admin/products',
      '/admin/products/new',
      '/admin/orders',
      '/admin/customers',
      '/admin/catalog',
    ]) {
      const page = await browser.get(path);
      expect(page.status).toBe(200);
    }
    const anyOrder = await models.Order.findOne().lean();
    expect((await browser.get(`/admin/orders/${anyOrder.orderNumber}`)).status).toBe(200);
  });

  test('customers cannot open the admin panel', async () => {
    await createUser({ email: 'c@example.com' });
    const browser = request.agent(app);
    const token = csrfFrom((await browser.get('/login')).text);
    await browser
      .post('/login')
      .type('form')
      .send({ _csrf: token, email: 'c@example.com', password: 'Passw0rd!' });
    const res = await browser.get('/admin');
    expect(res.status).toBe(403);
  });

  test('the seeder builds a complete demo store', async () => {
    const result = await seedDatabase({ reset: true });
    expect(result.products).toBe(93);
    expect(result.orders).toBeGreaterThan(20);
    expect(await models.User.countDocuments({ isDemo: true })).toBe(2);
    const again = await seedDatabase();
    expect(again.products).toBe(0); // idempotent
    const invoiceNumbers = (await models.Order.find().sort({ createdAt: 1 }).lean()).map(
      (o) => o.invoiceNumber
    );
    expect(new Set(invoiceNumbers).size).toBe(invoiceNumbers.length);
  });
});
