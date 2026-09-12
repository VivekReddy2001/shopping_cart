'use strict';

const orderService = require('../../services/orderService');
const adminService = require('../../services/adminService');
const { checkoutSchema, orderStatusSchema, pageQuerySchema } = require('../../validators');
const { parseOrThrow } = require('../../utils/validation');
const serialize = require('../../utils/serializers');
const { ORDER_STATUSES } = require('../../utils/orderStatus');

async function listMine(req, res) {
  const { page } = pageQuerySchema.parse(req.query);
  const result = await orderService.listOrdersForUser(req.user._id, { page });
  res.json({
    data: result.items.map(serialize.order),
    meta: { total: result.total, page: result.page, pages: result.pages },
  });
}

async function create(req, res) {
  const data = parseOrThrow(checkoutSchema, req.body);
  const order = await orderService.placeOrder(req.user, data);
  res
    .status(201)
    .location(`/api/v1/orders/${order.orderNumber}`)
    .json({ data: serialize.order(order.toObject()) });
}

async function getMine(req, res) {
  const order = await orderService.getOrderForUser(req.user._id, req.params.orderNumber);
  res.json({ data: serialize.order(order) });
}

async function cancelMine(req, res) {
  const order = await orderService.cancelByCustomer(req.user._id, req.params.orderNumber);
  res.json({ data: serialize.order(order) });
}

/* Admin */

async function adminList(req, res) {
  const { page, q } = pageQuerySchema.parse(req.query);
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : '';
  const result = await orderService.listAllOrders({ page, q, status });
  res.json({
    data: result.items.map(serialize.order),
    meta: {
      total: result.total,
      page: result.page,
      pages: result.pages,
      statusCounts: result.statusCounts,
    },
  });
}

async function adminUpdateStatus(req, res) {
  const { status, note } = parseOrThrow(orderStatusSchema, req.body);
  const order = await orderService.changeStatus(req.params.orderNumber, status, {
    actorId: req.user._id,
    note,
  });
  res.json({ data: serialize.order(order) });
}

async function adminStats(req, res) {
  const dash = await adminService.getDashboard();
  res.json({
    data: {
      kpis: dash.kpis,
      statusCounts: dash.statusCounts,
      revenueByDay: dash.series.map((s) => ({ date: s.key, revenue: s.revenue, orders: s.orders })),
      topProducts: dash.topProducts.map((p) => ({
        productId: String(p._id),
        name: p.name,
        units: p.units,
        revenue: p.revenue,
      })),
      lowStock: dash.lowStock.map((p) => ({
        productId: String(p._id),
        name: p.name,
        stock: p.stock,
      })),
    },
  });
}

module.exports = {
  listMine,
  create,
  getMine,
  cancelMine,
  adminList,
  adminUpdateStatus,
  adminStats,
};
