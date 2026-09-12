'use strict';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-123';
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTO_SEED = 'false';
process.env.DEMO_ACCOUNTS = 'true';
process.env.FREE_SHIPPING_THRESHOLD = '999';
process.env.SHIPPING_FEE = '49';
