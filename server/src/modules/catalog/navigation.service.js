// server/src/modules/catalog/navigation.service.js
import NavigationItem, { NAV_TARGET_TYPES, NAV_MENUS } from "./navigationItem.model.js";
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

export async function listNavigationItems({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
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
