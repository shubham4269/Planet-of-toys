// server/src/modules/catalog/navigation.service.js
import NavigationItem, { NAV_TARGET_TYPES, NAV_MENUS } from "./navigationItem.model.js";
import Category from "./category.model.js";
import Collection from "./collection.model.js";
import { CatalogValidationError } from "./catalog.errors.js";

const WRITABLE = ["label", "targetType", "targetId", "url", "menu", "menuKey", "parentId", "sortOrder", "openInNewTab", "isActive", "isMegaMenu", "featured", "image"];

function pick(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validate(data) {
  if (data.targetType !== undefined && !NAV_TARGET_TYPES.includes(data.targetType)) {
    throw new CatalogValidationError(`targetType must be one of: ${NAV_TARGET_TYPES.join(", ")}.`);
  }
  if (data.menu !== undefined && !NAV_MENUS.includes(data.menu)) {
    throw new CatalogValidationError(`menu must be one of: ${NAV_MENUS.join(", ")}.`);
  }
  // Internal links to entities are entity-based, never raw URLs.
  if ((data.targetType === "category" || data.targetType === "collection") && data.url) {
    throw new CatalogValidationError("Category/collection navigation items must use targetId, not a url.");
  }
}

/** Enforce required target fields at creation time. */
function validateTargetRequired(data) {
  if (data.targetType === "category" || data.targetType === "collection") {
    if (!data.targetId) throw new CatalogValidationError("This navigation target requires a targetId.");
  } else if (data.targetType === "internalRoute" || data.targetType === "externalUrl") {
    if (!data.url || String(data.url).trim() === "") throw new CatalogValidationError("This navigation target requires a url.");
  }
}

export async function listNavigationItems({ includeArchived = false, menuKey } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  if (menuKey) query.menuKey = menuKey;
  const docs = await NavigationItem.find(query).sort({ sortOrder: 1, label: 1 });
  return docs.map((d) => d.toJSON());
}

export async function createNavigationItem(input = {}) {
  if (typeof input.label !== "string" || input.label.trim() === "") {
    throw new CatalogValidationError("Navigation label is required.");
  }
  const data = pick(input);
  validate(data);
  validateTargetRequired(data);
  data.label = input.label.trim();
  const doc = await NavigationItem.create(data);
  return doc.toJSON();
}

export async function updateNavigationItem(id, input = {}) {
  const doc = await NavigationItem.findById(id);
  if (!doc) throw new CatalogValidationError("Navigation item not found.", 404);
  const data = pick(input);
  validate(data);
  if (data.label !== undefined) {
    if (data.label.trim() === "") throw new CatalogValidationError("Navigation label is required.");
    data.label = data.label.trim();
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveNavigationItem(id) {
  const doc = await NavigationItem.findById(id);
  if (!doc) throw new CatalogValidationError("Navigation item not found.", 404);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreNavigationItem(id) {
  const doc = await NavigationItem.findById(id);
  if (!doc) throw new CatalogValidationError("Navigation item not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

/** Active navigation tree for a menu, with hrefs resolved from entity slugs server-side. */
export async function getPublicNavigation({ menuKey = "header" } = {}) {
  const docs = await NavigationItem.find({ menuKey, deletedAt: null, isActive: true }).sort({ sortOrder: 1, label: 1 });
  const items = docs.map((d) => d.toJSON());

  const catIds = items.filter((i) => i.targetType === "category" && i.targetId).map((i) => i.targetId);
  const colIds = items.filter((i) => i.targetType === "collection" && i.targetId).map((i) => i.targetId);
  const cats = catIds.length ? await Category.find({ _id: { $in: catIds }, deletedAt: null }) : [];
  const cols = colIds.length ? await Collection.find({ _id: { $in: colIds }, deletedAt: null }) : [];
  const catSlug = new Map(cats.map((c) => [String(c._id), c.slug]));
  const colSlug = new Map(cols.map((c) => [String(c._id), c.slug]));
  const hrefOf = (i) => {
    if (i.targetType === "category") { const s = catSlug.get(String(i.targetId)); return s ? `/category/${s}` : "#"; }
    if (i.targetType === "collection") { const s = colSlug.get(String(i.targetId)); return s ? `/collections/${s}` : "#"; }
    return i.url || "#";
  };

  const nodes = new Map();
  const roots = [];
  for (const i of items) {
    nodes.set(String(i.id), {
      id: i.id, label: i.label, href: hrefOf(i), openInNewTab: i.openInNewTab,
      isMegaMenu: i.isMegaMenu, featured: i.featured, image: i.image, children: [],
    });
  }
  for (const i of items) {
    const node = nodes.get(String(i.id));
    const pid = i.parentId ? String(i.parentId) : null;
    if (pid && nodes.has(pid)) nodes.get(pid).children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Apply [{ id, parentId, sortOrder }] in one pass. */
export async function reorderNavigationItems(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(items.map((it) =>
    NavigationItem.updateOne({ _id: it.id }, { $set: { parentId: it.parentId ?? null, sortOrder: Number(it.sortOrder) || 0 } })));
  return listNavigationItems({ includeArchived: false });
}
