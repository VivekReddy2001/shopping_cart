<div align="center">

<img src="public/img/logo.svg" alt="Kartly" width="220">

### A full-stack e-commerce shopping cart built with Node.js, Express, MongoDB and EJS

Product catalogue with faceted filters and **voice search**, guest carts, secure checkout,
stock-safe orders, **PDF invoices**, order tracking and a complete **admin dashboard** —
server-rendered, covered by automated tests and deployable for free.

[![CI](https://github.com/VivekReddy2001/shopping_cart/actions/workflows/ci.yml/badge.svg)](https://github.com/VivekReddy2001/shopping_cart/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20%20%7C%2022-3C873A?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-6D28D9.svg)](LICENSE)

[Features](#features) · [How it works](#how-it-works) · [REST API](#rest-api) · [Getting started](#getting-started) · [Deployment](#deployment)

</div>

---

## Table of contents

- [Overview](#overview)
- [Demo accounts](#demo-accounts)
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Design documents](#design-documents)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [How it works](#how-it-works)
  - [Catalogue, filters and search](#1-catalogue-filters-and-search)
  - [Voice search](#2-voice-search-web-speech-api)
  - [Cart and guest carts](#3-cart-and-guest-carts)
  - [Checkout and stock reservation](#4-checkout-and-stock-reservation)
  - [Order lifecycle and tracking](#5-order-lifecycle-and-tracking)
  - [Invoices](#6-invoices-html--pdf)
  - [Authentication, sessions and roles](#7-authentication-sessions-and-roles)
  - [Admin dashboard](#8-admin-dashboard)
  - [Transactional email](#9-transactional-email)
  - [Front-end approach](#10-front-end-approach)
- [Security](#security)
- [REST API](#rest-api)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Credits and disclaimer](#credits-and-disclaimer)
- [Author](#author)

---

> **Live demo:** not deployed yet — [Deployment](#deployment) sets one up on Render + MongoDB Atlas
> for free in about 15 minutes. Replace this line with your URL once it is live.

## Overview

**Kartly** is a production-style online store. A shopper can browse 93 products across 10
departments, narrow them down with category, brand and price filters, search by typing **or by
voice**, add items to a cart that survives sign-in, check out with Cash on Delivery or a simulated
online payment, track the order through its lifecycle and download a GST-style PDF invoice.
A store administrator gets a separate panel with sales analytics, product management (including
image uploads), order fulfilment and customer insights.

The project is deliberately built as a **server-rendered monolith with a versioned REST API**:

- pages are rendered by Express + EJS, so they load fast and work without JavaScript;
- every state change (cart, checkout, reviews, order status) goes through the same JSON API that an
  external client could use, which keeps business rules in one place;
- business logic lives in a **service layer** that is unit- and integration-tested.

Everything runs with **one command and no database installation** — see [Getting started](#getting-started).

## Demo accounts

| Role              | Email                    | Password    | What you can do                                |
| ----------------- | ------------------------ | ----------- | ---------------------------------------------- |
| Customer          | `demo@example.com`       | `Demo@1234` | Shop, check out, track orders, review products |
| Admin (read-only) | `demo.admin@example.com` | `Demo@1234` | Explore the admin panel; changes are blocked   |

> The sign-in page has one-click buttons for both. The read-only admin exists so the public demo can
> be explored safely — any write request from it is rejected with `403 READ_ONLY_ADMIN`.
> The real admin account is created from the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables.

## Screenshots

| Storefront                              | Product page                                  |
| --------------------------------------- | --------------------------------------------- |
| ![Home page](docs/screenshots/home.png) | ![Product page](docs/screenshots/product.png) |

| Catalogue with live filters                 | Cart                               |
| ------------------------------------------- | ---------------------------------- |
| ![Catalogue](docs/screenshots/products.png) | ![Cart](docs/screenshots/cart.png) |

| Checkout                                   | Order tracking                                |
| ------------------------------------------ | --------------------------------------------- |
| ![Checkout](docs/screenshots/checkout.png) | ![Order tracking](docs/screenshots/order.png) |

| Admin dashboard                                          | Admin orders                                       |
| -------------------------------------------------------- | -------------------------------------------------- |
| ![Admin dashboard](docs/screenshots/admin-dashboard.png) | ![Admin orders](docs/screenshots/admin-orders.png) |

| Generated PDF invoice                            | Printable invoice                                  |
| ------------------------------------------------ | -------------------------------------------------- |
| ![PDF invoice](docs/screenshots/invoice-pdf.png) | ![Printable invoice](docs/screenshots/invoice.png) |

| Mobile storefront                                                     | Mobile catalogue                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| <img src="docs/screenshots/mobile.png" alt="Mobile home" width="300"> | <img src="docs/screenshots/mobile-products.png" alt="Mobile catalogue" width="300"> |

## Features

### Storefront

- **Catalogue** — ~90 seeded products in 10 categories with 19 brands, discounts, ratings and stock levels.
- **Faceted filtering** — category, multi-select brand, price range and in-stock filters, each showing
  live result counts; six sort orders (recommended, price, newest, rating, biggest discount).
- **Search that understands phrases** — multi-word queries match product names, tags, brands and
  categories, and price phrases such as _"under 20k"_ or _"between 40000 and 60000"_ become real filters.
- **Voice search** — the microphone in the header uses the Web Speech API; the transcript is searched
  with the same intent parser, so _"show me Samsung phones under 20000"_ just works.
- **Instant catalogue updates** — filters, sorting and pagination swap in a server-rendered fragment
  and update the URL via the History API (and fall back to plain form submits without JavaScript).
- **Cart** — add from anywhere, quantity stepper with stock limits, live totals, free-delivery progress,
  and a **guest cart** that merges into the account on sign-in.
- **Works without JavaScript** — every interactive control is a real HTML form first. With scripting on,
  the same markup is intercepted and driven through the JSON API without a page reload; with scripting
  off, browsing, searching, filtering, the cart and checkout all still work.
- **Checkout** — address form with validation and saved-address prefill, Cash on Delivery or simulated
  online payment, totals recomputed server-side from the database.
- **Orders** — history, a status timeline (Placed → Processing → Shipped → Delivered), self-service
  cancellation before dispatch, printable invoice and PDF download.
- **Reviews** — verified buyers only; ratings roll up into the product's average and distribution.
- **Accounts** — registration, sign-in, profile, saved address, password change.

### Admin panel

- **Dashboard** — revenue and order KPIs with 14-day trend deltas, a 14-day revenue column chart
  (with hover details and a table view), orders by status, low-stock alerts, top products, recent orders.
- **Products** — searchable, filterable table; create/edit with image upload (stored in MongoDB), MRP and
  discount handling, featured flag, archive/restore (never a destructive delete, so order history stays intact).
- **Orders** — filter by status, search by order number/customer, inline status updates and a detail view
  with the full audit trail; cancelling restocks items and refunds simulated payments.
- **Categories & brands** — add taxonomy entries used by navigation, filters and search.
- **Customers** — accounts with order counts, lifetime spend and last order date.

### Engineering

- Layered architecture (routes → controllers → services → models) with a shared service layer for web and API.
- Versioned REST API (`/api/v1`) with a consistent envelope, correct status codes and machine-readable error codes.
- **Zero-config development**: no `MONGODB_URI`? An in-memory MongoDB starts automatically and seeds itself.
- Seed script with a deterministic PRNG, so the demo store (products, customers, ~40 orders) is reproducible.
- **77 automated tests** (Jest + Supertest + in-memory MongoDB) covering auth, catalogue, cart, checkout
  concurrency, order transitions, PDF invoices, security headers, no-JavaScript form flows and rendered
  pages — plus a clean `npm audit`.
- GitHub Actions CI on Node 20 and 22, ESLint + Prettier, Dockerfile and docker-compose, Render blueprint.
- Strict Content-Security-Policy with **no inline scripts or styles**, self-hosted subset fonts and an SVG icon sprite.
- SEO basics done properly: canonical URLs, Open Graph and Twitter card metadata, a generated
  `/sitemap.xml` covering every category and in-stock product, and a `robots.txt` that points at it.
- [HLD and LLD design documents](docs/ARCHITECTURE.md) with 16 diagrams, and an
  [OpenAPI 3 specification](docs/openapi.yaml) for the REST API.

## Tech stack

| Layer      | Choice                                                      | Why                                                                                |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Runtime    | **Node.js 20/22**                                           | LTS, matches free hosting tiers                                                    |
| Framework  | **Express 5**                                               | Native async error handling, minimal surface                                       |
| Database   | **MongoDB + Mongoose 8**                                    | Flexible product documents, free Atlas tier, first-class aggregation for analytics |
| Views      | **EJS + express-ejs-layouts**                               | Server-rendered HTML, fast first paint, SEO-friendly                               |
| Sessions   | **express-session + connect-mongo**                         | Sessions stored in MongoDB, so any instance can serve any request                  |
| Auth       | **bcryptjs**                                                | Pure-JS hashing, no native build step on free hosts                                |
| Validation | **zod**                                                     | One schema per input, reused by the API and the HTML forms                         |
| Uploads    | **multer** + GridFS-free `Media` collection                 | Free hosts have ephemeral disks — images live in the database                      |
| PDF        | **PDFKit**                                                  | Invoice generation with an embedded ₹-capable font                                 |
| Email      | **nodemailer**                                              | SMTP when configured, console preview otherwise                                    |
| Security   | **helmet**, **express-rate-limit**, custom CSRF + sanitiser | Defence in depth                                                                   |
| Tests      | **Jest**, **Supertest**, **mongodb-memory-server**          | Real HTTP + real database behaviour, no mocks                                      |

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        P["EJS pages<br/>(server-rendered)"]
        J["Vanilla JS<br/>fetch + Web Speech API"]
    end

    subgraph Express["Express 5 application"]
        MW["Middleware chain<br/>helmet → static → body parse →<br/>sanitise → session → flash →<br/>CSRF → attachUser"]
        WR["Web routes<br/>(HTML)"]
        AR["REST API<br/>/api/v1 (JSON)"]
        CT["Controllers"]
        SV["Services<br/>catalog · cart · order · auth ·<br/>review · admin · mail · invoice"]
    end

    DB[("MongoDB<br/>products · carts · orders ·<br/>users · reviews · media · sessions")]
    SMTP["SMTP<br/>(optional)"]

    P --> MW
    J --> MW
    MW --> WR --> CT
    MW --> AR --> CT
    CT --> SV
    SV --> DB
    SV --> SMTP
```

**Request lifecycle** (e.g. _add to cart_):

1. `helmet` sets security headers; static assets are served before sessions, so uptime monitors and
   image requests never create session documents.
2. `express.json` / `urlencoded` parse the body, then a **sanitiser** strips `$`-prefixed and dotted keys
   (NoSQL-injection protection) and prototype-pollution keys.
3. `express-session` loads the session from MongoDB; `flash` exposes one-shot messages.
4. **CSRF**: any non-GET request must carry the session's token in `X-CSRF-Token`, a `_csrf` field, or —
   for multipart uploads — the query string.
5. `attachUser` loads the signed-in user (roles are read fresh on every request).
6. The route hands over to a controller, which validates input with a **zod** schema and calls a **service**.
7. The service is the only place that touches Mongoose models, so the same rules apply to the website and the API.
8. Errors are thrown as `ApiError`s and turned into a JSON envelope (API) or a rendered error page (website)
   by one error handler.

## Design documents

The diagram above is the 10,000-foot view. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the full
engineering write-up — **high-level design** (system context, containers, layering, deployment,
the decisions and their alternatives) and **low-level design** (the middleware pipeline, module map,
class diagram, sequence diagrams for search, cart merge, checkout, invoicing and uploads, the order
state machine, the concurrency matrix, the index list and every security control mapped to its file).

| Document                                       | What is in it                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | HLD + LLD, 16 diagrams, design decisions, failure modes, scaling path                         |
| [`docs/openapi.yaml`](docs/openapi.yaml)       | OpenAPI 3 specification of `/api/v1` — paste it into Swagger Editor or import it into Postman |
| [`SECURITY.md`](SECURITY.md)                   | The security model, what is deliberately simulated, how to report a problem                   |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)           | Local setup, the conventions that keep the layering honest, the pre-PR checklist              |

A taste of what is in there — the checkout path, where correctness actually matters:

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant OS as orderService
    participant P as products
    participant O as orders

    C->>OS: POST /checkout
    loop for each cart line
        OS->>P: updateOne({_id, stock:{$gte:qty}}, {$inc:{stock:-qty}})
        Note over P: atomic compare-and-decrement —<br/>two shoppers, one last unit, one winner
        alt no document matched
            OS->>P: restock everything reserved so far
            OS-->>C: 409 OUT_OF_STOCK
        end
    end
    OS->>O: create order with snapshotted prices
    OS-->>C: 303 /orders/KRT-260911-7Q4ZK
```

## Project structure

```
shopping_cart/
├── server.js                  # Entry point: connect DB → seed if empty → listen → graceful shutdown
├── src/
│   ├── app.js                 # Express app factory (middleware chain, routes) — used by tests too
│   ├── config/
│   │   ├── env.js             # Validated configuration from environment variables
│   │   └── db.js              # Mongoose connection (+ automatic in-memory MongoDB in development)
│   ├── models/                # Mongoose schemas: User, Product, Category, Brand, Cart, Order,
│   │                          # Review, Counter (invoice numbers), Media (uploaded images)
│   ├── middleware/            # auth, csrf, sanitize, flash, locals, rateLimit, upload, error
│   ├── services/              # Business logic: catalog, cart, order, auth, review, admin, mail, invoice
│   ├── controllers/
│   │   ├── web/               # Page controllers (render EJS)
│   │   ├── admin/             # Admin panel controllers
│   │   └── api/               # REST controllers (return JSON)
│   ├── routes/                # web/, api/, system (health + media)
│   ├── validators/            # zod schemas shared by API and forms
│   ├── views/                 # layouts, partials, pages, admin, emails
│   ├── seed/                  # Demo catalogue, accounts and order generator
│   ├── utils/                 # money, strings, orderStatus (state machine), viewHelpers, serializers
│   └── assets/fonts/          # Poppins subset embedded in PDF invoices
├── public/                    # css, js, images/products, fonts, icon sprite, OG cover
├── scripts/seed.js            # `npm run seed` / `npm run seed:reset`
├── tests/                     # Jest + Supertest suites
├── docs/
│   ├── ARCHITECTURE.md        # HLD + LLD: context, containers, sequences, state machine, decisions
│   ├── openapi.yaml           # OpenAPI 3 specification of /api/v1
│   └── screenshots/
├── Dockerfile · docker-compose.yml · render.yaml · .github/workflows/ci.yml
└── .env.example
```

## Data model

```mermaid
erDiagram
    USER ||--o| CART : "has one"
    USER ||--o{ ORDER : places
    USER ||--o{ REVIEW : writes
    CATEGORY ||--o{ PRODUCT : groups
    BRAND ||--o{ PRODUCT : makes
    PRODUCT ||--o{ CART_ITEM : "added as"
    PRODUCT ||--o{ ORDER_ITEM : "snapshotted as"
    PRODUCT ||--o{ REVIEW : receives
    PRODUCT }o--o| MEDIA : "uploaded image"
    CART ||--o{ CART_ITEM : contains
    ORDER ||--o{ ORDER_ITEM : contains
    ORDER ||--o{ STATUS_EVENT : "audit trail"

    USER {
        string name
        string email UK
        string passwordHash "bcrypt, never selected by default"
        enum   role "customer | admin"
        bool   readOnly "demo admin"
        object address "last used shipping address"
    }
    PRODUCT {
        string name
        string slug UK
        number price
        number mrp
        number discountPercent "derived"
        int    stock
        int    soldCount
        object rating "average + count"
        bool   isActive "archive instead of delete"
        array  tags "search keywords"
    }
    CART {
        objectId user "absent for guest carts"
        date     expiresAt "TTL index — guest carts only"
    }
    ORDER {
        string orderNumber UK "KRT-260911-7Q4ZK"
        string invoiceNumber UK "INV-2026-000042"
        object amounts "subtotal, shipping, tax, total"
        object payment "method, status, transactionId"
        enum   status "PLACED…DELIVERED | CANCELLED"
    }
    ORDER_ITEM {
        string name "copied at purchase time"
        number price "price when ordered"
        int    quantity
        number lineTotal
    }
```

Two decisions worth calling out:

- **Order items are snapshots.** Name, image, brand, price and line total are copied into the order, so
  editing or archiving a product later never rewrites history. (A test asserts this.)
- **Products are archived, not deleted.** `isActive: false` hides a product from the store while keeping
  every past order, review and analytics row valid.

## How it works

### 1. Catalogue, filters and search

`GET /products` and `GET /api/v1/products` share one service function, `catalogService.listProducts()`:

1. The query string is normalised by a zod schema that **never throws** — a nonsense `?sort=hack&page=-3`
   falls back to defaults instead of returning an error page.
2. The free-text query is run through `parseSearchIntent()` (below), which returns search terms plus any
   price bounds it recognised.
3. Each term becomes a case-insensitive, word-boundary regex that must match **the product name, its tags,
   its brand name or its category name**. Terms are combined with `$and`, so _"samsung tab"_ only matches
   products that satisfy both.
4. Filters (category, brands, price range, in-stock) are added, then three queries run in parallel:
   the page of products, plus two aggregations that produce **facet counts** for the sidebar.
5. Sorting always ends with `_id` as a tie-breaker, so pagination can't show the same product twice.

```js
// "show me samsung phones under 20k"
parseSearchIntent(q);
// → { terms: ['samsung', 'phone'], minPrice: undefined, maxPrice: 20000 }
```

The intent parser removes filler words ("show me", "best", "please"), understands `20k`, `20,000`,
`1.5 lakh` and `₹20000`, handles _under / below / over / above / between … and …_, and singularises
plurals (`phones → phone`, `watches → watch`) so the regex still matches.

### 2. Voice search (Web Speech API)

The microphone button is wired to `SpeechRecognition` (with the `webkit` prefix fallback):

```js
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'en-IN';
recognition.interimResults = true;      // live transcript in the search box
recognition.onresult = …                // fills the input as you speak
recognition.onend   = …                 // submits the form with the final transcript
```

Interim results stream into the input so you can see what was heard; when recognition ends the form is
submitted and the transcript goes through the same intent parser as typed search. The button shows a
recording state, unsupported browsers get a clear message instead of a dead button, and a denied
microphone permission is explained rather than silently ignored. The page also sends
`Permissions-Policy: microphone=(self)`.

### 3. Cart and guest carts

- A visitor who is **not signed in** gets a `Cart` document with no `user` field, referenced by id from
  their session and given an `expiresAt` date — a **TTL index** cleans abandoned guest carts up after 7 days.
- On sign-in or registration the guest cart is **merged** into the account cart (quantities added, capped at
  the per-item limit) and the guest document is deleted.
- The cart page never trusts stored prices: `buildView()` re-reads live prices and stock, drops products that
  were archived, flags lines that exceed stock, and blocks checkout until they are fixed.
- Quantities are capped by both available stock and `MAX_QTY_PER_ITEM` (default 10) on every add and update.

### 4. Checkout and stock reservation

The riskiest part of any shop is two people buying the last unit at the same time. `orderService.placeOrder()`
reserves stock with a **conditional atomic update** per item:

```js
const result = await Product.updateOne(
  { _id: product._id, isActive: true, stock: { $gte: quantity } }, // ← precondition
  { $inc: { stock: -quantity, soldCount: quantity } } // ← atomic in MongoDB
);
if (result.modifiedCount !== 1) throw ApiError.conflict('… just sold out');
```

Because the filter and the update are evaluated together by MongoDB, stock can never go negative. If a later
item in the same order fails (or writing the order fails), every reservation made so far is **rolled back**.
A test places two concurrent orders for the last unit and asserts one `201`, one `409`, `stock === 0` and
exactly one order in the database.

Totals are always recalculated on the server from database prices — the client only sends the address and
payment method. Prices are GST-inclusive (standard Indian retail), so the invoice reports the tax _contained_
in the total rather than adding to it, and delivery is free above ₹999.

`POST /checkout` then: creates the order with a readable order number (`KRT-260911-7Q4ZK`) and a sequential
invoice number, empties the cart, saves the address to the profile, and sends the confirmation email
asynchronously — a failing mail server can never fail a paid order.

### 5. Order lifecycle and tracking

```mermaid
stateDiagram-v2
    [*] --> PLACED
    PLACED --> PROCESSING
    PLACED --> CANCELLED
    PROCESSING --> SHIPPED
    PROCESSING --> CANCELLED
    SHIPPED --> DELIVERED
    DELIVERED --> [*]
    CANCELLED --> [*]
```

The allowed moves live in one table (`src/utils/orderStatus.js`) used by the admin UI, the API and the tests:

- customers may cancel while an order is `PLACED` or `PROCESSING`; after dispatch the button disappears and
  the API answers `409 NOT_CANCELLABLE`;
- cancelling **restocks every item** and flips a simulated online payment to `REFUNDED`;
- marking a Cash-on-Delivery order `DELIVERED` marks the payment `PAID`;
- each change is appended to `statusHistory` (status, timestamp, note, admin) and drives the customer-facing
  timeline;
- the transition itself is a **compare-and-set** (`findOneAndUpdate` filtered on the current status), so a
  double-click or two admins clicking at once can't restock an order twice.

### 6. Invoices (HTML + PDF)

Every order gets a gap-free invoice number from an atomic counter document
(`findOneAndUpdate({_id:'invoice-2026'}, {$inc:{seq:1}})` — safe under concurrency), then:

- `/orders/:orderNumber/invoice` renders a print-optimised HTML invoice (`@page A4`, colour-adjusted headings);
- `/orders/:orderNumber/invoice.pdf` streams a PDF built with PDFKit — brand mark drawn from the same SVG
  path as the site logo, itemised table with automatic page breaks, totals, payment details and
  "Page _n_ of _m_" footers.

The PDF embeds a subset of **Poppins** (included under the SIL Open Font License) because the standard PDF
fonts have no ₹ glyph.

### 7. Authentication, sessions and roles

- Passwords are hashed with **bcrypt** (cost 12; 4 in tests) and the hash is `select: false`, so it is never
  loaded unless explicitly requested.
- Sign-in and unknown-email failures return **the same message**, which prevents account enumeration.
- On successful sign-in the session id is **regenerated** (session-fixation defence) and the guest cart merges.
- Sessions live in MongoDB via `connect-mongo` with a rolling 7-day TTL; cookies are `httpOnly`,
  `SameSite=Lax` and `Secure` in production.
- Roles: `customer` and `admin`, plus a `readOnly` flag for the public demo admin — every non-GET admin
  request from it is rejected. `isDemo` accounts cannot change their password, so the shared demo login
  keeps working.
- Sign-in and registration are rate-limited (20 attempts per 15 minutes per IP).

### 8. Admin dashboard

All dashboard numbers come from MongoDB **aggregation pipelines** running in parallel: lifetime revenue and
order count, the last 14 days versus the 14 before them (for the trend deltas), revenue grouped by day in the
store's timezone, top products by revenue (`$unwind` on order items), low stock, orders by status and new
customers.

The revenue chart is **server-rendered SVG** — no chart library, no client-side data fetch. Geometry is
computed in `adminService.buildChart()` (nice axis maxima, ≤24px columns with rounded data-ends), the page
adds hover tooltips, and a `<details>` element exposes the same numbers as a table for screen readers and
keyboard users.

### 9. Transactional email

`mailService` renders EJS email templates and sends them through SMTP when `SMTP_HOST` is set. Without SMTP
it uses nodemailer's JSON transport and logs a line instead — so a fresh clone never crashes on mail, and no
email is ever sent to the reserved `example.com` addresses used by the demo data. Emails cover: welcome,
order confirmation and every status change.

### 10. Front-end approach

- **No framework.** ~600 lines of vanilla JS: a `fetch` wrapper that adds the CSRF header and turns API
  errors into toasts, add-to-cart, the catalogue fragment swapper, cart mutations, voice search, an
  accessible confirm `<dialog>`, image previews and chart tooltips.
- **Progressive enhancement.** Filters are a real `<form>`, pagination is real links, checkout is a real POST.
  JavaScript only makes them faster.
- **Strict CSP.** No inline `<script>` or `style` attributes anywhere, so `script-src 'self'` needs no
  `unsafe-inline`. Data reaches JS through `data-` attributes.
- **Self-hosted assets.** Poppins is subset to Latin + ₹ (~10 KB per weight, WOFF) and icons are one cached
  SVG sprite — the page makes no third-party requests at all.
- **Accessibility.** Skip link, landmarks, labelled controls, `aria-live` for toasts and result counts,
  visible focus rings, `prefers-reduced-motion` support, and colour contrast checked against the surface.

## Security

| Risk                    | Mitigation                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SQL/NoSQL injection     | Mongoose casting + a sanitiser that strips `$`/dotted keys from request bodies, a query parser pinned to `simple`, and zod typing on every input |
| XSS                     | EJS escapes by default (`<%= %>`); strict CSP with no inline scripts or styles                                                                   |
| CSRF                    | Per-session synchronizer token required on every state-changing request (header, body or query for uploads) + `SameSite=Lax` cookies             |
| Session fixation        | Session id regenerated on sign-in and registration                                                                                               |
| Account enumeration     | Identical error for unknown email and wrong password                                                                                             |
| Brute force             | Rate limiting on `/login` and `/register` (plus a global API limit)                                                                              |
| Password theft          | bcrypt hashes, never selected by default, never logged                                                                                           |
| IDOR                    | Orders, invoices and reviews are always scoped to `req.user._id`; another customer gets a 404                                                    |
| Privilege escalation    | Role checked from the database on every request; read-only demo admin blocked from writes                                                        |
| Malicious uploads       | multer type + 2 MB size limits, then magic-byte verification before storing                                                                      |
| Overselling             | Conditional atomic stock updates with rollback                                                                                                   |
| Price tampering         | Totals recomputed server-side from database prices                                                                                               |
| Open redirect           | `next` parameters validated to be same-site relative paths                                                                                       |
| Clickjacking / sniffing | `helmet` (CSP, `X-Frame-Options`, `nosniff`, HSTS in production)                                                                                 |
| Secret leakage          | All configuration via environment variables; `.env` git-ignored; no secrets in the repo                                                          |

## REST API

Base URL `/api/v1`. Authentication uses the same session cookie as the website. Every state-changing request
needs the CSRF token from `GET /api/v1/auth/csrf-token` in the `X-CSRF-Token` header.

> The full contract — every parameter, schema and status code — is written up as an
> [OpenAPI 3 specification](docs/openapi.yaml). Paste it into [Swagger Editor](https://editor.swagger.io)
> or import it into Postman to get a browsable, executable version of the table below.

**Envelope**

```jsonc
// success
{ "data": { … }, "meta": { "total": 93, "page": 1, "pages": 8 } }
// error
{ "error": { "code": "OUT_OF_STOCK", "message": "Only 2 × … left in stock.", "details": { … } } }
```

| Method   | Endpoint                            | Auth     | Description                                                                                                          |
| -------- | ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/auth/csrf-token`                  | –        | Issue a CSRF token for this session                                                                                  |
| `POST`   | `/auth/register`                    | –        | Create an account and sign in                                                                                        |
| `POST`   | `/auth/login`                       | –        | Sign in                                                                                                              |
| `POST`   | `/auth/logout`                      | –        | Destroy the session                                                                                                  |
| `GET`    | `/auth/me`                          | –        | Current user (or `null`)                                                                                             |
| `GET`    | `/products`                         | –        | List products — `q`, `category`, `brand`, `minPrice`, `maxPrice`, `inStock`, `sort`, `page`, `limit`; returns facets |
| `GET`    | `/products/:idOrSlug`               | –        | Product detail                                                                                                       |
| `POST`   | `/products`                         | admin    | Create a product (`multipart/form-data` with `image`)                                                                |
| `PATCH`  | `/products/:id`                     | admin    | Update any subset of fields                                                                                          |
| `DELETE` | `/products/:id`                     | admin    | Archive a product                                                                                                    |
| `GET`    | `/products/:idOrSlug/reviews`       | –        | Reviews + rating distribution                                                                                        |
| `POST`   | `/products/:idOrSlug/reviews`       | customer | Add/update a review (verified buyers only)                                                                           |
| `GET`    | `/categories`, `/brands`            | –        | Taxonomy with product counts                                                                                         |
| `GET`    | `/cart`                             | –        | Current cart (guest or user) with totals                                                                             |
| `POST`   | `/cart/items`                       | –        | Add `{ productId, quantity }`                                                                                        |
| `PATCH`  | `/cart/items/:productId`            | –        | Set `{ quantity }`                                                                                                   |
| `DELETE` | `/cart/items/:productId`            | –        | Remove one line                                                                                                      |
| `DELETE` | `/cart`                             | –        | Empty the cart                                                                                                       |
| `GET`    | `/orders`                           | customer | Your orders                                                                                                          |
| `POST`   | `/orders`                           | customer | Check out `{ shippingAddress, paymentMethod }`                                                                       |
| `GET`    | `/orders/:orderNumber`              | customer | One of your orders                                                                                                   |
| `POST`   | `/orders/:orderNumber/cancel`       | customer | Cancel before dispatch                                                                                               |
| `GET`    | `/admin/stats`                      | admin    | Dashboard KPIs, daily revenue, top products                                                                          |
| `GET`    | `/admin/orders`                     | admin    | All orders (`status`, `q`, `page`)                                                                                   |
| `PATCH`  | `/admin/orders/:orderNumber/status` | admin    | Advance an order `{ status, note? }`                                                                                 |
| `GET`    | `/health`                           | –        | Liveness probe: `{ status, database, version, uptimeSeconds }`                                                       |

**Error codes:** `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `FORBIDDEN` / `READ_ONLY_ADMIN` (403),
`NOT_FOUND` (404), `CSRF_INVALID` (403), `OUT_OF_STOCK` / `QUANTITY_LIMIT` / `INVALID_STATUS_TRANSITION` /
`NOT_CANCELLABLE` (409), `RATE_LIMITED` (429).

<details>
<summary><strong>Example: browse and buy with curl</strong></summary>

```bash
BASE=http://localhost:3000/api/v1
JAR=/tmp/kartly.jar

# 1. A CSRF token (and a session cookie)
TOKEN=$(curl -s -c $JAR $BASE/auth/csrf-token | jq -r .data.csrfToken)

# 2. Search the catalogue
curl -s "$BASE/products?q=phones%20under%2020000&sort=price_asc" | jq '.data[] | {name, price}'

# 3. Sign in as the demo customer (the token rotates with the new session)
TOKEN=$(curl -s -b $JAR -c $JAR -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Demo@1234"}' $BASE/auth/login | jq -r .data.csrfToken)

# 4. Add a product to the cart
PRODUCT=$(curl -s "$BASE/products?limit=1" | jq -r '.data[0].id')
curl -s -b $JAR -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODUCT\",\"quantity\":1}" $BASE/cart/items | jq '.data.total'

# 5. Check out
curl -s -b $JAR -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' -d '{
  "shippingAddress": {"fullName":"Demo Customer","phone":"+91 9876543210","line1":"221B MG Road",
                      "city":"Bengaluru","state":"Karnataka","postalCode":"560001","country":"India"},
  "paymentMethod": "COD"
}' $BASE/orders | jq '{orderNumber, invoiceNumber, total: .data.amounts.total}'
```

</details>

## Getting started

### Prerequisites

- **Node.js 20 or newer** (`node -v`) and npm
- MongoDB is **optional** in development — see below

### Quick start (no database installation)

```bash
git clone https://github.com/VivekReddy2001/shopping_cart.git
cd shopping_cart
npm install
npm run dev
```

Open <http://localhost:3000>. With no `MONGODB_URI` set, the app starts an **in-memory MongoDB**, seeds the
full demo store (93 products, 10 categories, 19 brands, demo accounts and ~50 sample orders) and is ready in
a few seconds. Data resets on every restart — perfect for trying things out.

Sign in with `demo@example.com` / `Demo@1234`, or as the admin `admin@example.com` / `Admin@12345`
(development default) at <http://localhost:3000/admin>.

### With a real MongoDB (local or Atlas)

```bash
cp .env.example .env
# set MONGODB_URI, e.g.
#   mongodb://127.0.0.1:27017/kartly
#   mongodb+srv://user:pass@cluster.mongodb.net/kartly?retryWrites=true&w=majority
npm run seed        # first time only (use `npm run seed:reset` to wipe and re-seed)
npm run dev
```

### With Docker

```bash
docker compose up --build      # app + MongoDB 7 → http://localhost:3000
```

## Configuration

Everything is configured through environment variables (see `.env.example`). `MONGODB_URI` and
`SESSION_SECRET` are **required in production**; the app refuses to start without them.

| Variable                                                                            | Default                                                | Purpose                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `NODE_ENV`                                                                          | `development`                                          | `production` enables secure cookies, HSTS and strict config checks  |
| `PORT`                                                                              | `3000`                                                 | HTTP port                                                           |
| `APP_URL`                                                                           | `http://localhost:3000`                                | Absolute URL used in emails                                         |
| `MONGODB_URI`                                                                       | _(empty)_                                              | Connection string; empty in development starts an in-memory MongoDB |
| `SESSION_SECRET`                                                                    | _(dev fallback)_                                       | Cookie signing secret — 32+ random characters in production         |
| `AUTO_SEED`                                                                         | `true`                                                 | Seed the demo catalogue when the database is empty                  |
| `SEED_DEMO_ORDERS`                                                                  | `true`                                                 | Also create sample customers and orders (dashboard data)            |
| `DEMO_ACCOUNTS`                                                                     | `true`                                                 | Create the public demo customer and read-only demo admin            |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`                                     | `Store Admin` / `admin@example.com` / dev-only default | Your real admin account                                             |
| `CURRENCY` / `LOCALE` / `TIMEZONE`                                                  | `INR` / `en-IN` / `Asia/Kolkata`                       | Money and date formatting                                           |
| `TAX_RATE`                                                                          | `0.18`                                                 | GST rate contained in displayed prices                              |
| `SHIPPING_FEE` / `FREE_SHIPPING_THRESHOLD`                                          | `49` / `999`                                           | Delivery pricing                                                    |
| `MAX_QTY_PER_ITEM` / `LOW_STOCK_THRESHOLD`                                          | `10` / `5`                                             | Cart cap and low-stock warnings                                     |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | _(empty)_                                              | Email delivery; without a host, emails are logged                   |
| `UPLOAD_MAX_MB`                                                                     | `2`                                                    | Maximum product image size                                          |
| `TRUST_PROXY` / `COOKIE_SECURE`                                                     | `1` / `true` in production                             | Reverse-proxy and HTTPS cookie settings                             |
| `LOG_LEVEL`                                                                         | `info`                                                 | `error`, `warn`, `info`, `debug`, `silent`                          |

### npm scripts

| Script                                | What it does                                                           |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                         | Start with file watching (auto in-memory DB if `MONGODB_URI` is unset) |
| `npm start`                           | Start in production mode                                               |
| `npm run seed` / `npm run seed:reset` | Seed the demo store / wipe everything and re-seed                      |
| `npm test` / `npm run test:coverage`  | Run the test suite                                                     |
| `npm run lint` / `npm run format`     | ESLint / Prettier                                                      |

## Testing

```bash
npm test
```

Jest boots a real in-memory MongoDB and drives the actual Express app with Supertest — no mocked database,
no mocked HTTP. 77 tests across 7 suites, and `npm audit` reports no known vulnerabilities. The suites cover:

| Suite                             | What it proves                                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit.test.js`                    | Money maths (tax-inclusive totals, free-shipping threshold), the search-intent parser, the order state machine, the input sanitiser, image magic-byte detection, chart axis rounding                                  |
| `auth.test.js`                    | Registration validation, bcrypt hashing, duplicate accounts, identical errors for bad email/password, NoSQL-injection attempt, session rotation, CSRF enforcement                                                     |
| `catalog.test.js`                 | Listing, facets, every filter, multi-word and spoken-style search, malformed query params, admin-only product CRUD, read-only admin, image upload + magic-byte rejection                                              |
| `cart.test.js`                    | Guest carts, isolation between visitors, stock caps, quantity updates, removal, guest→user merge, stock changes after adding                                                                                          |
| `orders.test.js`                  | Checkout validation, price snapshots, **concurrent checkout for the last unit**, sequential invoice numbers, IDOR protection, cancellation + restock + refund, admin transitions, PDF invoice, verified-buyer reviews |
| `web.test.js`                     | Rendered pages, HTML fragment responses, 404s, auth redirects, security headers, the full browser flow (sign in → cart → checkout → order page → invoice), admin pages, seeder idempotency                            |
| `progressive-enhancement.test.js` | The whole cart flow driven by plain form posts with JavaScript disabled, `next`-parameter safety, friendly recovery from rejected changes, `sitemap.xml`, `robots.txt` and canonical/Open Graph metadata              |

## Deployment

The stack below costs **nothing** and needs almost no maintenance: Render hosts the app, MongoDB Atlas hosts
the database, and a free uptime monitor keeps both awake.

### 1. Database — MongoDB Atlas (free forever)

1. Create an account at [mongodb.com/atlas](https://www.mongodb.com/atlas) → **Build a Cluster** → **M0 Free**
   (choose a region near you, e.g. Mumbai).
2. **Database Access** → add a user with a strong password.
3. **Network Access** → add IP `0.0.0.0/0` (Render's IPs are dynamic on the free plan).
4. **Connect → Drivers** → copy the connection string and append the database name:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/kartly?retryWrites=true&w=majority`

### 2. Hosting — Render (free web service)

1. Push this repository to GitHub.
2. [render.com](https://render.com) → **New → Blueprint** → pick the repo (it reads `render.yaml`).
3. Fill in the values it asks for:
   - `MONGODB_URI` — the Atlas string from step 1
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — your admin login
   - `APP_URL` — `https://<your-service>.onrender.com`
4. Deploy. The first boot seeds the catalogue automatically (`AUTO_SEED=true`).
   `SESSION_SECRET` is generated by Render.

Every `git push` to `main` redeploys. Uploaded product images are stored in MongoDB rather than on disk,
because Render's free filesystem is wiped on each deploy.

### 3. Keep it awake — UptimeRobot (free)

Render puts free services to sleep after 15 minutes of inactivity (the next visitor then waits ~1 minute),
and Atlas pauses a free cluster after 30 days without connections. One monitor solves both:

1. [uptimerobot.com](https://uptimerobot.com) → **Add New Monitor** → HTTP(s)
2. URL: `https://<your-service>.onrender.com/health`, interval: 5–10 minutes.

`/health` pings MongoDB, so the same request keeps the cluster active — and you get an email if the site
ever goes down. The free plan's 750 instance-hours per month cover one service running 24/7.

### Alternatives

The app is a plain Node process, so it also runs on Railway, Koyeb, Fly.io, a VPS or any Docker host —
`Dockerfile` and `docker-compose.yml` are included.

## Roadmap

Ideas that would be natural next steps rather than missing pieces:

- Real payments (Stripe / Razorpay) behind the existing `payment` abstraction
- Wishlist and recently-viewed products
- Coupons and promotional pricing
- Product image galleries with a CDN
- Full-text search with MongoDB Atlas Search
- Shipment tracking numbers and courier webhooks

## Credits and disclaimer

- **Kartly is a demo store.** No real payments are processed and no orders are shipped. The "online payment"
  option is simulated by design — it never collects card details.
- Product photographs and brand names in the seed data belong to their respective owners and are used purely
  to make the demo catalogue realistic. Replace them before any commercial use.
- Fonts: [Poppins](https://github.com/itfoundry/Poppins) by Indian Type Foundry, used under the
  SIL Open Font License 1.1 (`public/fonts/OFL.txt`). Icons and the logo were drawn for this project.
- Sample customers, addresses and orders are generated fictional data.

## Author

**Vivek Reddy** — designed, built and documented this project end to end.

- GitHub: [@VivekReddy2001](https://github.com/VivekReddy2001)
- Repository: [github.com/VivekReddy2001/shopping_cart](https://github.com/VivekReddy2001/shopping_cart)

Released under the [MIT License](LICENSE).
