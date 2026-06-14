import mongoose from "mongoose";

/**
 * PromoBanner model — the storefront promotional header (announcement bar).
 *
 * Stored as a SINGLETON document (one row, like SystemSettings) keyed by a
 * fixed `singleton` value with a unique index so a second document can never be
 * created. Banner-level fields hold defaults; `announcements` is the ordered
 * list of rotating slides (array order is the display order). Per-slide
 * scheduling (`startAt`/`endAt`), device targeting (`showOnMobile`/
 * `showOnDesktop`) and an `enabled` flag let the public endpoint and storefront
 * decide what to show. The `toJSON` transform maps `_id`->`id` (banner and each
 * announcement) and strips internal fields, consistent with other models.
 */
const { Schema } = mongoose;

const announcementSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    url: { type: String, default: null },
    couponCode: { type: String, default: null },
    bgColor: { type: String, default: null },
    textColor: { type: String, default: null },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    showOnMobile: { type: Boolean, default: true },
    showOnDesktop: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: true }
);

const promoBannerSchema = new Schema(
  {
    // Fixed discriminator that enforces a single document.
    singleton: {
      type: String,
      default: "promoBanner",
      unique: true,
      immutable: true,
    },
    enabled: { type: Boolean, default: false },
    bgColor: { type: String, default: "#E11B22" },
    textColor: { type: String, default: "#FFFFFF" },
    rotationIntervalMs: { type: Number, default: 5000 },
    rightText: { type: String, default: null },
    announcements: { type: [announcementSchema], default: [] },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.singleton;
        if (Array.isArray(ret.announcements)) {
          ret.announcements = ret.announcements.map((a) => {
            const out = { ...a, id: a._id };
            delete out._id;
            return out;
          });
        }
        return ret;
      },
    },
  }
);

const PromoBanner =
  mongoose.models.PromoBanner ||
  mongoose.model("PromoBanner", promoBannerSchema);

export default PromoBanner;
