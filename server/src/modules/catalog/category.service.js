// server/src/modules/catalog/category.service.js
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

/** Fields an admin may set on a category. slug is derived from name. */
const WRITABLE = [
  "name", "parentId", "image", "heroTitle", "heroSubtitle", "heroImage",
  "seoContent", "description", "sortOrder", "isActive", "seoTitle", "seoDescription",
];

/** Pick only writable keys that are present on the input. */
function pickWritable(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function requireName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new CatalogValidationError("Category name is required.");
  }
  return name.trim();
}

/** Assemble a nested tree (children[]) from a flat, sorted list of plain docs. */
export function buildTree(docs) {
  const byId = new Map();
  const roots = [];
  for (const d of docs) byId.set(String(d.id), { ...d, children: [] });
  for (const node of byId.values()) {
    const pid = node.parentId ? String(node.parentId) : null;
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  }
  const sortRec = (list) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Full tree. Active-only by default; pass includeArchived to include deletedAt rows. */
export async function listCategoryTree({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const docs = (await Category.find(query)).map((d) => d.toJSON());
  return buildTree(docs);
}

export async function getCategoryById(id) {
  const doc = await Category.findById(id);
  return doc ? doc.toJSON() : null;
}

/** Public read by slug — active and not archived only. */
export async function getCategoryBySlug(slug) {
  const doc = await Category.findOne({ slug, isActive: true, deletedAt: null });
  return doc ? doc.toJSON() : null;
}

export async function createCategory(input = {}) {
  const name = requireName(input.name);
  const data = pickWritable(input);
  data.name = name;
  data.slug = await uniqueSlug(Category, slugify(input.slug || name));
  const doc = await Category.create(data);
  return doc.toJSON();
}

export async function updateCategory(id, input = {}) {
  const doc = await Category.findById(id);
  if (!doc) throw new CatalogValidationError("Category not found.", 404);
  const data = pickWritable(input);
  if (data.name !== undefined) data.name = requireName(data.name);
  if (input.slug !== undefined || data.name !== undefined) {
    const base = slugify(input.slug || data.name || doc.name);
    data.slug = await uniqueSlug(Category, base, doc._id);
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveCategory(id) {
  const doc = await Category.findById(id);
  if (!doc) throw new CatalogValidationError("Category not found.", 404);
  const childCount = await Category.countDocuments({ parentId: id, deletedAt: null });
  if (childCount > 0) {
    throw new CatalogValidationError("Reassign or archive child categories first.");
  }
  const productCount = await Product.countDocuments({ categoryIds: id });
  if (productCount > 0) {
    throw new CatalogValidationError("Remove this category from its products before archiving.");
  }
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreCategory(id) {
  const doc = await Category.findById(id);
  if (!doc) throw new CatalogValidationError("Category not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

/** Apply [{ id, parentId, sortOrder }] in one pass. */
export async function reorderCategories(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(
    items.map((it) =>
      Category.updateOne(
        { _id: it.id },
        { $set: { parentId: it.parentId ?? null, sortOrder: Number(it.sortOrder) || 0 } }
      )
    )
  );
  return listCategoryTree({ includeArchived: false });
}
