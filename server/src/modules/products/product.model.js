import mongoose from "mongoose";

/**
 * Product model (Req 1, 16).
 *
 * Represents the single-product storefront entity. The discount percentage is
 * derived from `price` and `compareAtPrice` and kept in sync on every save so
 * persisted reads are self-consistent (Req 1.1). `stock === 0` drives the
 * out-of-stock UI and `active === false` (or an unknown slug) yields a
 * not-found result (Req 1.5, 1.6, 16).
 */

const { Schema } = mongoose;

/** Embedded key/value specification entry. */
const specificationSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false }
);

/** Embedded FAQ entry. */
const faqSchema = new Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false }
);

/**
 * Embedded color variation. Each variant carries its own stock and images so
 * inventory and display are tracked per color. Products with an empty
 * `variants` array behave as single-variant products via the top-level
 * `stock`/`images` fields.
 */
const variantSchema = new Schema(
  {
    color: { type: String, required: true, trim: true },
    stock: { type: Number, required: true, default: 0, min: 0 },
    images: { type: [String], default: [] },
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: 0, min: 0 },
    // Derived from price/compareAtPrice in the pre-validate hook below.
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    description: { type: String, default: "" },
    features: { type: [String], default: [] },
    specifications: { type: [specificationSchema], default: [] },
    faqs: { type: [faqSchema], default: [] },
    // Media references are stored as filenames/paths served from /server/media.
    images: { type: [String], default: [] },
    video: { type: String, default: null },
    trustBadges: { type: [String], default: [] },
    stock: { type: Number, required: true, default: 0, min: 0 },
    // Optional color variations with per-color stock and images.
    variants: { type: [variantSchema], default: [] },
    active: { type: Boolean, required: true, default: true },
    // Catalog taxonomy references (Sub-project A). Flat id arrays; attribute
    // grouping is derived via AttributeValue.attributeId. Indexed for filter
    // queries (Sub-project B).
    categoryIds: { type: [{ type: Schema.Types.ObjectId, ref: "Category" }], default: [], index: true },
    collectionIds: { type: [{ type: Schema.Types.ObjectId, ref: "Collection" }], default: [], index: true },
    attributeValueIds: { type: [{ type: Schema.Types.ObjectId, ref: "AttributeValue" }], default: [], index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: false,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Compute the bounded discount percentage from price and compareAtPrice.
 * `round((compareAtPrice - price) / compareAtPrice * 100)`, clamped to [0, 100].
 * When there is no valid compare-at price, the discount is 0 (Req 1.1).
 */
export function computeDiscountPercent(price, compareAtPrice) {
  if (
    typeof compareAtPrice !== "number" ||
    compareAtPrice <= 0 ||
    typeof price !== "number" ||
    price >= compareAtPrice
  ) {
    return 0;
  }
  const pct = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  return Math.min(100, Math.max(0, pct));
}

productSchema.pre("validate", function computeDiscount(next) {
  this.discountPercent = computeDiscountPercent(this.price, this.compareAtPrice);
  next();
});

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

export default Product;
