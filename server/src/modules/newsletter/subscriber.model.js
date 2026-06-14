import mongoose from "mongoose";

/**
 * NewsletterSubscriber — emails captured by the footer signup. Collection-only
 * (no campaigns/sending). Email is unique (dedup). ipAddress/userAgent are
 * optional, captured at subscribe time, admin-only (never in public output).
 */
const { Schema } = mongoose;

const subscriberSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ["subscribed", "unsubscribed"], default: "subscribed" },
    source: { type: String, default: "footer" },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const NewsletterSubscriber =
  mongoose.models.NewsletterSubscriber || mongoose.model("NewsletterSubscriber", subscriberSchema);

export default NewsletterSubscriber;
