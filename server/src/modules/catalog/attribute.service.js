// server/src/modules/catalog/attribute.service.js
import Attribute, { DISPLAY_TYPES } from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

const ATTR_WRITABLE = ["name", "displayType", "sortOrder", "isFilterable", "isActive"];
const VALUE_WRITABLE = ["name", "swatchHex", "sortOrder", "isActive"];

function pick(keys, input) {
  const out = {};
  for (const k of keys) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validateDisplayType(displayType) {
  if (!DISPLAY_TYPES.includes(displayType)) {
    throw new CatalogValidationError(`displayType must be one of: ${DISPLAY_TYPES.join(", ")}.`);
  }
}

/** Attach each attribute's values (sorted). */
async function withValues(attrDocs, { includeArchived }) {
  const ids = attrDocs.map((a) => a._id);
  const valueQuery = includeArchived
    ? { attributeId: { $in: ids } }
    : { attributeId: { $in: ids }, deletedAt: null };
  const values = await AttributeValue.find(valueQuery).sort({ sortOrder: 1, name: 1 });
  const byAttr = new Map();
  for (const v of values) {
    const key = String(v.attributeId);
    if (!byAttr.has(key)) byAttr.set(key, []);
    byAttr.get(key).push(v.toJSON());
  }
  return attrDocs.map((a) => ({ ...a.toJSON(), values: byAttr.get(String(a._id)) || [] }));
}

export async function listAttributes({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const attrs = await Attribute.find(query).sort({ sortOrder: 1, name: 1 });
  return withValues(attrs, { includeArchived });
}

export async function listPublicAttributes() {
  const attrs = await Attribute.find({ isFilterable: true, isActive: true, deletedAt: null })
    .sort({ sortOrder: 1, name: 1 });
  const full = await withValues(attrs, { includeArchived: false });
  // Public values must also be active.
  return full.map((a) => ({ ...a, values: a.values.filter((v) => v.isActive) }));
}

export async function getAttributeById(id) {
  const doc = await Attribute.findById(id);
  if (!doc) return null;
  const [withVals] = await withValues([doc], { includeArchived: true });
  return withVals;
}

export async function createAttribute(input = {}) {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new CatalogValidationError("Attribute name is required.");
  }
  validateDisplayType(input.displayType);
  const data = pick(ATTR_WRITABLE, input);
  data.name = input.name.trim();
  data.slug = await uniqueSlug(Attribute, slugify(input.slug || data.name));
  const doc = await Attribute.create(data);
  return { ...doc.toJSON(), values: [] };
}

export async function updateAttribute(id, input = {}) {
  const doc = await Attribute.findById(id);
  if (!doc) throw new CatalogValidationError("Attribute not found.", 404);
  const data = pick(ATTR_WRITABLE, input);
  if (data.displayType !== undefined) validateDisplayType(data.displayType);
  if (data.name !== undefined) {
    if (data.name.trim() === "") throw new CatalogValidationError("Attribute name is required.");
    data.name = data.name.trim();
  }
  if (input.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(Attribute, slugify(input.slug || data.name || doc.name), doc._id);
  }
  Object.assign(doc, data);
  await doc.save();
  return getAttributeById(id);
}

export async function archiveAttribute(id) {
  const doc = await Attribute.findById(id);
  if (!doc) throw new CatalogValidationError("Attribute not found.", 404);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreAttribute(id) {
  const doc = await Attribute.findById(id);
  if (!doc) throw new CatalogValidationError("Attribute not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorderAttributes(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(items.map((it) => Attribute.updateOne({ _id: it.id }, { $set: { sortOrder: Number(it.sortOrder) || 0 } })));
  return listAttributes({ includeArchived: false });
}

// ----- inline values -----

export async function addValue(attributeId, input = {}) {
  const attr = await Attribute.findById(attributeId);
  if (!attr) throw new CatalogValidationError("Attribute not found.", 404);
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new CatalogValidationError("Value name is required.");
  }
  const data = pick(VALUE_WRITABLE, input);
  data.attributeId = attributeId;
  data.name = input.name.trim();
  data.slug = await uniqueSlug(AttributeValue, slugify(input.slug || data.name), null, { attributeId });
  const doc = await AttributeValue.create(data);
  return doc.toJSON();
}

export async function updateValue(id, input = {}) {
  const doc = await AttributeValue.findById(id);
  if (!doc) throw new CatalogValidationError("Value not found.", 404);
  const data = pick(VALUE_WRITABLE, input);
  if (data.name !== undefined) {
    if (data.name.trim() === "") throw new CatalogValidationError("Value name is required.");
    data.name = data.name.trim();
  }
  if (input.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(
      AttributeValue, slugify(input.slug || data.name || doc.name), doc._id, { attributeId: doc.attributeId }
    );
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveValue(id) {
  const doc = await AttributeValue.findById(id);
  if (!doc) throw new CatalogValidationError("Value not found.", 404);
  const productCount = await Product.countDocuments({ attributeValueIds: id });
  if (productCount > 0) {
    throw new CatalogValidationError("Remove this value from its products before archiving.");
  }
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreValue(id) {
  const doc = await AttributeValue.findById(id);
  if (!doc) throw new CatalogValidationError("Value not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorderValues(attributeId, items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(
    items.map((it) => AttributeValue.updateOne(
      { _id: it.id, attributeId }, { $set: { sortOrder: Number(it.sortOrder) || 0 } }
    ))
  );
  return getAttributeById(attributeId);
}
