import mongoose from "mongoose";

/**
 * NavigationItem model — FOUNDATION ONLY for Sub-project A (no admin UI or
 * storefront rendering yet; those are Sub-project C). A menu entry can point at a
 * Category, a Collection, an internal route, or an external URL. `parentId`
 * reserves nested menus. Archived via `deletedAt`.
 */
const { Schema } = mongoose;

export const NAV_TARGET_TYPES = Object.freeze(["category", "collection", "internalRoute", "externalUrl"]);
export const NAV_MENUS = Object.freeze(["header", "mobile", "footer", "promo"]);

const navigationItemSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    targetType: { type: String, enum: NAV_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    url: { type: String, default: "" },
    menu: { type: String, enum: NAV_MENUS, default: "header" },
    parentId: { type: Schema.Types.ObjectId, ref: "NavigationItem", default: null },
    sortOrder: { type: Number, default: 0 },
    openInNewTab: { type: Boolean, default: false },
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

const NavigationItem =
  mongoose.models.NavigationItem || mongoose.model("NavigationItem", navigationItemSchema);
export default NavigationItem;
