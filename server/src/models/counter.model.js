import mongoose from "mongoose";

/**
 * Counter model (Req 8).
 *
 * Backs atomic order-id generation. Each issued code is reserved as a document
 * keyed `order-id-<CODE>`; the unique `_id` index guarantees a code can be
 * claimed by exactly one caller, so identifiers are never duplicated
 * (Req 8.2, 8.3). (Historic per-day `order-YYMMDD` sequence documents from the
 * previous format may coexist harmlessly.)
 */

const { Schema } = mongoose;

const counterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

export default Counter;
