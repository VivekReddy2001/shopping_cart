'use strict';

const path = require('node:path');
const ejs = require('ejs');
const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');
const helpers = require('../utils/viewHelpers');

const VIEWS = path.join(__dirname, '..', 'views', 'emails');
// RFC 2606 reserved domains used by demo/seed accounts — never deliver to them.
const UNDELIVERABLE = /@(example\.(com|org|net)|[^@]+\.(test|invalid|example|localhost))$/i;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = config.mail.host
    ? nodemailer.createTransport({
        host: config.mail.host,
        port: config.mail.port,
        secure: config.mail.secure,
        auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      })
    : // No SMTP configured: build the message but don't send it (development friendly).
      nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

function render(template, data) {
  return ejs.renderFile(path.join(VIEWS, `${template}.ejs`), { ...helpers, ...data });
}

async function send({ to, subject, template, data }) {
  if (config.isTest) return null;
  if (UNDELIVERABLE.test(to)) {
    logger.debug(`Email skipped for reserved address ${to}: ${subject}`);
    return null;
  }
  const html = await render(template, { subject, ...data });
  const info = await getTransporter().sendMail({ from: config.mail.from, to, subject, html });
  if (!config.mail.host) logger.info(`Email not sent (SMTP not configured) → ${to}: "${subject}"`);
  return info;
}

const orderUrl = (order) => `${config.appUrl}/orders/${order.orderNumber}`;

module.exports = {
  sendWelcome(user) {
    return send({
      to: user.email,
      subject: `Welcome to ${config.appName}, ${user.name.split(' ')[0]}!`,
      template: 'welcome',
      data: { user, shopUrl: `${config.appUrl}/products` },
    });
  },

  sendOrderConfirmation(order) {
    return send({
      to: order.customer.email,
      subject: `Order confirmed — ${order.orderNumber}`,
      template: 'order-confirmation',
      data: { order, orderUrl: orderUrl(order) },
    });
  },

  sendOrderStatusUpdate(order) {
    const label = helpers.statusLabel(order.status).toLowerCase();
    return send({
      to: order.customer.email,
      subject: `Your order ${order.orderNumber} is ${label}`,
      template: 'order-status',
      data: { order, orderUrl: orderUrl(order) },
    });
  },
};
