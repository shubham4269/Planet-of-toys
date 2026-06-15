// server/src/modules/catalog/category.model.js
import mongoose from "mongoose";

/**
 * Category model — product organization as a self-referential tree (unlimited
 * depth via `parentId`). Carries card/hero media references (filenames served
 * from /api/media) and long-form content fields that later sub-projects (landing
 * pages) build on. Soft-deleted via `deletedAt` (archive/restore); archived rows
 * are excluded from public reads by the service. `toJSON` maps `_id`->`id`.
 */
const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    image: { type: String, default: null },
    heroTitle: { type: String, default: "" },
    heroSubtitle: { type: String, default: "" },
    heroImage: { type: String, default: null },
    seoContent: { type: String, default: "" },
    description: { type: String, default: "" },
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

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
export default Category;
