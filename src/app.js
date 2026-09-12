'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');

const config = require('./config/env');
const viewHelpers = require('./utils/viewHelpers');
const { sanitizeInput } = require('./middleware/sanitize');
const { csrfProtection } = require('./middleware/csrf');
const { attachUser } = require('./middleware/auth');
const { flash } = require('./middleware/flash');
const { pageLocals } = require('./middleware/locals');
const { notFound, errorHandler } = require('./middleware/error');

const systemRoutes = require('./routes/system');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
const adminRoutes = require('./routes/web/admin');

/**
 * Builds the Express application (without listening), so tests can mount it
 * with supertest and `server.js` can start it for real.
 */
function createApp({ sessionStore } = {}) {
  const app = express();

  app.disable('x-powered-by');
  // 'simple' never builds nested objects from a query string, so `?email[$ne]=`
  // can only ever arrive as a plain string. Set explicitly rather than inherited.
  app.set('query parser', 'simple');
  app.set('trust proxy', config.trustProxy);
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.set('layout', 'layouts/main');
  Object.assign(app.locals, viewHelpers);
  app.use(expressLayouts);

  /* Security headers — strict CSP: no inline scripts or styles anywhere. */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: config.secureCookies ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use((_req, res, next) => {
    // Voice search needs the microphone on our own origin only.
    res.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=(), payment=()');
    next();
  });
  app.use(compression());
  if (!config.isTest) app.use(morgan(config.isProduction ? 'combined' : 'dev'));

  /* Static assets (no session needed). */
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      index: false,
      maxAge: config.isProduction ? '7d' : 0,
      setHeaders(res, filePath) {
        if (/[\\/](fonts|images)[\\/]/.test(filePath) && config.isProduction) {
          res.setHeader('Cache-Control', 'public, max-age=2592000');
        }
      },
    })
  );
  app.use(systemRoutes); // /health and /media — before sessions so monitors don't create sessions

  /* Body parsing + input hardening. */
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(sanitizeInput);

  /* Sessions stored in MongoDB (connect-mongo). */
  app.use(
    session({
      name: 'kartly.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store:
        sessionStore ||
        MongoStore.create({
          client: mongoose.connection.getClient(),
          collectionName: 'sessions',
          ttl: config.sessionMaxAgeDays * 24 * 60 * 60,
          autoRemove: 'native',
          touchAfter: 12 * 60 * 60,
          stringify: false,
        }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        maxAge: config.sessionMaxAgeDays * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(flash);
  app.use(csrfProtection);
  app.use(attachUser);

  /* Routes */
  app.use('/api/v1', apiRoutes);
  app.use(pageLocals);
  app.use('/admin', adminRoutes);
  app.use(webRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
