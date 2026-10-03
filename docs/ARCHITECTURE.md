# Kartly — Architecture

High-level design (HLD) and low-level design (LLD) for the Kartly e-commerce application.

This document explains **how the system is put together and why**. The [README](../README.md)
explains how to run it and what each feature does; this file is the engineering companion to it.
Every diagram below is Mermaid, so it renders directly on GitHub.

---

## Table of contents

**Part 1 — High-level design**

1. [System context](#11-system-context)
2. [Container view](#12-container-view)
3. [Logical layers and the dependency rule](#13-logical-layers-and-the-dependency-rule)
4. [Deployment view](#14-deployment-view)
5. [Architecture decisions](#15-architecture-decisions)
6. [Quality attributes](#16-quality-attributes)

**Part 2 — Low-level design**

7. [Request lifecycle](#21-request-lifecycle)
8. [Module map](#22-module-map)
9. [Domain model](#23-domain-model)
10. [Sequence — catalogue search](#24-sequence--catalogue-search)
11. [Sequence — guest cart and sign-in merge](#25-sequence--guest-cart-and-sign-in-merge)
12. [Sequence — checkout and stock reservation](#26-sequence--checkout-and-stock-reservation)
13. [State machine — order lifecycle](#27-state-machine--order-lifecycle)
14. [Sequence — invoice numbering and PDF](#28-sequence--invoice-numbering-and-pdf)
15. [Sequence — admin image upload](#29-sequence--admin-image-upload)
16. [Error handling](#210-error-handling)
17. [Concurrency and failure matrix](#211-concurrency-and-failure-matrix)
18. [Indexes and query plans](#212-indexes-and-query-plans)
19. [Security controls, mapped to code](#213-security-controls-mapped-to-code)

**Part 3 — Cross-cutting**

20. [Configuration](#31-configuration)
21. [Observability](#32-observability)
22. [Testing strategy](#33-testing-strategy)
23. [Scaling path](#34-scaling-path)

---

# Part 1 — High-level design

## 1.1 System context

Who uses the system and what it talks to. Everything inside the dashed box is this repository.

```mermaid
flowchart TB
    Guest["Visitor<br/><i>browses, builds a guest cart</i>"]
    Customer["Customer<br/><i>orders, tracks, downloads invoices</i>"]
    Admin["Store administrator<br/><i>catalogue, stock, fulfilment</i>"]
    Monitor["Uptime monitor<br/><i>UptimeRobot</i>"]

    subgraph System["Kartly e-commerce application"]
        App["Node.js + Express 5<br/>server-rendered store, REST API, admin panel"]
    end

    DB[("MongoDB<br/>catalogue · carts · orders · users · sessions")]
    SMTP["SMTP provider<br/><i>transactional email, optional</i>"]
    Speech["Browser Speech Recognition<br/><i>on-device, voice search</i>"]

    Guest --> App
    Customer --> App
    Admin --> App
    Monitor -->|GET /health| App
    App --> DB
    App -.->|order + welcome mail| SMTP
    Customer -.->|microphone| Speech
    Speech -.->|transcript| App
```

**Trust boundaries.** The browser is untrusted: every price, total and stock level shown to it is
recalculated on the server before an order is created. The SMTP provider is treated as optional and
failure-tolerant — mail is sent on a detached promise, so a dead mail server can never fail a checkout.
Speech recognition happens entirely in the browser; only the resulting text reaches the server.

## 1.2 Container view

The deployable pieces and the protocols between them.

```mermaid
flowchart TB
    subgraph Client["Browser"]
        HTML["Server-rendered HTML<br/>EJS + layouts"]
        CSS["app.css<br/>design tokens, no framework"]
        JS["app.js · shop.js · cart.js<br/>product.js · admin.js<br/><i>vanilla, progressive enhancement</i>"]
    end

    subgraph Server["Express 5 process — single container"]
        direction TB
        MW["Middleware pipeline<br/>helmet · compression · static ·<br/>sanitise · session · flash · CSRF · auth"]
        WEB["Web routes<br/>HTML responses"]
        API["REST API<br/>/api/v1 — JSON"]
        ADM["Admin routes<br/>/admin"]
        SYS["System routes<br/>/health · /media/:id"]
        CTRL["Controllers<br/>parse · validate · respond"]
        SVC["Services<br/>catalog · cart · order · auth ·<br/>review · admin · invoice · mail"]
        ODM["Mongoose models"]
    end

    subgraph Data["MongoDB"]
        C1[("products · categories · brands")]
        C2[("carts · orders · counters")]
        C3[("users · reviews")]
        C4[("sessions · media")]
    end

    Mail["SMTP"]

    HTML --> MW
    JS -->|"fetch + X-CSRF-Token"| MW
    MW --> WEB --> CTRL
    MW --> API --> CTRL
    MW --> ADM --> CTRL
    MW --> SYS
    CTRL --> SVC --> ODM
    SYS --> ODM
    ODM --> C1
    ODM --> C2
    ODM --> C3
    ODM --> C4
    SVC -.-> Mail
```

Everything runs in **one process**. There is no message broker, no cache tier and no separate API
service, because at this scale those would add failure modes without removing any. The
[scaling path](#34-scaling-path) describes what to split out first if that ever changes.

## 1.3 Logical layers and the dependency rule

```mermaid
flowchart TB
    R["<b>Routes</b><br/>URL shape, method, middleware order"]
    C["<b>Controllers</b><br/>read the request, validate with zod,<br/>choose a response format"]
    S["<b>Services</b><br/>business rules, transactions,<br/>the only layer that may touch models"]
    M["<b>Models</b><br/>Mongoose schemas, indexes, hooks"]
    U["<b>Utils / validators</b><br/>money · strings · orderStatus ·<br/>serializers · zod schemas"]

    R --> C --> S --> M
    C -.-> U
    S -.-> U
    M -.-> U

    style R fill:#ede9fe,stroke:#6d28d9
    style C fill:#e0f2fe,stroke:#0369a1
    style S fill:#dcfce7,stroke:#15803d
    style M fill:#fef3c7,stroke:#b45309
    style U fill:#f1f5f9,stroke:#64748b
```

**The rule: dependencies only point downwards.** A service never imports a controller, and a model
never imports a service. Controllers never build a Mongoose query.

That single rule is what lets the website and the REST API share one implementation. `POST /cart/items`
(form post, replies with a redirect or an HTML fragment) and `POST /api/v1/cart/items` (fetch, replies
with JSON) run the _same_ `cartService.addItem()`. A stock rule fixed in the service is fixed in both
places at once, and there is no second code path that can drift.

## 1.4 Deployment view

The free-tier topology the repository is configured for (`render.yaml`), plus CI.

```mermaid
flowchart LR
    Dev["Developer<br/>git push"]
    subgraph GH["GitHub"]
        Repo["Repository"]
        CI["Actions CI<br/>lint · test on Node 22 + 24"]
    end

    subgraph Render["Render — free web service"]
        Web["Docker container<br/>node server.js<br/>512 MB · sleeps when idle"]
    end

    subgraph Atlas["MongoDB Atlas — M0 free cluster"]
        Mongo[("Replica set<br/>512 MB storage")]
    end

    UR["UptimeRobot<br/>GET /health every 5 min"]
    User["Browser"]

    Dev --> Repo --> CI
    Repo -->|auto deploy on green| Web
    Web <-->|"mongodb+srv, TLS"| Mongo
    UR -->|keeps the dyno awake<br/>and the cluster active| Web
    User -->|HTTPS| Web
```

The `/health` endpoint does double duty: it is Render's readiness probe _and_ it pings the database,
which is what stops a free Atlas cluster from auto-pausing after 30 idle days.

**Why images live in MongoDB.** Free hosts give you an ephemeral filesystem — anything written to disk
disappears on the next deploy or restart. Uploaded product images are therefore stored as documents in
a `media` collection and served from `GET /media/:id` with a one-year immutable cache header. It costs
one indexed lookup per image and removes the need for S3 credentials or a paid disk.

## 1.5 Architecture decisions

| #   | Decision                                                                  | Alternatives considered                  | Why this one                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **MongoDB + Mongoose** instead of MySQL                                   | Keep MySQL; PostgreSQL                   | The original schema was never committed, so the app could not start at all. A document store also fits order _snapshots_ naturally, and Atlas has a genuinely free tier.                                                                       |
| 2   | **Server-rendered EJS**, not a SPA                                        | React/Next.js front end                  | First paint without JavaScript, real URLs, no build step, no CORS/token plumbing. JavaScript then _enhances_ the pages rather than being required by them.                                                                                     |
| 3   | **One process serving HTML and JSON**                                     | Separate API service                     | The API is the same service layer with a JSON serializer on top. Splitting it would double the deployment surface for zero benefit at this size.                                                                                               |
| 4   | **Atomic conditional updates** for stock, not multi-document transactions | `session.withTransaction()`              | Transactions need a replica set, which rules out a single local `mongod` for contributors. `updateOne({stock: {$gte: n}}, {$inc: {stock: -n}})` is atomic on one document and cannot oversell; a compensating restock handles partial failure. |
| 5   | **Order items are snapshots**                                             | Join to `products` when rendering        | An order must still render correctly after the product is renamed, repriced or archived. History stays truthful.                                                                                                                               |
| 6   | **Archive, never delete** products                                        | Hard delete                              | Past orders, reviews and analytics keep referring to the product. `isActive: false` hides it from the store and keeps referential integrity.                                                                                                   |
| 7   | **Sessions in MongoDB** (connect-mongo)                                   | In-memory store; JWT in localStorage     | The in-memory store leaks and dies with the process; tokens in `localStorage` are readable by any XSS. An httpOnly, SameSite cookie backed by a server-side store gives real logout and survives restarts.                                     |
| 8   | **Custom CSRF + sanitiser**                                               | `csurf`, `express-mongo-sanitize`        | Both are deprecated/unmaintained. Both replacements are ~40 lines, have no dependencies and are unit-tested here.                                                                                                                              |
| 9   | **Images in MongoDB**                                                     | Local disk; S3/Cloudinary                | Free hosts have ephemeral disks; object storage needs an account and keys. See [1.4](#14-deployment-view).                                                                                                                                     |
| 10  | **Strict CSP with no inline script or style**                             | `'unsafe-inline'`                        | It is the difference between "we set a CSP header" and "a CSP that actually stops XSS". It forced every handler into an external file and every style into a class — which is better code anyway.                                              |
| 11  | **zod for validation**, shared by API and forms                           | Hand-written checks; `express-validator` | One schema produces the API's 422 payload and the form's per-field error messages. Query schemas use `.catch()` so junk query strings degrade to defaults instead of throwing.                                                                 |
| 12  | **In-memory MongoDB in development**                                      | Require a local install                  | `git clone && npm install && npm run dev` starts a working, seeded store with no database setup. Removes the single biggest barrier to someone actually running the project.                                                                   |

## 1.6 Quality attributes

| Attribute                         | Target                                                             | How it is achieved                                                                                                                             | Where to look                                     |
| --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Correctness under concurrency** | Never oversell a product                                           | Conditional `$inc` reservation + rollback; compare-and-set status transitions                                                                  | `services/orderService.js`                        |
| **Security**                      | No XSS, CSRF, NoSQL injection, enumeration or privilege escalation | Strict CSP, synchronizer tokens, key sanitiser, uniform auth errors, role checks read fresh per request                                        | [2.13](#213-security-controls-mapped-to-code)     |
| **Availability**                  | Survive a dead mail server, a restart, a cold start                | Detached mail promises, sessions in the database, graceful shutdown, `/health` probe                                                           | `server.js`, `routes/system.js`                   |
| **Performance**                   | Sub-100 ms catalogue pages on free hardware                        | Compound indexes matching the sort orders, `.lean()` reads, one faceted aggregation instead of N count queries, gzip, long-lived asset caching | [2.12](#212-indexes-and-query-plans)              |
| **Accessibility**                 | Usable by keyboard and screen reader                               | Semantic landmarks, labelled controls, visible focus, `aria-live` for cart updates, no JS required for core flows                              | `views/`, `public/css/app.css`                    |
| **Maintainability**               | A change has one obvious home                                      | Four layers with a one-way dependency rule, 67 tests, ESLint + Prettier, CI on two Node versions                                               | [1.3](#13-logical-layers-and-the-dependency-rule) |
| **Portability**                   | Runs the same on a laptop, Docker and Render                       | Config from environment only, no filesystem writes at runtime, pinned Node version                                                             | `config/env.js`, `Dockerfile`                     |

---

# Part 2 — Low-level design

## 2.1 Request lifecycle

Every request walks the same pipeline, and the **order is deliberate**. `src/app.js`, top to bottom:

```mermaid
flowchart TB
    In(["Request"]) --> H["helmet<br/><i>CSP, HSTS, nosniff, frameguard</i>"]
    H --> PP["Permissions-Policy<br/><i>microphone=self, camera=, geolocation=, payment=</i>"]
    PP --> GZ["compression"]
    GZ --> LOG["morgan"]
    LOG --> ST{"Static file<br/>in /public?"}
    ST -->|yes| Send(["Served with cache headers — pipeline ends"])
    ST -->|no| SYS{"/health or<br/>/media/:id?"}
    SYS -->|yes| SysR(["Answered before sessions exist"])
    SYS -->|no| BP["express.json + urlencoded<br/><i>100 kb cap</i>"]
    BP --> SAN["sanitizeInput<br/><i>strip $-prefixed, dotted and __proto__ keys</i>"]
    SAN --> SESS["express-session<br/><i>connect-mongo, rolling, httpOnly</i>"]
    SESS --> FL["flash<br/><i>one-shot messages</i>"]
    FL --> CSRF{"csrfProtection<br/><i>safe method?</i>"}
    CSRF -->|"GET/HEAD/OPTIONS"| AU
    CSRF -->|"token matches"| AU["attachUser<br/><i>role read fresh from the database</i>"]
    CSRF -->|"missing or wrong"| ERR
    AU --> RT{"Route match"}
    RT -->|"/api/v1/*"| AC["API controller → service"]
    RT -->|"/admin/*"| ADC["requireAdmin → admin controller"]
    RT -->|"page"| WC["pageLocals → web controller"]
    RT -->|"none"| NF["notFound → 404 ApiError"]
    AC --> ERR["errorHandler"]
    ADC --> ERR
    WC --> ERR
    NF --> ERR
    ERR --> Out(["JSON envelope or rendered error page"])

    style SAN fill:#fee2e2,stroke:#b91c1c
    style CSRF fill:#fee2e2,stroke:#b91c1c
    style AU fill:#fee2e2,stroke:#b91c1c
```

Four ordering choices carry real weight:

- **Static files and `/health` come before the session middleware.** An uptime monitor hitting
  `/health` every five minutes would otherwise create ~8,600 session documents a month, and every
  image request would touch the session store. Now they create none.
- **`sanitizeInput` runs before the session**, so nothing further down — the session store included —
  ever sees a `$`-prefixed or dotted key in a request body. Query strings need no sweep because the
  query parser is pinned to `simple`: `?email[$ne]=` can only ever arrive as a plain string, never as
  the nested object a Mongoose filter would act on.
- **`flash` comes before `csrfProtection`.** If CSRF ran first, an expired form would blow up into a
  hard error page with no way to say anything useful. With `flash` already mounted, the error handler
  can drop a friendly "your session expired, please try again" message and redirect the user back.
- **`attachUser` re-reads the user on every request**, so revoking an admin role takes effect on the
  next click rather than at the next login.

## 2.2 Module map

```mermaid
flowchart LR
    subgraph routes["src/routes"]
        r_web["web/index.js"]
        r_admin["web/admin.js"]
        r_api["api/index.js"]
        r_sys["system.js"]
    end
    subgraph controllers["src/controllers"]
        c_shop["web/shopController"]
        c_cart["web/cartController"]
        c_check["web/checkoutController"]
        c_order["web/orderController"]
        c_auth["web/authController"]
        c_acct["web/accountController"]
        c_admin["admin/adminController"]
        c_api["api/*Api"]
    end
    subgraph services["src/services"]
        s_cat["catalogService"]
        s_cart["cartService"]
        s_ord["orderService"]
        s_auth["authService"]
        s_rev["reviewService"]
        s_adm["adminService"]
        s_inv["invoiceService"]
        s_mail["mailService"]
    end
    subgraph models["src/models"]
        m["User · Product · Category · Brand<br/>Cart · Order · Review · Counter · Media"]
    end

    r_web --> c_shop & c_cart & c_check & c_order & c_auth & c_acct
    r_admin --> c_admin
    r_api --> c_api
    r_sys --> m

    c_shop --> s_cat
    c_cart --> s_cart
    c_check --> s_cart & s_ord
    c_order --> s_ord & s_inv
    c_auth --> s_auth & s_cart
    c_acct --> s_auth & s_ord
    c_admin --> s_adm & s_cat & s_ord
    c_api --> s_cat & s_cart & s_ord & s_auth & s_rev

    s_cat --> m
    s_cart --> m
    s_ord --> m
    s_ord --> s_mail
    s_auth --> m
    s_auth --> s_mail
    s_rev --> m
    s_adm --> m
    s_inv --> m
```

Note where the arrows converge: `checkoutController` and the cart API both end at `cartService` and
`orderService`. There is no second checkout implementation hiding behind the JSON endpoints.

## 2.3 Domain model

```mermaid
classDiagram
    class User {
        +String name
        +String email «unique, lowercased»
        -String passwordHash «select:false»
        +String role «customer|admin»
        +Boolean readOnly
        +Boolean isDemo
        +Address address
        +Date lastLoginAt
        +setPassword(plain) Promise
        +verifyPassword(plain) Promise~bool~
    }
    class Product {
        +String name
        +String slug «unique»
        +Number price
        +Number mrp
        +Number discountPercent «derived on save»
        +Number stock
        +Number soldCount
        +Rating rating
        +Boolean isActive
        +Boolean featured
        +String[] tags
        +String image
    }
    class Category {
        +String name
        +String slug «unique»
    }
    class Brand {
        +String name
        +String slug «unique»
    }
    class Cart {
        +ObjectId user «absent for guests»
        +CartItem[] items
        +Date expiresAt «TTL, guests only»
    }
    class CartItem {
        +ObjectId product
        +Number quantity
    }
    class Order {
        +String orderNumber «unique»
        +String invoiceNumber «unique»
        +ObjectId user
        +Customer customer «snapshot»
        +OrderItem[] items «snapshot»
        +Address shippingAddress
        +Payment payment
        +Amounts amounts
        +String status
        +StatusEvent[] statusHistory
    }
    class OrderItem {
        +ObjectId product
        +String name
        +String image
        +Number price
        +Number quantity
        +Number lineTotal
    }
    class Review {
        +ObjectId product
        +ObjectId user
        +Number rating
        +String comment
    }
    class Counter {
        +String _id
        +Number seq
        +next(name)$ Promise~Number~
    }
    class Media {
        +Buffer data
        +String contentType
        +Number size
    }

    User "1" --> "0..1" Cart
    User "1" --> "*" Order
    User "1" --> "*" Review
    Category "1" --> "*" Product
    Brand "1" --> "*" Product
    Cart "1" *-- "*" CartItem
    CartItem --> Product
    Order "1" *-- "*" OrderItem
    OrderItem ..> Product : "snapshot of"
    Product "1" --> "*" Review
    Product --> Media : "uploaded image"
    Order ..> Counter : "invoice sequence"
```

The dotted arrows are the important ones. `OrderItem` _was_ a `Product` at purchase time but is not
bound to it afterwards — that is what makes an order immutable history rather than a live join.

## 2.4 Sequence — catalogue search

`GET /products?q=samsung phones under 20k&sort=price_asc`

```mermaid
sequenceDiagram
    autonumber
    actor U as Visitor
    participant R as shop route
    participant C as shopController
    participant V as zod query schema
    participant S as catalogService
    participant DB as MongoDB

    U->>R: GET /products?q=...&sort=price_asc&page=2
    R->>C: handler
    C->>V: safeParse(req.query)
    Note over V: every field has .catch(default)<br/>so junk degrades, never throws
    V-->>C: {q, sort, page, category, brand, min, max, rating}
    C->>S: listProducts(query)
    S->>S: parseSearchIntent(q)
    Note over S: strips filler words, stems plurals,<br/>lifts "under 20k" into maxPrice
    S->>DB: Brand.distinct + Category.distinct per term
    DB-->>S: matching ids
    S->>S: buildTextClauses → AND of word-boundary $or clauses
    par one round trip each
        S->>DB: find(filter).sort(SORTS[sort]).skip().limit().lean()
        and
        S->>DB: countDocuments(filter)
        and
        S->>DB: aggregate facets — counts per category, brand, price band
    end
    DB-->>S: products + total + facets
    S-->>C: {items, total, pages, facets, appliedIntent}
    alt normal navigation
        C-->>U: full page render
    else fetch from shop.js
        C-->>U: partials/shop-results fragment, swapped in place
    end
```

The same service call backs `GET /api/v1/products`; only the last step differs.

## 2.5 Sequence — guest cart and sign-in merge

```mermaid
sequenceDiagram
    autonumber
    actor G as Guest
    participant A as App
    participant CS as cartService
    participant AS as authService
    participant DB as MongoDB

    G->>A: POST /cart/items
    A->>CS: addItem({guestCartId: session.guestCartId}, id, qty)
    CS->>DB: create Cart {items, expiresAt: now + 7d}
    Note over DB: no user field → TTL index reaps it<br/>7 days after the last change
    CS-->>A: cart
    A->>A: session.guestCartId = cart._id
    A-->>G: 303 back to the page + updated badge

    G->>A: POST /login
    A->>AS: authenticate(email, password)
    AS->>DB: findOne(+passwordHash) → bcrypt.compare
    Note over AS: identical error for unknown email<br/>and wrong password
    AS-->>A: user
    A->>A: const guestCartId = session.guestCartId
    A->>AS: regenerateSession()
    Note over A,AS: new session id — defeats session fixation.<br/>The CSRF token is regenerated with it.
    A->>A: session.userId = user._id
    A->>CS: mergeGuestCart(guestCartId, user._id)
    CS->>DB: upsert the user cart, fold in lines,<br/>cap each at MAX_QTY, delete the guest cart
    A-->>G: 303 to ?next= or home, cart intact
```

The guest cart id is captured **before** `regenerate()` wipes the session, which is the whole trick —
miss that line and every visitor loses their basket the moment they sign in.

## 2.6 Sequence — checkout and stock reservation

The most safety-critical path in the codebase.

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant CH as checkoutController
    participant OS as orderService
    participant P as products
    participant O as orders
    participant CT as carts
    participant M as mailService

    C->>CH: POST /checkout {address, paymentMethod}
    CH->>CH: zod validate address + method
    CH->>OS: placeOrder(user, input)
    OS->>CT: findOne(cart).populate(items.product)
    alt cart empty
        OS-->>CH: 400 CART_EMPTY
    end
    OS->>OS: pre-flight: every item active and stock >= qty
    Note over OS: friendly early exit — the real guard is next

    loop for each line
        OS->>P: updateOne({_id, isActive:true, stock:{$gte:qty}},<br/>{$inc:{stock:-qty, soldCount:+qty}})
        Note over P: single-document atomic compare-and-decrement.<br/>Two shoppers racing for the last unit:<br/>exactly one matches the filter.
        alt modifiedCount !== 1
            OS->>P: restock everything reserved so far
            OS-->>CH: 409 OUT_OF_STOCK
        end
    end

    OS->>OS: snapshot items, calculateTotals<br/>(GST-inclusive tax, shipping, free over threshold)
    OS->>OS: orderNumber = KRT-YYMMDD-XXXXX
    OS->>O: Counter.next("invoice-YYYY") → INV-YYYY-000042
    OS->>O: create order {items, amounts, payment, status: PLACED,<br/>statusHistory: [PLACED]}
    OS->>CT: clear the cart
    OS->>OS: remember the address on the user
    OS--)M: sendOrderConfirmation (detached promise)
    Note over M: a failing SMTP server logs a warning<br/>and never fails the order
    OS-->>CH: order
    CH-->>C: 303 /orders/KRT-260911-7Q4ZK
```

**Why not a transaction?** A multi-document transaction needs a replica set, which would mean nobody
could run the project against a plain local `mongod`. The conditional `$inc` is atomic _per document_,
which is exactly the granularity overselling happens at, and the `catch` block restocks whatever was
already reserved — a compensating action rather than a rollback. The failure window is one process
crash between two `updateOne` calls; the cost is at most a few units of stock held back, which the
admin can correct, and never a customer charged for goods that do not exist.

## 2.7 State machine — order lifecycle

```mermaid
stateDiagram-v2
    [*] --> PLACED : checkout
    PLACED --> PROCESSING : admin accepts
    PLACED --> CANCELLED : customer or admin
    PROCESSING --> SHIPPED : admin dispatches
    PROCESSING --> CANCELLED : customer or admin
    SHIPPED --> DELIVERED : admin confirms
    DELIVERED --> [*]
    CANCELLED --> [*]

    note right of SHIPPED
        Customers can no longer cancel here.
        Only forward transitions remain.
    end note
    note right of CANCELLED
        Side effects: restock every line,
        PAID → REFUNDED.
    end note
    note right of DELIVERED
        Side effect: a COD order that is
        still PENDING becomes PAID.
    end note
```

The table lives in `src/utils/orderStatus.js` and is the single source of truth: the admin UI renders
only the buttons `TRANSITIONS[current]` allows, and the service re-checks the same table — so a forged
POST cannot skip a state. The write itself is a compare-and-set:

```js
Order.findOneAndUpdate(
  { _id, status: order.status },
  { $set, $push: { statusHistory } },
  { new: true }
);
```

If a second admin (or a double-clicked button) already moved the order, the filter no longer matches,
`findOneAndUpdate` returns `null`, and the caller gets `409 STALE_ORDER` instead of a duplicate
history entry and a second refund.

## 2.8 Sequence — invoice numbering and PDF

```mermaid
sequenceDiagram
    autonumber
    participant OS as orderService
    participant CN as counters
    participant OC as orderController
    participant IS as invoiceService
    participant PDF as PDFKit

    OS->>CN: findOneAndUpdate({_id:"invoice-2026"}, {$inc:{seq:1}}, {upsert, new})
    Note over CN: atomic, gap-free even with<br/>simultaneous checkouts
    CN-->>OS: 42 → INV-2026-000042

    OC->>IS: buildInvoice(order) on GET /orders/:n/invoice.pdf
    IS->>PDF: A4 document, Poppins subset embedded
    Note over PDF: the font is bundled so the ₹ glyph<br/>renders identically everywhere
    IS->>PDF: draw the logo from the same SVG path as the site
    IS->>PDF: seller / buyer blocks, order meta
    loop item rows
        IS->>PDF: draw a row, breaking to a new page and repeating the header when it overflows
    end
    IS->>PDF: totals, GST breakdown, payment status
    IS->>PDF: "Page n of m" in every footer
    PDF-->>OC: stream
    OC-->>OC: Content-Disposition — attachment, filename INV-2026-000042.pdf
```

The HTML invoice at `/orders/:n/invoice` renders the same data through `layouts/print.ejs`, so what
you see on screen and what you download agree line for line.

## 2.9 Sequence — admin image upload

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant MW as multer
    participant CS as catalogService
    participant ME as media
    participant PR as products
    actor V as Any visitor

    A->>MW: POST /admin/products (multipart, ?_csrf=...)
    Note over MW: CSRF travels in the query string here —<br/>multer has not parsed the body yet
    MW->>MW: memoryStorage, 1 file, size cap, MIME allow-list
    MW->>CS: createProduct(input, file)
    CS->>CS: detectImageType(buffer) — magic bytes
    Note over CS: a .exe renamed to .png is rejected here,<br/>after passing the MIME check
    CS->>ME: create {data, contentType, size}
    ME-->>CS: mediaId
    CS->>PR: save product {image: "/media/<id>", imageMedia: mediaId}
    alt the product fails to save
        CS->>ME: deleteOne(mediaId)
        Note over CS,ME: no orphaned blobs
    end
    CS-->>A: 303 to the product list

    V->>ME: GET /media/<id>
    ME-->>V: bytes + Cache-Control: max-age=31536000, immutable
```

## 2.10 Error handling

One handler produces both response formats, so nothing has to be written twice.

```mermaid
flowchart TB
    T["throw"] --> N["normalise(err)"]
    N --> A1["ApiError → as-is"]
    N --> A2["mongoose ValidationError → 422 + field map"]
    N --> A3["CastError → 400 INVALID_ID"]
    N --> A4["duplicate key 11000 → 409 + field map"]
    N --> A5["MulterError → 413 or 400"]
    N --> A6["bad JSON / body too large → 400 / 413"]
    N --> A7["anything else → 500, message replaced"]
    A1 & A2 & A3 & A4 & A5 & A6 & A7 --> L{"status >= 500?"}
    L -->|yes| LOG["log the original error with stack"]
    L -->|no| SK["do not log"]
    LOG --> W{"client wants JSON?"}
    SK --> W
    W -->|"/api/*, X-Requested-With,<br/>Accept: application/json"| J["{error: {code, message, details?}}"]
    W -->|browser| F{"special cases"}
    F -->|CSRF_INVALID| R1["flash + 303 back to the form"]
    F -->|READ_ONLY_ADMIN| R2["flash + 303 back to the admin page"]
    F -->|otherwise| P["render pages/error<br/><i>stack only in development</i>"]

    style A7 fill:#fee2e2,stroke:#b91c1c
```

Internal 500 messages are always replaced with a generic sentence before they reach the client — stack
traces and driver errors never leak to production users, while the full original is written to the log.

## 2.11 Concurrency and failure matrix

| Scenario                                          | What the system does                                                                   | Mechanism                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Two shoppers buy the last unit at the same moment | One order succeeds, the other gets `409 OUT_OF_STOCK` before any order document exists | Conditional `$inc` on a single document                        |
| Checkout fails halfway through a 5-line cart      | Every unit reserved so far is returned to the catalogue                                | `catch` → `restock(reserved)`                                  |
| Two admins mark the same order shipped            | First wins; second gets `409 STALE_ORDER`                                              | Compare-and-set on `status`                                    |
| A customer double-clicks "Cancel order"           | Second click is a no-op — `status === next` returns the order unchanged                | Early equality check                                           |
| Two checkouts allocate an invoice number at once  | Distinct, gap-free numbers                                                             | `Counter.next()` atomic `$inc` with upsert                     |
| The SMTP server is down or slow                   | The order still completes; a warning is logged                                         | Detached promise with `.catch`                                 |
| A product is archived while it sits in a cart     | Dropped from the cart view with a notice; checkout refuses before reserving            | `buildView` stale sweep + `isActive` in the reservation filter |
| The process is restarted mid-session              | Users stay signed in, carts survive                                                    | Sessions and carts live in MongoDB                             |
| `SIGTERM` during a deploy                         | Stop accepting, finish in-flight requests, close idle sockets, then exit               | Graceful shutdown in `server.js`                               |
| A guest never returns                             | Their cart disappears after 7 days                                                     | TTL index on `expiresAt`                                       |
| Someone posts a forged status transition          | `409 INVALID_STATUS_TRANSITION`                                                        | Server-side `TRANSITIONS` table                                |
| A renamed executable is uploaded as an image      | `422` with a field error, nothing stored                                               | Magic-byte sniffing after the MIME check                       |

## 2.12 Indexes and query plans

| Collection | Index                                     | Serves                                        |
| ---------- | ----------------------------------------- | --------------------------------------------- |
| `products` | `{isActive, category, price}`             | Category browsing and price sorting/filtering |
| `products` | `{isActive, createdAt: -1}`               | "Newest first" and the home page rails        |
| `products` | `{isActive, discountPercent: -1}`         | "Biggest discount" sort and the deals row     |
| `products` | `{isActive, soldCount: -1}`               | "Recommended" sort and best-sellers           |
| `products` | `{slug}` unique                           | `/products/:slug`                             |
| `orders`   | `{user, createdAt: -1}`                   | A customer's order history, newest first      |
| `orders`   | `{createdAt: -1}`                         | Admin order list and dashboard windows        |
| `orders`   | `{orderNumber}`, `{invoiceNumber}` unique | Direct lookups, duplicate protection          |
| `carts`    | `{user}` partial-unique                   | One cart per signed-in user                   |
| `carts`    | `{expiresAt}` TTL                         | Reaps abandoned guest carts                   |
| `reviews`  | `{product, user}` unique                  | One review per customer per product           |
| `users`    | `{email}` unique                          | Sign-in and registration                      |
| `sessions` | managed by connect-mongo                  | Session lookup and expiry                     |

Every sort key in `SORTS` ends with `_id`, which makes the ordering **total** — without it, two
products at the same price can swap places between page 1 and page 2 and a row appears twice. List
reads use `.lean()` (plain objects, no Mongoose hydration), and the facet counts come from a single
aggregation instead of one `countDocuments` per filter value.

## 2.13 Security controls, mapped to code

| Threat               | Control                                                                                                                                                   | File                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| XSS                  | Strict CSP with no `unsafe-inline`; EJS escapes by default; `<%-` used only for the trusted icon sprite                                                   | `app.js`, `views/`                 |
| CSRF                 | Synchronizer token per session, `timingSafeEqual` comparison, `SameSite=Lax` cookie                                                                       | `middleware/csrf.js`               |
| NoSQL injection      | Recursive strip of `$`-prefixed and dotted keys from request bodies; the query parser is pinned to `simple`, so query strings can only ever yield strings | `middleware/sanitize.js`, `app.js` |
| Prototype pollution  | `__proto__`, `constructor`, `prototype` keys dropped by the same sweep                                                                                    | `middleware/sanitize.js`           |
| Session fixation     | `session.regenerate()` on every sign-in and registration                                                                                                  | `services/authService.js`          |
| Session theft        | `httpOnly`, `secure` in production, `SameSite=Lax`, server-side store, rolling expiry                                                                     | `app.js`                           |
| Password disclosure  | bcrypt with cost 12; `passwordHash` has `select: false` so it is never loaded by accident                                                                 | `models/User.js`                   |
| Account enumeration  | One message for unknown email and wrong password; registration conflicts are field errors                                                                 | `services/authService.js`          |
| Brute force          | 20 auth attempts per 15 minutes per IP; 900 API requests per 15 minutes                                                                                   | `middleware/rateLimit.js`          |
| Privilege escalation | Role read from the database on every request; `/admin` behind `requireAdmin`; a read-only flag blocks all writes on the demo admin                        | `middleware/auth.js`               |
| IDOR                 | Order lookups are always filtered by `user`, and return 404 (not 403) so they cannot be used to probe                                                     | `services/orderService.js`         |
| Malicious upload     | MIME allow-list, 1 file, size cap, magic-byte check, stored as an opaque blob and served with a fixed content type                                        | `middleware/upload.js`             |
| Open redirect        | `safeRedirectPath()` accepts only same-site paths for `?next=`                                                                                            | `utils/strings.js`                 |
| Clickjacking         | `frame-ancestors 'none'` + `X-Frame-Options`                                                                                                              | `app.js`                           |
| Payload abuse        | 100 kb body cap, 30-field multipart cap                                                                                                                   | `app.js`, `middleware/upload.js`   |
| Secret leakage       | Every credential comes from the environment; production refuses to boot without a real `SESSION_SECRET` and `MONGODB_URI`                                 | `config/env.js`                    |

---

# Part 3 — Cross-cutting concerns

## 3.1 Configuration

`src/config/env.js` is the only module that reads `process.env`. It parses, validates and freezes a
config object at startup, so a typo in a variable name fails immediately and loudly instead of
producing `undefined` three layers down at request time.

```mermaid
flowchart LR
    E[".env / platform env"] --> P["config/env.js<br/>parse · coerce · default"]
    P --> V{"production?"}
    V -->|yes| G["require MONGODB_URI<br/>require SESSION_SECRET ≥ 32 chars<br/>refuse demo defaults"]
    V -->|no| D["in-memory MongoDB<br/>development secret<br/>seeded demo accounts"]
    G --> C["frozen config object"]
    D --> C
    C --> App["every other module imports this,<br/>never process.env"]
```

## 3.2 Observability

- `GET /health` returns status, database reachability, version and uptime — used by Render, by
  UptimeRobot and by anyone debugging a deploy.
- `morgan` logs one line per request (`dev` locally, `combined` in production).
- The error handler logs the full original error for 5xx only, so logs stay readable.
- `logger` prefixes and timestamps everything and stays silent under test.

## 3.3 Testing strategy

```mermaid
flowchart TB
    subgraph Pyramid[" "]
        direction TB
        E2E["<b>Flow tests</b> — guest cart → register → merge →<br/>checkout → order → invoice → admin fulfilment"]
        INT["<b>HTTP tests</b> — every route through supertest:<br/>status codes, redirects, CSRF, roles, JSON envelopes"]
        UNIT["<b>Unit tests</b> — money · orderStatus · search intent ·<br/>sanitiser · slugs · validators"]
    end
    E2E --> INT --> UNIT
    DBX[("mongodb-memory-server<br/>a real MongoDB per run, dropped afterwards")]
    INT -.-> DBX
    E2E -.-> DBX
```

67 tests run against a **real MongoDB** started in memory — indexes, TTLs, unique constraints and
atomic operators all behave as they will in production, which a mocked model layer could never show.
CI runs the suite on Node 22 and 24 on every push.

## 3.4 Scaling path

The current shape comfortably handles a free-tier deployment. In rough order of what would give way
first, and what to do about it:

| Pressure         | Symptom                                          | Change                                                                                                                                           |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Traffic          | One process saturates a CPU                      | Run N replicas — the app is already stateless, sessions and carts are in MongoDB                                                                 |
| Image bandwidth  | `/media` dominates response time                 | Put a CDN in front, or move blobs to object storage; only `storeImage` and one route change                                                      |
| Catalogue size   | Regex search slows past ~100k products           | Switch `buildTextClauses` to an Atlas Search or `$text` index — it is one function                                                               |
| Write contention | Hot products serialise on the reservation update | Shard stock into per-warehouse documents, or move to a reservation collection with a TTL hold                                                    |
| Reporting        | Dashboard aggregations compete with checkout     | Read from a secondary, or materialise daily rollups                                                                                              |
| Real payments    | A demo gateway is not a gateway                  | Replace the `payment` block in `placeOrder` with a provider intent + webhook; the order state machine already models `PENDING → PAID → REFUNDED` |

None of these is needed today, and each is deliberately confined to one module — which is the point of
the layering described in [1.3](#13-logical-layers-and-the-dependency-rule).
