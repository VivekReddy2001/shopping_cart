'use strict';

const path = require('node:path');
const PDFDocument = require('pdfkit');
const config = require('../config/env');
const { formatPrice } = require('../utils/money');
const { PAYMENT_METHODS, PAYMENT_STATUS_META, statusLabel } = require('../utils/orderStatus');
const { formatDate, formatDateTime } = require('../utils/viewHelpers');

const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
const C = {
  ink: '#111827',
  body: '#374151',
  muted: '#6B7280',
  line: '#E5E7EB',
  brand: '#6D28D9',
  soft: '#F5F3FF',
  accent: '#F59E0B',
};

/** Draws the Kartly mark (same geometry as /img/logo-mark.svg) at 32×32 units. */
function drawMark(doc, x, y, size) {
  const s = size / 32;
  doc.save();
  doc.translate(x, y).scale(s);
  doc.roundedRect(0, 0, 32, 32, 9).fill(C.brand);
  doc
    .path('M9.5 12.5h13l-1.3 10.6a2.2 2.2 0 0 1-2.2 1.9h-6a2.2 2.2 0 0 1-2.2-1.9L9.5 12.5Z')
    .lineWidth(2)
    .lineJoin('round')
    .strokeColor('#FFFFFF')
    .stroke();
  doc
    .path('M12.8 12.5v-1.3a3.2 3.2 0 0 1 6.4 0v1.3')
    .lineCap('round')
    .strokeColor('#FFFFFF')
    .stroke();
  doc
    .path('M13.3 17.6c.9 1.3 1.7 1.8 2.7 1.8s1.8-.5 2.7-1.8')
    .lineCap('round')
    .strokeColor(C.accent)
    .stroke();
  doc.restore();
}

function addressLines(a) {
  return [
    a.fullName,
    a.line1,
    a.line2,
    `${a.city}, ${a.state} ${a.postalCode}`,
    a.country,
    a.phone ? `Phone: ${a.phone}` : '',
  ].filter(Boolean);
}

/**
 * Renders an A4 PDF invoice for an order and pipes it into `stream`
 * (an Express response or any writable stream).
 */
