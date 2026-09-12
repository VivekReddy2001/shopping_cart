'use strict';

const ApiError = require('./ApiError');

/** Converts a ZodError into `{ "field.path": "first message" }`. */
function fieldErrors(zodError) {
  const out = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parses `input` with `schema`; throws a 422 ApiError with field details on failure. */
function parseOrThrow(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(fieldErrors(result.error));
  return result.data;
}

module.exports = { fieldErrors, parseOrThrow };
