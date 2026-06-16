import mongoose from "mongoose";

/**
 * HeroSlide — one homepage hero slide. `type` is the semantic purpose; `displayMode`
 * is the layout (decoupled, so the same campaign can render in different layouts).
 * Scheduling (startDate/endDate), priority/sortOrder, Draft/Published status,
 * soft-delete (deletedAt), and analytics counters apply to all slide types.
 * Media are filenames served via /api/media. `meta` reserves room for future types.
 */
const { Schema } = mongoose;

export const HERO_TYPES = Object.freeze(["campaign", "product", "video", "collection", "category", "seasonal"]);
export const HERO_DISPLAY_MODES = Object.freeze(["full_banner", "video", "split", "collection_grid", "event"]);
export const HERO_CTA_TYPES = Object.freeze(["product", "collection", "category", "customUrl", "none"]);
export const HERO_STATUSES = Object.freeze(["draft", "published"]);

const heroSlideSchema = new Schema(
  {
    type: { type: String, enum: HERO_TYPES, required: true },
    displayMode: { type: String, enum: HERO_DISPLAY_MODES, required: true },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    ctaText: { type: String, default: "" },
    ctaType: { type: String, enum: HERO_CTA_TYPES, default: "none" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    customUrl: { type: String, default: "" },
    desktopMedia: { type: String, default: null },
    mobileMedia: { type: String, default: null },
    video: { type: String, default: null },
    posterImage: { type: String, default: null },
    gridProductIds: { type: [{ type: Schema.Types.ObjectId, ref: "Product" }], default: [] },
    status: { type: String, enum: HERO_STATUSES, default: "draft", index: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null, index: true },
    startDate: { type: Date, default: null, index: true },
    endDate: { type: Date, default: null, index: true },
    priority: { type: Number, default: 0 },
    sortOrder: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed, default: {} },
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

heroSlideSchema.index({ priority: -1, sortOrder: 1 });

const HeroSlide = mongoose.models.HeroSlide || mongoose.model("HeroSlide", heroSlideSchema);
export default HeroSlide;
