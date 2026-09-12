'use strict';

const mongoose = require('mongoose');

/** Atomic sequence generator (used for gap-free invoice numbers). */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(name) {
  const counter = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
