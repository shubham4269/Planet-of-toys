import mongoose from "mongoose";

/**
 * UnmatchedWebhookEvent model (Req 12.4, 24.3).
 *
 * Records inbound webhooks that match no existing order or fail authenticity
 * verification, capturing the raw payload, the receipt time, and the reason so
 * no order is mutated while the event is still retained for review.
 */

const { Schema } = mongoose;

const unmatchedWebhookEventSchema = new Schema(
  {
    payload: { type: Schema.Types.Mixed, required: true },
    receivedAt: { type: Date, required: true, default: Date.now },
    reason: { type: String, required: true, trim: true },
  },
  {
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

const UnmatchedWebhookEvent =
  mongoose.models.UnmatchedWebhookEvent ||
  mongoose.model("UnmatchedWebhookEvent", unmatchedWebhookEventSchema);

export default UnmatchedWebhookEvent;