function renderInvoicePdf(order, stream) {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 48, bottom: 64, left: 48, right: 48 },
    info: {
      Title: `Invoice ${order.invoiceNumber}`,
      Author: config.appName,
      Subject: `Order ${order.orderNumber}`,
    },
  });
  doc.registerFont('regular', path.join(FONTS, 'Poppins-Regular.ttf'));
  doc.registerFont('bold', path.join(FONTS, 'Poppins-Bold.ttf'));
  doc.pipe(stream);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 24;

  /* Header ---------------------------------------------------------- */
  drawMark(doc, left, 48, 30);
  doc
    .font('bold')
    .fontSize(20)
    .fillColor(C.ink)
    .text(config.appName, left + 40, 50, { lineBreak: false });
  doc
    .font('regular')
    .fontSize(8.5)
    .fillColor(C.muted)
    .text('Everything you need, one cart away', left + 40, 74);

  doc
    .font('bold')
    .fontSize(18)
    .fillColor(C.ink)
    .text('INVOICE', left, 48, { width, align: 'right' });
  const meta = [
    ['Invoice no.', order.invoiceNumber],
    ['Invoice date', formatDate(order.createdAt)],
    ['Order no.', order.orderNumber],
  ];
  let my = 74;
  for (const [label, value] of meta) {
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(C.muted)
      .text(label, right - 210, my, { width: 90, align: 'right' });
    doc
      .font('bold')
      .fontSize(9)
      .fillColor(C.ink)
      .text(value, right - 115, my, { width: 115, align: 'right' });
    my += 14;
  }

  doc.moveTo(left, 128).lineTo(right, 128).lineWidth(1).strokeColor(C.line).stroke();

  /* Parties ---------------------------------------------------------- */
  const colW = (width - 32) / 3;
  const blocks = [
    [
      'Sold by',
      [
        `${config.appName} (demo store)`,
        'Portfolio project — not a registered business',
        config.store.supportEmail,
      ],
    ],
    ['Bill to', [order.customer.name, order.customer.email]],
    ['Ship to', addressLines(order.shippingAddress)],
  ];
  let blockBottom = 0;
  blocks.forEach(([title, lines], i) => {
    const x = left + i * (colW + 16);
    doc
      .font('bold')
      .fontSize(8)
      .fillColor(C.brand)
      .text(title.toUpperCase(), x, 146, { width: colW, characterSpacing: 0.6 });
    doc.font('regular').fontSize(9.5).fillColor(C.body);
    let y = 162;
    lines.forEach((line, idx) => {
      doc.font(idx === 0 ? 'bold' : 'regular').fillColor(idx === 0 ? C.ink : C.body);
      doc.text(line, x, y, { width: colW });
      y = doc.y + 1;
    });
    blockBottom = Math.max(blockBottom, y);
  });

  /* Items table ------------------------------------------------------ */
  const cols = [
    { label: '#', width: 30, align: 'left' },
    { label: 'Item', width: width - 30 - 40 - 86 - 92, align: 'left' },
    { label: 'Qty', width: 40, align: 'right' },
    { label: 'Unit price', width: 86, align: 'right' },
    { label: 'Amount', width: 92, align: 'right' },
  ];
  const drawHeader = (y) => {
    doc.roundedRect(left, y, width, 24, 4).fill(C.soft);
    let x = left;
    doc.font('bold').fontSize(8.5).fillColor(C.brand);
    cols.forEach((col) => {
      doc.text(col.label.toUpperCase(), x + 8, y + 8, {
        width: col.width - 16,
        align: col.align,
        characterSpacing: 0.4,
      });
      x += col.width;
    });
    return y + 30;
  };

  let y = drawHeader(Math.max(blockBottom + 18, 250));
  order.items.forEach((item, index) => {
    const itemWidth = cols[1].width - 16;
    doc.font('bold').fontSize(9.5);
    const nameH = doc.heightOfString(item.name, { width: itemWidth });
    const sub = [item.brand, item.category].filter(Boolean).join(' · ');
    doc.font('regular').fontSize(8);
    const subH = sub ? doc.heightOfString(sub, { width: itemWidth }) : 0;
    const rowH = Math.max(nameH + subH + 12, 26);

    if (y + rowH > bottomLimit()) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }

    let x = left;
    const cells = [
      String(index + 1),
      null,
      String(item.quantity),
      formatPrice(item.price),
      formatPrice(item.lineTotal),
    ];
    cells.forEach((value, i) => {
      const col = cols[i];
      if (i === 1) {
        doc
          .font('bold')
          .fontSize(9.5)
          .fillColor(C.ink)
          .text(item.name, x + 8, y + 4, { width: itemWidth });
        if (sub)
          doc
            .font('regular')
            .fontSize(8)
            .fillColor(C.muted)
            .text(sub, x + 8, y + 4 + nameH, { width: itemWidth });
      } else {
        doc
          .font(i === 4 ? 'bold' : 'regular')
          .fontSize(9.5)
          .fillColor(i === 0 ? C.muted : C.ink);
        doc.text(value, x + 8, y + 4, { width: col.width - 16, align: col.align });
      }
      x += col.width;
    });
    y += rowH;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(C.line).stroke();
    y += 4;
  });

  /* Totals ----------------------------------------------------------- */
  const a = order.amounts;
  const rows = [
    ['Subtotal', formatPrice(a.subtotal)],
    ['Shipping', a.shipping ? formatPrice(a.shipping) : 'Free'],
    [`Includes GST (${Math.round(config.store.taxRate * 100)}%)`, formatPrice(a.tax)],
  ];
  const totalsHeight = rows.length * 16 + 44;
  if (y + totalsHeight + 90 > bottomLimit()) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y += 10;
  const tx = right - 240;
  rows.forEach(([label, value]) => {
    doc.font('regular').fontSize(9.5).fillColor(C.muted).text(label, tx, y, { width: 140 });
    doc.fillColor(C.ink).text(value, tx + 140, y, { width: 100, align: 'right' });
    y += 16;
  });
  doc.roundedRect(tx - 10, y + 4, 250, 30, 6).fill(C.brand);
  doc
    .font('bold')
    .fontSize(11)
    .fillColor('#FFFFFF')
    .text('Total', tx, y + 12, { width: 120 });
  doc.text(formatPrice(a.total), tx + 90, y + 12, { width: 140, align: 'right' });

  /* Payment ---------------------------------------------------------- */
  const py = y - rows.length * 16;
  const payment = order.payment;
  const payLines = [
    ['Method', PAYMENT_METHODS[payment.method] || payment.method],
    [
      'Status',
      PAYMENT_STATUS_META[payment.status]
        ? PAYMENT_STATUS_META[payment.status].label
        : payment.status,
    ],
    payment.transactionId ? ['Transaction', payment.transactionId] : null,
    payment.paidAt ? ['Paid on', formatDateTime(payment.paidAt)] : null,
    ['Order status', statusLabel(order.status)],
  ].filter(Boolean);
  doc
    .font('bold')
    .fontSize(8)
    .fillColor(C.brand)
    .text('PAYMENT', left, py, { characterSpacing: 0.6 });
  let pyy = py + 14;
  payLines.forEach(([label, value]) => {
    doc.font('regular').fontSize(9).fillColor(C.muted).text(`${label}:`, left, pyy, { width: 70 });
    doc.fillColor(C.ink).text(value, left + 72, pyy, { width: 180 });
    pyy += 13;
  });

  /* Footer on every page --------------------------------------------- */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // allow writing inside the bottom margin without paginating
    const fy = doc.page.height - 44;
    doc
      .moveTo(left, fy - 8)
      .lineTo(right, fy - 8)
      .lineWidth(0.6)
      .strokeColor(C.line)
      .stroke();
    doc.font('regular').fontSize(8).fillColor(C.muted);
    doc.text(
      `Thank you for shopping with ${config.appName}! Computer-generated invoice — no signature required.`,
      left,
      fy,
      { width: width - 70, lineBreak: false, height: 12, ellipsis: true }
    );
    doc.text(`Page ${i + 1} of ${range.count}`, right - 60, fy, {
      width: 60,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return doc;
}

module.exports = { renderInvoicePdf };
