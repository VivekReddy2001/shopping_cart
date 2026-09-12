'use strict';

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../utils/logger');

let memoryServer = null;

const redact = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

/**
 * Connects Mongoose to MongoDB.
 * When MONGODB_URI is not set outside production, an in-memory MongoDB is
 * started so the project runs with zero setup (`npm install && npm run dev`).
 */
async function connectDatabase(uri = config.mongoUri) {
  let mongoUri = uri;
  let inMemory = false;

  if (!mongoUri) {
    if (config.isProduction) throw new Error('MONGODB_URI is required in production');
    let MongoMemoryServer;
    try {
      ({ MongoMemoryServer } = require('mongodb-memory-server'));
    } catch {
      throw new Error(
        'MONGODB_URI is not set and mongodb-memory-server is not installed. ' +
          'Set MONGODB_URI in .env or run `npm install` (with dev dependencies).'
      );
    }
    memoryServer = await MongoMemoryServer.create();
    mongoUri = memoryServer.getUri('kartly');
    inMemory = true;
    logger.warn('MONGODB_URI is not set — using an in-memory MongoDB. Data resets on restart.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  logger.info(`MongoDB connected (${inMemory ? 'in-memory' : redact(mongoUri)})`);
  return { inMemory };
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

/** Round-trips to the database; used by the /health endpoint. */
async function pingDatabase() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { connectDatabase, disconnectDatabase, pingDatabase };
