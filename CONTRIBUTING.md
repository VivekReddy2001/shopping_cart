# Contributing

Thanks for taking a look. This is a personal project, but issues and pull requests are welcome.

## Getting set up

```bash
git clone https://github.com/VivekReddy2001/shopping_cart.git
cd shopping_cart
npm install
npm run dev
```

No database installation is needed: when `MONGODB_URI` is unset outside production the app
starts an in-memory MongoDB and seeds the full demo catalogue, so `npm run dev` gives you a
working store on <http://localhost:3000> straight away. Copy `.env.example` to `.env` if you
want to point at a real database or change the store settings.

## Before you open a pull request

```bash
npm run lint      # ESLint, flat config
npm run format    # Prettier
npm test          # Jest + Supertest against a real in-memory MongoDB
```

All three must pass — CI runs them on Node 20 and 22 and will block the merge otherwise.

## How the code is organised

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first; the short version is:

```
routes → controllers → services → models
```

and dependencies only ever point right. A few conventions that keep it that way:

- **Business rules live in services.** Controllers parse the request, pick a response format and
  nothing else. If you find yourself writing a Mongoose query in a controller, it belongs in a
  service.
- **The website and the API share those services.** A rule fixed in one is fixed in both. Never
  add a second code path for the JSON endpoints.
- **Validate with zod**, in `src/validators`. Body schemas throw a 422 with per-field messages;
  query schemas use `.catch()` so a junk query string degrades to defaults instead of erroring.
- **Throw `ApiError`.** One error handler turns it into a JSON envelope or a rendered page.
- **No inline scripts or styles.** The CSP forbids them. Handlers go in `public/js`, styles in
  `public/css/app.css`.
- **Pages work without JavaScript.** Interactive controls are real forms first; JavaScript
  intercepts the submit and calls the API. Add the fallback route when you add the control.
- **Money goes through `src/utils/money.js`**, never raw floating-point arithmetic.
- **Order statuses go through `src/utils/orderStatus.js`**, which owns the transition table.

## Tests

Tests run against a real MongoDB started in memory, so indexes, TTLs, unique constraints and
atomic operators behave as they do in production. Use the helpers in `tests/helpers.js` rather
than building fixtures by hand, and add a test for the behaviour you are changing — especially
for stock, pricing, permissions and order transitions.

## Commit messages

Short, imperative, and describing the change rather than the file: `fix: keep guest carts when
signing in`, not `update authController.js`.
