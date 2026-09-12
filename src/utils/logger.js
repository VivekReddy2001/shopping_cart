'use strict';

/** Minimal levelled logger (keeps dependencies small; swap for pino/winston if needed). */
const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };

const configured = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
const threshold = LEVELS[configured] ?? LEVELS.info;

function write(level, args) {
  if (LEVELS[level] > threshold) return;
  const stamp = new Date().toISOString();
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[method](`[${stamp}] ${level.toUpperCase().padEnd(5)}`, ...args);
}

module.exports = {
  error: (...args) => write('error', args),
  warn: (...args) => write('warn', args),
  info: (...args) => write('info', args),
  debug: (...args) => write('debug', args),
};
