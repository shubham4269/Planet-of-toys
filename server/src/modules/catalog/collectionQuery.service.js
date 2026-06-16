// server/src/modules/catalog/collectionQuery.service.js
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";

/** Sort key → Mongo sort spec. Extensible: analytics later only fills salesCount. */
export const SORT_SPECS = Object.freeze({
  featured: { merchandisingRank: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  "price-asc": { price: 1 },
  "price-desc": { price: -1 },
  name: { name: 1 },
  "best-selling": { salesCount: -1, createdAt: -1 },
});

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/** Card projection exposed to the storefront grid. */
function toCard(doc) {
  const j = doc.toJSON();
  return { id: j.id, slug: j.slug, name: j.name, price: j.price, compareAtPrice: j.compareAtPrice,
    discountPercent: j.discountPercent, images: j.images };
}

/** Build the AND conditions from query params (attribute/price/category). */
async function buildConditions(query) {
  const and = [];
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith("f_") || !raw) continue;
    const attrSlug = key.slice(2);
    const valueSlugs = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    if (!valueSlugs.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const attr = await Attribute.findOne({ slug: attrSlug, deletedAt: null });
    if (!attr) continue;
    // eslint-disable-next-line no-await-in-loop
    const vals = await AttributeValue.find({ attributeId: attr._id, slug: { $in: valueSlugs }, deletedAt: null });
    const ids = vals.map((v) => v._id);
    if (ids.length) and.push({ attributeValueIds: { $in: ids } }); // OR within attribute
  }
  const priceMatch = /^(\d+)-(\d+)$/.exec(query.price || "");
  if (priceMatch) and.push({ price: { $gte: Number(priceMatch[1]), $lte: Number(priceMatch[2]) } });
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category, deletedAt: null });
    if (cat) and.push({ categoryIds: cat._id });
  }
  return and;
}

/**
 * Filter + sort + paginate a collection's manually-assigned active products.
 * Returns null when the slug does not resolve to an active collection.
 *
 * @param {string} slug collection slug
 * @param {Record<string,string>} query flat query params (f_<attrSlug>, price, category, sort, page, limit)
 */
export async function queryCollectionProducts(slug, query = {}) {
  const collection = await Collection.findOne({ slug, isActive: true, deletedAt: null });
  if (!collection) return null;

  const base = { collectionIds: collection._id, active: true };
  const and = await buildConditions(query);
  const filter = and.length ? { ...base, $and: and } : base;

  const sort = SORT_SPECS[query.sort] || SORT_SPECS.featured;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const total = await Product.countDocuments(filter);
  const docs = await Product.find(filter).sort(sort).skip(skip).limit(limit);
  return {
    products: docs.map(toCard),
    total,
    page,
    limit,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    appliedFilters: { sort: query.sort || "featured", page, limit },
  };
}
