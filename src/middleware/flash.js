'use strict';

/** Tiny session-backed flash messages (shown once after a redirect). */
function flash(req, res, next) {
  req.flash = (type, message) => {
    if (!req.session) return;
    if (!req.session.flash) req.session.flash = [];
    req.session.flash.push({ type, message });
  };
  res.locals.flashMessages = (req.session && req.session.flash) || [];
  if (req.session && req.session.flash) delete req.session.flash;
  next();
}

module.exports = { flash };
