import mongoose from "mongoose";

/**
 * Attribute model — powers the dynamic filter system (Age Group, Skill, Theme …).
 * `displayType` selects the storefront control; `isFilterable` gates exposure to
 * the public filter list. Values live in the AttributeValue model. Archived via
 * `deletedAt`. `toJSON` maps `_id`->`id`.
 */
const { Schema } = mongoose;

export const DISPLAY_TYPES = Object.freeze(["checkbox", "radio", "dropdown", "color", "button", "range"]);

const attributeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    displayType: { type: String, enum: DISPLAY_TYPES, required: true },
    sortOrder: { type: Number, default: 0 },
    isFilterable: { type: Boolean, default: true },
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

const Attribute = mongoose.models.Attribute || mongoose.model("Attribute", attributeSchema);
export default Attribute;
