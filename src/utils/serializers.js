'use strict';

/** Stable public shapes for REST API responses (never leak internal fields). */

const ref = (doc) => (doc && doc.name ? { name: doc.name, slug: doc.slug } : null);

function product(p, { detail = false } = {}) {
  const out = {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    url: `/products/${p.slug}`,
    image: p.image,
    brand: ref(p.brand),
    category: ref(p.category),
    price: p.price,
    mrp: p.mrp,
    discountPercent: p.discountPercent || 0,
    stock: p.stock,
    inStock: p.stock > 0,
    rating: { average: p.rating ? p.rating.average : 0, count: p.rating ? p.rating.count : 0 },
    featured: Boolean(p.featured),
  };
  if (detail) {
    out.description = p.description;
    out.highlights = p.highlights || [];
    out.tags = p.tags || [];
    out.isActive = p.isActive;
    out.createdAt = p.createdAt;
    out.updatedAt = p.updatedAt;
  }
  return out;
}

function cart(view) {
  return {
    id: view.id,
    items: view.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      slug: l.slug,
      url: `/products/${l.slug}`,
      image: l.image,
      brand: l.brand,
      price: l.price,
      mrp: l.mrp,
      quantity: l.quantity,
      maxQuantity: l.maxQuantity,
      inStock: l.inStock,
      lineTotal: l.lineTotal,
    })),
    itemCount: view.itemCount,
    subtotal: view.subtotal,
    shipping: view.shipping,
    tax: view.tax,
    total: view.total,
    freeShippingRemaining: view.freeShippingRemaining,
    canCheckout: view.canCheckout,
    issues: view.issues,
  };
}

function order(o) {
  return {
    orderNumber: o.orderNumber,
    invoiceNumber: o.invoiceNumber,
    status: o.status,
    statusHistory: (o.statusHistory || []).map((e) => ({
      status: e.status,
      at: e.at,
      note: e.note,
    })),
    items: o.items.map((i) => ({
      productId: String(i.product),
      name: i.name,
      slug: i.slug,
      image: i.image,
      brand: i.brand,
      price: i.price,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    shippingAddress: o.shippingAddress,
    payment: {
      method: o.payment.method,
      status: o.payment.status,
      transactionId: o.payment.transactionId || null,
      paidAt: o.payment.paidAt || null,
    },
    amounts: o.amounts,
    customer: o.customer,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    links: {
      self: `/api/v1/orders/${o.orderNumber}`,
      invoicePdf: `/orders/${o.orderNumber}/invoice.pdf`,
    },
  };
}

function user(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    readOnly: Boolean(u.readOnly),
    isDemo: Boolean(u.isDemo),
  };
}

function review(r) {
  return {
    id: String(r._id),
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    verifiedPurchase: r.verifiedPurchase,
    createdAt: r.createdAt,
  };
}

module.exports = { product, cart, order, user, review };
