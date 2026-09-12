'use strict';

const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDatabase, disconnectDatabase } = require('./src/config/db');
const { seedIfEmpty } = require('./src/seed/seedDatabase');
const { createApp } = require('./src/app');

async function start() {
  const { inMemory } = await connectDatabase();
  if (config.seed.auto || inMemory) await seedIfEmpty();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`${config.appName} is running on ${config.appUrl} (${config.env})`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      process.exit(0);
    });
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection:', reason));

start().catch((err) => {
  logger.error('Failed to start the server:', err);
  process.exit(1);
});
