'use strict';

/**
 * Public demo accounts (shown on the sign-in page when DEMO_ACCOUNTS=true).
 * They use the reserved example.com domain, so no email is ever delivered.
 * The demo admin is read-only, so visitors can explore the admin panel
 * without being able to change store data.
 */
const DEMO_ACCOUNTS = [
  {
    label: 'Demo customer',
    name: 'Demo Customer',
    email: 'demo@example.com',
    password: 'Demo@1234',
    role: 'customer',
    readOnly: false,
    hint: 'Shop, check out and track orders',
  },
  {
    label: 'Demo admin (read-only)',
    name: 'Demo Admin',
    email: 'demo.admin@example.com',
    password: 'Demo@1234',
    role: 'admin',
    readOnly: true,
    hint: 'Explore the dashboard — changes are disabled',
  },
];

module.exports = { DEMO_ACCOUNTS };
