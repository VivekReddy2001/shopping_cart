# Security policy

Kartly is a portfolio project, but it is built to production security practices — the controls
below are implemented and tested, not aspirational. If you are reviewing the code, the
[security section of the architecture document](docs/ARCHITECTURE.md#213-security-controls-mapped-to-code)
maps each threat to the file that handles it.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Open a
[private security advisory](https://github.com/VivekReddy2001/shopping_cart/security/advisories/new)
instead, or email the address on the maintainer's GitHub profile. Include the steps to
reproduce and, if you have one, a proof of concept. You will get an acknowledgement within a
few days.

## What is in place

| Area           | Control                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords      | bcrypt, cost 12. Hashes are `select: false`, so they are never loaded unless a login explicitly asks for them.                                                                                        |
| Sessions       | Server-side store in MongoDB, `httpOnly` + `SameSite=Lax` cookies, `secure` in production, rolling expiry, regenerated on sign-in.                                                                    |
| CSRF           | Per-session synchronizer token, compared with `timingSafeEqual`, required on every POST, PATCH and DELETE.                                                                                            |
| Injection      | Request bodies are swept of `$`-prefixed, dotted and prototype-polluting keys before anything else sees them; the query parser is pinned to `simple`, so query strings can only ever produce strings. |
| XSS            | A strict Content-Security-Policy with **no** `unsafe-inline` for scripts or styles. EJS escapes by default.                                                                                           |
| Access control | Roles are read from the database on every request, not trusted from the session. The public demo admin is flagged read-only and every write it attempts is refused.                                   |
| Enumeration    | Sign-in returns one message for both unknown emails and wrong passwords. Other people's orders return 404, not 403.                                                                                   |
| Brute force    | 20 authentication attempts per IP per 15 minutes; 900 API requests per IP per 15 minutes.                                                                                                             |
| Uploads        | MIME allow-list, one file, 2 MB cap, and a magic-byte check that rejects a renamed non-image. Files are stored as opaque blobs and always served with the detected content type.                      |
| Redirects      | `?next=` accepts same-site paths only.                                                                                                                                                                |
| Secrets        | Nothing is hard-coded. Production refuses to start without a real `MONGODB_URI` and a `SESSION_SECRET` of at least 32 characters.                                                                     |
| Dependencies   | `npm audit` is clean, and Dependabot opens weekly update PRs.                                                                                                                                         |

## What is deliberately not production-grade

This is a demo store, and two things are simulated on purpose:

- **Payments.** "Online payment" generates a fake transaction id. There is no gateway, no card
  data is collected, and nothing is charged. The order state machine already models
  `PENDING → PAID → REFUNDED`, so a real provider would slot in at checkout plus a webhook.
- **Email.** Without SMTP credentials, transactional mail is logged instead of sent.

## Supported versions

The `main` branch is the only supported version.
