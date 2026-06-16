import mongoose from "mongoose";

/**
 * AttributeValue model — an individual option under an Attribute (e.g. "0-12
 * Months" under "Age Group"). `swatchHex` is only meaningful when the parent
 * Attribute's displayType is "color". Unique per (attributeId, slug) so the same
 * slug may exist under different attributes. Archived via `deletedAt`.
 */
const { Schema } = mongoose;

const attributeValueSchema = new Schema(
  {
    attributeId: { type: Schema.Types.ObjectId, ref: "Attribute", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    swatchHex: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
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

attributeValueSchema.index({ attributeId: 1, slug: 1 }, { unique: true });

const AttributeValue =
  mongoose.models.AttributeValue || mongoose.model("AttributeValue", attributeValueSchema);
export default AttributeValue;
