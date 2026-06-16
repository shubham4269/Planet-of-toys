// server/src/modules/catalog/filterResolver.service.js
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import { getFilterConfig } from "./filterConfig.service.js";

/** Min/max product price within a collection's active products (0/0 if empty). */
async function priceRange(collectionId) {
  const oid = new mongoose.Types.ObjectId(String(collectionId));
  const rows = await Product.aggregate([
    { $match: { collectionIds: oid, active: true } },
    { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
  ]);
  if (!rows.length) return { min: 0, max: 0 };
  return { min: rows[0].min ?? 0, max: rows[0].max ?? 0 };
}

/** Distinct category options among a collection's active products. */
async function categoryOptions(collectionId) {
  const ids = await Product.distinct("categoryIds", { collectionIds: collectionId, active: true });
  if (!ids.length) return [];
  const cats = await Category.find({ _id: { $in: ids }, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
  return cats.map((c) => ({ slug: c.slug, name: c.name }));
}

/**
 * Turn a collection's filter config (or synthesized default) into display-ready
 * filter definitions for the storefront. Only enabled entries; attribute values
 * pulled live. Attribute entries whose attribute is missing/archived are skipped.
 *
 * @returns {Array<object>} definitions:
 *   attribute → { key:"f_<slug>", type:"attribute", attributeSlug, name, displayType, values:[{slug,name,swatchHex}] }
 *   price     → { key:"price", type:"price", min, max }
 *   category  → { key:"category", type:"category", options:[{slug,name}] }
 */
export async function resolveFilters(collectionId) {
  const { filters } = await getFilterConfig(collectionId);
  const enabled = filters.filter((f) => f.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
  const defs = [];
  for (const f of enabled) {
    if (f.type === "attribute") {
      // eslint-disable-next-line no-await-in-loop
      const attr = await Attribute.findOne({ _id: f.attributeId, isActive: true, deletedAt: null });
      if (!attr) continue;
      // eslint-disable-next-line no-await-in-loop
      const values = await AttributeValue.find({ attributeId: attr._id, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
      defs.push({
        key: `f_${attr.slug}`, type: "attribute", attributeSlug: attr.slug, name: attr.name,
        displayType: attr.displayType,
        values: values.map((v) => ({ slug: v.slug, name: v.name, swatchHex: v.swatchHex ?? null })),
      });
    } else if (f.type === "price") {
      // eslint-disable-next-line no-await-in-loop
      const { min, max } = await priceRange(collectionId);
      defs.push({ key: "price", type: "price", min, max });
    } else if (f.type === "category") {
      // eslint-disable-next-line no-await-in-loop
      const options = await categoryOptions(collectionId);
      defs.push({ key: "category", type: "category", options });
    }
  }
  return defs;
}
