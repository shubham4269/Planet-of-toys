import mongoose from "mongoose";

/**
 * Collection model — dynamic product groups (New Arrivals, STEM Toys, 0-12
 * Months …). `mode` reserves manual/rules/hybrid membership (rule evaluation is
 * Sub-project B). Merchandising/navigation flags and content fields are
 * foundation for later sub-projects. Archived via `deletedAt`. `toJSON` maps
 * `_id`->`id`.
 */
const { Schema } = mongoose;

const collectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, default: "" },
    mode: { type: String, enum: ["manual", "rules", "hybrid"], default: "manual" },
    featuredOnHome: { type: Boolean, default: false },
    showInNavigation: { type: Boolean, default: false },
    navigationLabel: { type: String, default: "" },
    navigationOrder: { type: Number, default: 0 },
    heroTitle: { type: String, default: "" },
    heroSubtitle: { type: String, default: "" },
    heroImage: { type: String, default: null },
    seoContent: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
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

const Collection = mongoose.models.Collection || mongoose.model("Collection", collectionSchema);
export default Collection;
