import { Product } from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Product Service (Req 1, 16).
 *
 * Implements product catalog management for the admin panel and the public
 * storefront:
 *  - create / update / delete products (Req 16.1, 16.5).
 *  - unique, URL-safe slug generation derived from the product name (Req 16.2).
 *  - active/stock state toggling (Req 16.4).
 *  - computed discount percentage (delegated to the Product model pre-validate
 *    hook so persisted reads stay self-consistent — Req 1.1).
 *  - a public projection of an active product that excludes internal fields
 *    (Req 1.6, 19.1).
 *  - association of uploaded media (images/video) with a product (Req 16.3).
 *
 * Secrets and internal bookkeeping fields never reach the public projection;
 * the storefront resolver returns `null` for unknown or inactive slugs so the
 * Landing Page can render a not-found view (Req 1.6).
 */

/**
 * Fields exposed to the customer-facing storefront. Anything not listed here
 * (e.g. `active`, `createdAt`, `updatedAt`, `__v`) is considered internal and
 * is omitted from the public projection (Req 1.6, 19.1).
 */
const PUBLIC_FIELDS = Object.freeze([
  "id",
  "slug",
  "name",
  "price",
  "compareAtPrice",
  "discountPercent",
  "description",
  "features",
  "specifications",
  "faqs",
  "images",
  "video",
  "trustBadges",
  "stock",
  "variants",
]);

/**
 * Fields an administrator may set when creating or updating a product. `slug`
 * and `discountPercent` are intentionally excluded: the slug is generated from
 * the name (Req 16.2) and the discount is derived by the model (Req 1.1).
 */
const WRITABLE_FIELDS = Object.freeze([
  "name",
  "price",
  "compareAtPrice",
  "description",
  "features",
  "specifications",
  "faqs",
  "images",
  "video",
  "trustBadges",
  "stock",
  "variants",
  "active",
]);

/**
 * Convert an arbitrary product name into a base URL-safe slug fragment:
 * lowercase ASCII words separated by single hyphens, with diacritics stripped
 * and all other characters removed. Falls back to "product" when the name
 * contains no slug-able characters.
 *
 * @param {string} name
 * @returns {string} base slug (never empty)
 */
function slugifyBase(name) {
  const base = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-"); // collapse repeated hyphens

  return base || "product";
}

/**
 * Generate a unique, URL-safe slug derived from `name` (Req 16.2).
 *
 * The base slug is produced by {@link slugifyBase}. If it collides with an
 * entry in `existing`, a numeric suffix (`-2`, `-3`, ...) is appended until a
 * free slug is found, guaranteeing uniqueness against the supplied set.
 *
 * @param {string} name the product name to derive the slug from
 * @param {Iterable<string>} [existing=[]] slugs already in use
 * @returns {string} a slug not present in `existing`
 */
