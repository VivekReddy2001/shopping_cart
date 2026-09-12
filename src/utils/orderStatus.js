'use strict';

/**
 * Order lifecycle (finite-state machine).
 *
 *   PLACED ──► PROCESSING ──► SHIPPED ──► DELIVERED
 *     │             │
 *     └────► CANCELLED ◄┘
 */
const ORDER_STATUSES = ['PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const TRANSITIONS = {
  PLACED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const STATUS_META = {
  PLACED: { label: 'Placed', tone: 'info', description: 'We have received your order.' },
  PROCESSING: { label: 'Processing', tone: 'warning', description: 'Your items are being packed.' },
  SHIPPED: { label: 'Shipped', tone: 'primary', description: 'Your order is on its way.' },
  DELIVERED: { label: 'Delivered', tone: 'success', description: 'Your order has been delivered.' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', description: 'This order was cancelled.' },
};

/** The happy path, used to draw the tracking timeline. */
const FULFILMENT_STEPS = ['PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

const PAYMENT_METHODS = {
  COD: 'Cash on Delivery',
  ONLINE: 'Online payment (demo)',
};

const PAYMENT_STATUS_META = {
  PENDING: { label: 'Pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
const isCancellableByCustomer = (status) => status === 'PLACED' || status === 'PROCESSING';
const statusLabel = (status) => STATUS_META[status]?.label || status;
const statusTone = (status) => STATUS_META[status]?.tone || 'neutral';

module.exports = {
  ORDER_STATUSES,
  TRANSITIONS,
  STATUS_META,
  FULFILMENT_STEPS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_META,
  canTransition,
  isCancellableByCustomer,
  statusLabel,
  statusTone,
};
