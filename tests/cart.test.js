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

describe('Cart API', () => {
  test('guests can build a cart that lives in their session', async () => {
    const a = await agent(app);
    const added = await a.send('post', '/api/v1/cart/items', {
      productId: id('apple-iphone-11'),
      quantity: 2,
    });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({
      itemCount: 2,
      subtotal: 87800,
      shipping: 0,
      total: 87800,
      canCheckout: true,
    });

    const cart = await a.get('/api/v1/cart');
    expect(cart.body.data.items).toHaveLength(1);
    expect(cart.body.data.items[0]).toMatchObject({
      slug: 'apple-iphone-11',
      quantity: 2,
      lineTotal: 87800,
    });

    // A different visitor has their own, empty cart.
    const other = await agent(app);
    expect((await other.get('/api/v1/cart')).body.data.items).toHaveLength(0);
  });

  test('adds shipping below the free-delivery threshold', async () => {
    const a = await agent(app);
    const res = await a.send('post', '/api/v1/cart/items', {
      productId: id('moon-swivel-accent-chair'),
    });
    expect(res.body.data).toMatchObject({
      subtotal: 499,
      shipping: 49,
      total: 548,
      freeShippingRemaining: 500,
    });
  });

  test('never lets the cart exceed available stock', async () => {
    const a = await agent(app);
    const first = await a.send('post', '/api/v1/cart/items', {
      productId: id('samsung-galaxy-f13'),
      quantity: 3,
    });
    expect(first.status).toBe(201);
    expect(first.body.data.items[0].quantity).toBe(1); // only 1 in stock
    const again = await a.send('post', '/api/v1/cart/items', {
      productId: id('samsung-galaxy-f13'),
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('QUANTITY_LIMIT');

    const soldOut = await a.send('post', '/api/v1/cart/items', {
      productId: id('samsung-galaxy-s21-ultra'),
    });
    expect(soldOut.status).toBe(409);
    expect(soldOut.body.error.code).toBe('OUT_OF_STOCK');
  });

  test('updates quantities, removes items and clears the cart', async () => {
    const a = await agent(app);
    await a.send('post', '/api/v1/cart/items', { productId: id('apple-iphone-11') });
    await a.send('post', '/api/v1/cart/items', { productId: id('moon-swivel-accent-chair') });

    const updated = await a.send('patch', `/api/v1/cart/items/${id('moon-swivel-accent-chair')}`, {
      quantity: 4,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.itemCount).toBe(5);

    const tooMany = await a.send('patch', `/api/v1/cart/items/${id('apple-iphone-11')}`, {
      quantity: 11,
    });
    expect(tooMany.status).toBe(409);

    const invalid = await a.send('patch', `/api/v1/cart/items/${id('apple-iphone-11')}`, {
      quantity: 0,
    });
    expect(invalid.status).toBe(422);

    const removed = await a.send('delete', `/api/v1/cart/items/${id('apple-iphone-11')}`);
    expect(removed.body.data.items.map((i) => i.slug)).toEqual(['moon-swivel-accent-chair']);

    expect((await a.send('delete', `/api/v1/cart/items/${id('apple-iphone-11')}`)).status).toBe(
      404
    );
    expect((await a.send('delete', '/api/v1/cart')).status).toBe(204);
    expect((await a.get('/api/v1/cart')).body.data.itemCount).toBe(0);
  });

  test('rejects unknown or invalid product ids', async () => {
    const a = await agent(app);
    expect((await a.send('post', '/api/v1/cart/items', { productId: 'not-an-id' })).status).toBe(
      422
    );
    expect(
      (await a.send('post', '/api/v1/cart/items', { productId: '64b7f0f0f0f0f0f0f0f0f0f0' })).status
    ).toBe(404);
  });

  test('merges the guest cart into the account on sign-in', async () => {
    const user = await createUser({ email: 'shopper@example.com' });
    await models.Cart.create({
      user: user._id,
      items: [{ product: products['apple-iphone-11']._id, quantity: 1 }],
    });

    const a = await agent(app);
    await a.send('post', '/api/v1/cart/items', { productId: id('apple-iphone-11'), quantity: 2 });
    await a.send('post', '/api/v1/cart/items', { productId: id('moon-swivel-accent-chair') });
    await login(a, 'shopper@example.com');

    const cart = await a.get('/api/v1/cart');
    const qty = Object.fromEntries(cart.body.data.items.map((i) => [i.slug, i.quantity]));
    expect(qty).toEqual({ 'apple-iphone-11': 3, 'moon-swivel-accent-chair': 1 });
    expect(await models.Cart.countDocuments({ user: { $exists: false } })).toBe(0);
  });

  test('flags items that went out of stock after being added', async () => {
    const a = await agent(app);
    await a.send('post', '/api/v1/cart/items', { productId: id('apple-iphone-11'), quantity: 3 });
    await models.Product.updateOne(
      { _id: products['apple-iphone-11']._id },
      { $set: { stock: 2 } }
    );
    const cart = await a.get('/api/v1/cart');
    expect(cart.body.data.canCheckout).toBe(false);
    expect(cart.body.data.items[0].inStock).toBe(false);
    expect(cart.body.data.issues[0]).toMatch(/Only 2/);
  });
});
