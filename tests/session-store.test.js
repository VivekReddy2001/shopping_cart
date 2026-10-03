'use strict';

/**
 * The other suites inject an in-memory session store for speed. This one
 * builds the app exactly as production does, with sessions persisted to
 * MongoDB through connect-mongo, so a breaking change in that integration
 * (for example a changed export) fails the build instead of the deploy.
 */

const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../src/app');
const { startDatabase, stopDatabase, clearDatabase, createUser } = require('./helpers');

beforeAll(startDatabase);
afterAll(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  await mongoose.connection.db.collection('sessions').deleteMany({});
});

test('sessions are persisted in MongoDB and survive across requests', async () => {
  const app = createApp();
  await createUser({ email: 'store@example.com' });

  const agent = request.agent(app);
  const token = (await agent.get('/api/v1/auth/csrf-token')).body.data.csrfToken;
  const login = await agent
    .post('/api/v1/auth/login')
    .set('X-CSRF-Token', token)
    .set('Accept', 'application/json')
    .send({ email: 'store@example.com', password: 'Passw0rd!' });
  expect(login.status).toBe(200);

  const me = await agent.get('/api/v1/auth/me').set('Accept', 'application/json');
  expect(me.status).toBe(200);
  expect(me.body.data.user.email).toBe('store@example.com');

  const stored = await mongoose.connection.db.collection('sessions').countDocuments();
  expect(stored).toBeGreaterThanOrEqual(1);
});
