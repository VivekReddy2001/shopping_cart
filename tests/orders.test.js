'use strict';

const {
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  agent,
  createUser,
  login,
  seedCatalog,
  ADDRESS,
  models,
} = require('./helpers');

let app;
let products;
beforeAll(async () => {
  await startDatabase();
  app = buildApp();
});
afterAll(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  ({ products } = await seedCatalog());
});

const id = (slug) => String(products[slug]._id);
const stockOf = async (slug) => (await models.Product.findById(products[slug]._id).lean()).stock;

async function customer(email = 'buyer@example.com') {
  await createUser({ email, name: 'Buyer One' });
  const a = await agent(app);
  await login(a, email);
  return a;
}

async function placeOrder(a, items, paymentMethod = 'COD') {
  for (const [slug, quantity] of items) {
    const r = await a.send('post', '/api/v1/cart/items', { productId: id(slug), quantity });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  }
  return a.send('post', '/api/v1/orders', { shippingAddress: ADDRESS, paymentMethod });
}

describe('Checkout', () => {
  test('requires sign-in', async () => {
    const a = await agent(app);
    const res = await a.send('post', '/api/v1/orders', {
      shippingAddress: ADDRESS,
      paymentMethod: 'COD',
    });
    expect(res.status).toBe(401);
  });

  test('refuses an empty cart and an invalid address', async () => {
    const a = await customer();
    const empty = await a.send('post', '/api/v1/orders', {
      shippingAddress: ADDRESS,
      paymentMethod: 'COD',
    });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('CART_EMPTY');

    await a.send('post', '/api/v1/cart/items', { productId: id('moon-swivel-accent-chair') });
    const invalid = await a.send('post', '/api/v1/orders', {
      shippingAddress: { ...ADDRESS, phone: 'abc', postalCode: '' },
      paymentMethod: 'CRYPTO',
    });
    expect(invalid.status).toBe(422);
    expect(Object.keys(invalid.body.error.details)).toEqual(
      expect.arrayContaining([
        'shippingAddress.phone',
        'shippingAddress.postalCode',
        'paymentMethod',
      ])
    );
  });

  test('places a COD order: snapshot prices, reserve stock, clear cart', async () => {
    const a = await customer();
    const res = await placeOrder(a, [
      ['moon-swivel-accent-chair', 2],
      ['apple-iphone-11', 1],
    ]);
    expect(res.status).toBe(201);
    const order = res.body.data;
    expect(order.orderNumber).toMatch(/^KRT-\d{6}-[A-Z0-9]{5}$/);
    expect(order.invoiceNumber).toMatch(new RegExp(`^INV-${new Date().getFullYear()}-000001$`));
    expect(order.status).toBe('PLACED');
    expect(order.payment).toMatchObject({ method: 'COD', status: 'PENDING', transactionId: null });
    expect(order.amounts).toMatchObject({ subtotal: 44898, shipping: 0, total: 44898 });
    expect(res.headers.location).toBe(`/api/v1/orders/${order.orderNumber}`);

    expect(await stockOf('moon-swivel-accent-chair')).toBe(23);
    expect(await stockOf('apple-iphone-11')).toBe(9);
    expect((await a.get('/api/v1/cart')).body.data.itemCount).toBe(0);

    const saved = await models.User.findOne({ email: 'buyer@example.com' }).lean();
    expect(saved.address.city).toBe('Bengaluru');

    // Price changes later must not affect the existing order.
    await models.Product.updateOne(
      { _id: products['apple-iphone-11']._id },
      { $set: { price: 1 } }
    );
    const fetched = await a.get(`/api/v1/orders/${order.orderNumber}`);
    expect(fetched.body.data.amounts.total).toBe(44898);
  });

  test('online (demo) payment marks the order as paid', async () => {
    const a = await customer();
    const res = await placeOrder(a, [['moon-swivel-accent-chair', 1]], 'ONLINE');
    expect(res.body.data.payment).toMatchObject({ method: 'ONLINE', status: 'PAID' });
    expect(res.body.data.payment.transactionId).toMatch(/^TXN/);
    expect(res.body.data.amounts).toMatchObject({ subtotal: 499, shipping: 49, total: 548 });
  });

  test('invoice numbers are sequential', async () => {
    const a = await customer();
    const first = await placeOrder(a, [['moon-swivel-accent-chair', 1]]);
    const second = await placeOrder(a, [['moon-swivel-accent-chair', 1]]);
    const n = (o) => Number(o.body.data.invoiceNumber.split('-').pop());
    expect(n(second)).toBe(n(first) + 1);
  });

  test('cannot oversell the last unit when two shoppers check out', async () => {
    const one = await customer('one@example.com');
    const two = await customer('two@example.com');
    await one.send('post', '/api/v1/cart/items', { productId: id('samsung-galaxy-f13') });
    await two.send('post', '/api/v1/cart/items', { productId: id('samsung-galaxy-f13') });

    const [r1, r2] = await Promise.all([
      one.send('post', '/api/v1/orders', { shippingAddress: ADDRESS, paymentMethod: 'COD' }),
      two.send('post', '/api/v1/orders', { shippingAddress: ADDRESS, paymentMethod: 'COD' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await stockOf('samsung-galaxy-f13')).toBe(0);
    expect(await models.Order.countDocuments()).toBe(1);
  });
});

describe('Order history, cancellation and fulfilment', () => {
  test('customers only see their own orders', async () => {
    const a = await customer('owner@example.com');
    const order = (await placeOrder(a, [['moon-swivel-accent-chair', 1]])).body.data;
    const list = await a.get('/api/v1/orders');
    expect(list.body.data.map((o) => o.orderNumber)).toEqual([order.orderNumber]);

    const b = await customer('stranger@example.com');
    expect((await b.get(`/api/v1/orders/${order.orderNumber}`)).status).toBe(404);
    expect((await b.get(`/orders/${order.orderNumber}/invoice.pdf`)).status).toBe(404);
  });

  test('cancelling restocks items and refunds online payments', async () => {
    const a = await customer();
    const order = (await placeOrder(a, [['moon-swivel-accent-chair', 3]], 'ONLINE')).body.data;
    expect(await stockOf('moon-swivel-accent-chair')).toBe(22);

    const cancelled = await a.send('post', `/api/v1/orders/${order.orderNumber}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.payment.status).toBe('REFUNDED');
    expect(await stockOf('moon-swivel-accent-chair')).toBe(25);

    const again = await a.send('post', `/api/v1/orders/${order.orderNumber}/cancel`);
    expect(again.status).toBe(409);
    expect(await stockOf('moon-swivel-accent-chair')).toBe(25);
  });

  test('admins move orders through the lifecycle; invalid jumps are rejected', async () => {
    const a = await customer();
    const order = (await placeOrder(a, [['moon-swivel-accent-chair', 1]])).body.data;

    await createUser({ email: 'admin@example.com', role: 'admin', name: 'Store Admin' });
    const admin = await agent(app);
    await login(admin, 'admin@example.com');
    const move = (status) =>
      admin.send('patch', `/api/v1/admin/orders/${order.orderNumber}/status`, { status });

    expect((await move('DELIVERED')).status).toBe(409);
    expect((await move('PROCESSING')).body.data.status).toBe('PROCESSING');
    expect((await move('SHIPPED')).body.data.status).toBe('SHIPPED');

    const customerCancel = await a.send('post', `/api/v1/orders/${order.orderNumber}/cancel`);
    expect(customerCancel.status).toBe(409);

    const delivered = await move('DELIVERED');
    expect(delivered.body.data.status).toBe('DELIVERED');
    expect(delivered.body.data.payment.status).toBe('PAID'); // COD collected on delivery
    expect(delivered.body.data.statusHistory.map((e) => e.status)).toEqual([
      'PLACED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
    ]);

    const customerAttempt = await a.send(
      'patch',
      `/api/v1/admin/orders/${order.orderNumber}/status`,
      { status: 'CANCELLED' }
    );
    expect(customerAttempt.status).toBe(403);
  });

  test('generates a PDF invoice', async () => {
    const a = await customer();
    const order = (
      await placeOrder(a, [
        ['apple-iphone-11', 1],
        ['moon-swivel-accent-chair', 2],
      ])
    ).body.data;
    const res = await a
      .get(`/orders/${order.orderNumber}/invoice.pdf`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(order.invoiceNumber);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(2000);
  });

  test('verified buyers can review products and ratings are recalculated', async () => {
    const a = await customer();
    const before = await a.send('post', '/api/v1/products/moon-swivel-accent-chair/reviews', {
      rating: 5,
      comment: 'Lovely chair',
    });
    expect(before.status).toBe(403);

    await placeOrder(a, [['moon-swivel-accent-chair', 1]]);
    const review = await a.send('post', '/api/v1/products/moon-swivel-accent-chair/reviews', {
      rating: 4,
      title: 'Comfy',
      comment: 'Very comfortable.',
    });
    expect(review.status).toBe(201);
    await a.send('post', '/api/v1/products/moon-swivel-accent-chair/reviews', {
      rating: 5,
      comment: 'Even better after a week.',
    });

    const list = await a.get('/api/v1/products/moon-swivel-accent-chair/reviews');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ average: 5, count: 1 });
  });
});
