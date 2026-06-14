import mongoose from "mongoose";

/**
 * FooterContent — CMS-managed storefront footer (singleton, like SystemSettings/
 * PromoBanner). Colors are NOT stored (token-driven on the client). toJSON maps
 * every _id (doc + nested array subdocs) to `id` and strips internal fields.
 */
const { Schema } = mongoose;

const linkSchema = new Schema(
  { label: { type: String, default: "" }, url: { type: String, default: "" }, enabled: { type: Boolean, default: true } },
  { _id: true }
);
const columnSchema = new Schema(
  { title: { type: String, default: "" }, enabled: { type: Boolean, default: true }, links: { type: [linkSchema], default: [] } },
  { _id: true }
);
const socialSchema = new Schema(
  { platform: { type: String, enum: ["facebook", "instagram", "youtube", "whatsapp", "twitter"], required: true }, url: { type: String, default: "" } },
  { _id: true }
);
const trustSchema = new Schema(
  { iconKey: { type: String, enum: ["shield", "truck", "lock", "gift", "star", "heart"], default: "shield" }, title: { type: String, default: "" }, subtitle: { type: String, default: "" } },
  { _id: true }
);
const bottomLinkSchema = new Schema(
  { label: { type: String, default: "" }, url: { type: String, default: "" }, enabled: { type: Boolean, default: true } },
  { _id: true }
);

/** Recursively map `_id`->`id` on a plain object tree (doc + nested subdocs). */
function mapIds(node) {
  if (Array.isArray(node)) { node.forEach(mapIds); return; }
  if (node && typeof node === "object" && !(node instanceof Date)) {
    if (node._id !== undefined) {
      // Convert ObjectId to string so the assigned `id` is a plain value
      // and doesn't trigger BSON's internal setter, preventing infinite recursion.
      node.id = node._id.toString ? node._id.toString() : node._id;
      delete node._id;
    }
    for (const key of Object.keys(node)) {
      const val = node[key];
      // Only recurse into plain objects and arrays; skip primitives and BSON types.
      if (val && typeof val === "object" && !(val instanceof Date) && typeof val.toString !== "undefined" && !val._bsontype) {
        mapIds(val);
      }
    }
  }
}

const footerContentSchema = new Schema(
  {
    singleton: { type: String, default: "footer", unique: true, immutable: true },
    enabled: { type: Boolean, default: true },
    columns: { type: [columnSchema], default: [] },
    newsletter: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
      placeholder: { type: String, default: "Enter your email" },
      buttonLabel: { type: String, default: "Subscribe" },
    },
    membershipPromo: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      buttonLabel: { type: String, default: "" },
      buttonUrl: { type: String, default: "" },
    },
    social: { type: [socialSchema], default: [] },
    contact: {
      companyName: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
      supportHours: { type: String, default: "" },
    },
    trustHighlights: { type: [trustSchema], default: [] },
    bottomLinks: { type: [bottomLinkSchema], default: [] },
    copyrightText: { type: String, default: "" },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: {
      transform(_doc, ret) {
        mapIds(ret);
        delete ret.__v;
        delete ret.singleton;
        return ret;
      },
    },
  }
);

const FooterContent =
  mongoose.models.FooterContent || mongoose.model("FooterContent", footerContentSchema);

export default FooterContent;