export function generateSlug(name, existing = []) {
  const taken = existing instanceof Set ? existing : new Set(existing);
  const base = slugifyBase(name);

  if (!taken.has(base)) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

/**
 * Resolve a unique slug for `name` against the persisted catalog, ignoring an
 * optional product id (so updates can keep/reuse their own slug family).
 *
 * @param {string} name
 * @param {string} [ignoreId] product _id to exclude from the collision set
 * @returns {Promise<string>} a slug unique across all other products
 */
async function generateUniqueSlug(name, ignoreId) {
  const base = slugifyBase(name);
  // Fetch only slugs in the base family (`base` or `base-<n>`) to keep the
  // collision set small while remaining correct.
  const query = { slug: new RegExp(`^${escapeRegExp(base)}(-\\d+)?$`) };
  if (ignoreId) {
    query._id = { $ne: ignoreId };
  }
  const docs = await Product.find(query).select("slug").lean();
  const existing = docs.map((d) => d.slug);
  return generateSlug(name, existing);
}

/** Escape a string for safe interpolation into a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pick only the administrator-writable fields from an input object, dropping
 * `undefined` values so they don't overwrite existing data on update.
 *
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
function pickWritable(input = {}) {
  const out = {};
  for (const field of WRITABLE_FIELDS) {
    if (input[field] !== undefined) {
      out[field] = input[field];
    }
  }
  return out;
}

/**
 * Build the customer-facing projection of a product, excluding every internal
 * field (Req 1.6, 19.1). Accepts a Mongoose document or a plain object.
 *
 * @param {object} product
 * @returns {Record<string, unknown>}
 */
export function toPublicProjection(product) {
  if (!product) return null;
  const obj =
    typeof product.toJSON === "function" ? product.toJSON() : { ...product };
  // Normalize Mongoose `_id` to `id` for lean/plain objects.
  if (obj.id === undefined && obj._id !== undefined) {
    obj.id = String(obj._id);
  }

  const projection = {};
  for (const field of PUBLIC_FIELDS) {
    if (obj[field] !== undefined) {
      projection[field] = obj[field];
    }
  }
  return projection;
}

/**
 * Create a product, generating a unique slug from its name (Req 16.1, 16.2).
 * The discount percentage is computed by the model pre-validate hook (Req 1.1).
 *
 * @param {Record<string, unknown>} input product fields
 * @returns {Promise<import("mongoose").Document>} the persisted product
 */
export async function createProduct(input = {}) {
  const data = pickWritable(input);
  if (!data.name || String(data.name).trim() === "") {
    throw new AppError("Product name is required.", 400, {
      clientMessage: "Product name is required.",
    });
  }

  data.slug = await generateUniqueSlug(data.name);
  const product = await Product.create(data);
  return product;
}

/**
 * Update a product (Req 16.1). When the name changes, a fresh unique slug is
 * generated so the slug stays derived from the current name (Req 16.2). The
 * discount percentage is recomputed by the model on save (Req 1.1).
 *
 * @param {string} id product id
 * @param {Record<string, unknown>} input fields to update
 * @returns {Promise<import("mongoose").Document>} the updated product
 */
export async function updateProduct(id, input = {}) {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError(`Product not found: ${id}`, 404);
  }

  const data = pickWritable(input);
  const nameChanged =
    data.name !== undefined && data.name !== product.name;

  for (const [key, value] of Object.entries(data)) {
    product[key] = value;
  }

  if (nameChanged) {
    product.slug = await generateUniqueSlug(product.name, product._id);
  }

  await product.save();
  return product;
}

/**
 * Delete a product, removing it from the catalog (Req 16.5).
 *
 * @param {string} id product id
 * @returns {Promise<import("mongoose").Document>} the removed product
 */
export async function deleteProduct(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    throw new AppError(`Product not found: ${id}`, 404);
  }
  return product;
}

/**
 * Toggle/set the active and/or stock state of a product and persist it
 * (Req 16.4). Only the provided fields are changed.
 *
 * @param {string} id product id
 * @param {object} state
 * @param {boolean} [state.active] new active state
 * @param {number} [state.stock] new stock quantity
 * @returns {Promise<import("mongoose").Document>} the updated product
 */
export async function setProductState(id, { active, stock } = {}) {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError(`Product not found: ${id}`, 404);
  }

  if (active !== undefined) {
    product.active = Boolean(active);
  }
  if (stock !== undefined) {
    product.stock = stock;
  }

  await product.save();
  return product;
}

/**
 * Associate uploaded media (images and/or video) with a product (Req 16.3).
 * Image filenames are appended to the existing gallery by default; pass
 * `{ replace: true }` to overwrite. A provided `video` always replaces the
 * current video reference.
 *
 * @param {string} id product id
 * @param {object} media
 * @param {string[]} [media.images] image media references to associate
 * @param {string} [media.video] video media reference to associate
 * @param {object} [options]
 * @param {boolean} [options.replace=false] replace the image gallery instead of appending
 * @returns {Promise<import("mongoose").Document>} the updated product
 */
export async function associateMedia(id, { images, video } = {}, { replace = false } = {}) {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError(`Product not found: ${id}`, 404);
  }

  if (Array.isArray(images)) {
    product.images = replace ? images : [...product.images, ...images];
  }
  if (video !== undefined) {
    product.video = video;
  }

  await product.save();
  return product;
}

/**
 * List products for the admin catalog, newest first (Req 16).
 *
 * @returns {Promise<import("mongoose").Document[]>}
 */
export async function listProducts() {
  return Product.find().sort({ createdAt: -1 });
}

/**
 * Resolve the public projection of an ACTIVE product by slug (Req 1, 1.6).
 * Returns `null` when the slug is unknown or the product is inactive, so the
 * caller renders a not-found result without leaking existence of inactive
 * products.
 *
 * @param {string} slug
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getActiveProductBySlug(slug) {
  if (typeof slug !== "string" || slug.trim() === "") {
    return null;
  }
  const product = await Product.findOne({ slug, active: true });
  if (!product) {
    return null;
  }
  return toPublicProjection(product);
}

export default {
  generateSlug,
  toPublicProjection,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductState,
  associateMedia,
  listProducts,
  getActiveProductBySlug,
};
