'use strict';

const multer = require('multer');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Product image uploads are kept in memory, validated, then stored in MongoDB. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 30 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(
      ApiError.badRequest('Only JPEG, PNG, WebP or GIF images are allowed.', 'INVALID_FILE_TYPE')
    );
  },
});

/** Checks the file's magic bytes so a renamed non-image is rejected. */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

module.exports = { upload, detectImageType };
