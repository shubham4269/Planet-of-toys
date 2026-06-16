import mongoose from "mongoose";

/**
 * CollectionFilterConfig — the per-collection source of truth for which filters
 * appear on its storefront page, and in what order. Each entry is an
 * attribute-driven filter (type "attribute" + attributeId) or a built-in
 * ("price" / "category"). Absent config ⇒ the service synthesizes a default
 * (all active filterable attributes + price). One config per collection.
 */
const { Schema } = mongoose;

const filterEntrySchema = new Schema(
  {
    type: { type: String, enum: ["attribute", "price", "category"], required: true },
    attributeId: { type: Schema.Types.ObjectId, ref: "Attribute", default: null },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const collectionFilterConfigSchema = new Schema(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", required: true, unique: true, index: true },
    filters: { type: [filterEntrySchema], default: [] },
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

const CollectionFilterConfig =
  mongoose.models.CollectionFilterConfig ||
  mongoose.model("CollectionFilterConfig", collectionFilterConfigSchema);
export default CollectionFilterConfig;
