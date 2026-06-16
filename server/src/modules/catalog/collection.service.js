// server/src/modules/catalog/collection.service.js
import Collection from "./collection.model.js";
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

const MODES = ["manual", "rules", "hybrid"];
const WRITABLE = [
  "name", "description", "mode", "featuredOnHome", "showInNavigation",
  "navigationLabel", "navigationOrder", "heroTitle", "heroSubtitle", "heroImage",
  "seoContent", "sortOrder", "isActive", "seoTitle", "seoDescription",
];

function pickWritable(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validate(data) {
  if (data.mode !== undefined && !MODES.includes(data.mode)) {
    throw new CatalogValidationError("Collection mode must be manual, rules, or hybrid.");
  }
}

export async function listCollections({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const docs = await Collection.find(query).sort({ sortOrder: 1, name: 1 });
  return docs.map((d) => d.toJSON());
}

export async function getCollectionById(id) {
  const doc = await Collection.findById(id);
  return doc ? doc.toJSON() : null;
}

/** Public read by slug — active, not archived. */
export async function getPublicCollectionBySlug(slug) {
  const doc = await Collection.findOne({ slug, isActive: true, deletedAt: null });
  return doc ? doc.toJSON() : null;
}

export async function createCollection(input = {}) {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new CatalogValidationError("Collection name is required.");
  }
  const data = pickWritable(input);
  validate(data);
  data.name = input.name.trim();
  data.slug = await uniqueSlug(Collection, slugify(input.slug || data.name));
  const doc = await Collection.create(data);
  return doc.toJSON();
}

export async function updateCollection(id, input = {}) {
  const doc = await Collection.findById(id);
  if (!doc) throw new CatalogValidationError("Collection not found.", 404);
  const data = pickWritable(input);
  validate(data);
  if (data.name !== undefined) {
    if (data.name.trim() === "") throw new CatalogValidationError("Collection name is required.");
    data.name = data.name.trim();
  }
  if (input.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(Collection, slugify(input.slug || data.name || doc.name), doc._id);
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveCollection(id) {
  const doc = await Collection.findById(id);
  if (!doc) throw new CatalogValidationError("Collection not found.", 404);
  const productCount = await Product.countDocuments({ collectionIds: id });
  if (productCount > 0) {
    throw new CatalogValidationError("Remove this collection from its products before archiving.");
  }
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreCollection(id) {
  const doc = await Collection.findById(id);
  if (!doc) throw new CatalogValidationError("Collection not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorderCollections(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(
    items.map((it) => Collection.updateOne({ _id: it.id }, { $set: { sortOrder: Number(it.sortOrder) || 0 } }))
  );
  return listCollections({ includeArchived: false });
}

/** Active products manually assigned to a collection (public projection-lite). */
export async function getCollectionProducts(collectionId) {
  const docs = await Product.find({ collectionIds: collectionId, active: true }).sort({ createdAt: -1 });
  return docs.map((d) => {
    const j = d.toJSON();
    return { id: j.id, slug: j.slug, name: j.name, price: j.price, compareAtPrice: j.compareAtPrice,
      discountPercent: j.discountPercent, images: j.images };
  });
}
