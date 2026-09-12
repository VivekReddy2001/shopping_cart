'use strict';

const {
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  agent,
  createUser,
  login,
  models,
} = require('./helpers');

let app;
beforeAll(async () => {
  await startDatabase();
  app = buildApp();
});
afterAll(stopDatabase);
beforeEach(clearDatabase);

describe('Authentication API', () => {
  test('rejects state-changing requests without a CSRF token', async () => {
    const a = await agent(app);
    const res = await a.post('/api/v1/auth/register').set('Accept', 'application/json').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  test('validates registration input', async () => {
    const a = await agent(app);
    const res = await a.send('post', '/api/v1/auth/register', {
      name: 'A',
      email: 'not-an-email',
      password: 'short',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['name', 'email', 'password'])
    );
  });

  test('registers, signs in automatically and hashes the password', async () => {
    const a = await agent(app);
    const res = await a.send('post', '/api/v1/auth/register', {
      name: 'Asha Rao',
      email: 'Asha@Example.com',
      password: 'Secret123',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Asha Rao',
      email: 'asha@example.com',
      role: 'customer',
    });

    const me = await a.get('/api/v1/auth/me');
    expect(me.body.data.user.email).toBe('asha@example.com');

    const stored = await models.User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toContain('Secret123');
  });

  test('prevents duplicate accounts', async () => {
    await createUser({ email: 'taken@example.com' });
    const a = await agent(app);
    const res = await a.send('post', '/api/v1/auth/register', {
      name: 'Someone',
      email: 'taken@example.com',
      password: 'Secret123',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.details.email).toBeDefined();
  });

  test('uses one generic message for wrong email or password', async () => {
    await createUser({ email: 'user@example.com' });
    const a = await agent(app);
    const wrongPassword = await a.send('post', '/api/v1/auth/login', {
      email: 'user@example.com',
      password: 'nope-nope1',
    });
    const unknownEmail = await a.send('post', '/api/v1/auth/login', {
      email: 'ghost@example.com',
      password: 'nope-nope1',
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test('blocks NoSQL operator injection in login', async () => {
    await createUser({ email: 'user@example.com' });
    const a = await agent(app);
    const res = await a.send('post', '/api/v1/auth/login', {
      email: { $ne: null },
      password: { $ne: null },
    });
    expect(res.status).toBe(422);
  });

  test('rotates the session on login and ends it on logout', async () => {
    await createUser({ email: 'user@example.com' });
    const a = await agent(app);
    const before = a.csrf;
    await login(a, 'user@example.com');
    expect(a.csrf).not.toBe(before);

    const logout = await a.send('post', '/api/v1/auth/logout');
    expect(logout.status).toBe(204);
    const me = await a.get('/api/v1/auth/me');
    expect(me.body.data.user).toBeNull();
  });

  test('protects customer-only endpoints', async () => {
    const res = await (await agent(app)).get('/api/v1/orders').set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
