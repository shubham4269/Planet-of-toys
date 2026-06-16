// server/src/modules/catalog/filterConfig.service.js
import Attribute from "./attribute.model.js";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";
import { CatalogValidationError } from "./catalog.errors.js";

const TYPES = ["attribute", "price", "category"];

/** Build the synthesized default: all active filterable attributes (ordered) + price. */
async function defaultFilters() {
  const attrs = await Attribute.find({ isFilterable: true, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
  const filters = attrs.map((a, i) => ({ type: "attribute", attributeId: a._id, enabled: true, sortOrder: i }));
  filters.push({ type: "price", attributeId: null, enabled: true, sortOrder: filters.length });
  return filters;
}

/** The synthesized default filter list (all active filterable attributes + price). */
export async function defaultFilterConfig() {
  return defaultFilters();
}

/**
 * Resolve the stored config for a collection, or the synthesized default when
 * none exists. Returns { collectionId, filters, isDefault } with filters sorted.
 */
export async function getFilterConfig(collectionId) {
  const doc = await CollectionFilterConfig.findOne({ collectionId, deletedAt: null });
  if (doc) {
    const json = doc.toJSON();
    json.filters = [...json.filters].sort((x, y) => x.sortOrder - y.sortOrder);
    return { collectionId: String(collectionId), filters: json.filters, isDefault: false };
  }
  return { collectionId: String(collectionId), filters: await defaultFilters(), isDefault: true };
}

/** Validate + persist (replace) a collection's filter config. */
export async function saveFilterConfig(collectionId, filters) {
  if (!Array.isArray(filters)) throw new CatalogValidationError("filters must be an array.");
  const clean = filters.map((f, i) => {
    if (!TYPES.includes(f.type)) throw new CatalogValidationError(`Unknown filter type: ${f.type}.`);
    if (f.type === "attribute" && !f.attributeId) throw new CatalogValidationError("Attribute filters require an attributeId.");
    return {
      type: f.type,
      attributeId: f.type === "attribute" ? f.attributeId : null,
      enabled: f.enabled !== false,
      sortOrder: Number(f.sortOrder) || i,
    };
  });
  const doc = await CollectionFilterConfig.findOneAndUpdate(
    { collectionId },
    { collectionId, filters: clean, deletedAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const json = doc.toJSON();
  json.filters = [...json.filters].sort((x, y) => x.sortOrder - y.sortOrder);
  return { collectionId: String(collectionId), filters: json.filters, isDefault: false };
}
