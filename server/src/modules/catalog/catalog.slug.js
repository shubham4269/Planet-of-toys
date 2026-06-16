// server/src/modules/catalog/catalog.slug.js

/**
 * Convert arbitrary text to a URL-safe slug: lowercase ASCII words joined by
 * single hyphens, diacritics stripped. Falls back to "item" when nothing remains.
 */
export function slugify(value) {
  const base = String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return base || "item";
}

/**
 * Return a slug unique within `Model`, appending -2, -3, … on collision. An
 * optional `excludeId` lets a record keep its own slug during updates. Only
 * non-archived rows are considered (archived slugs may be reused).
 *
 * @param {import("mongoose").Model} Model
 * @param {string} base already-slugified candidate
 * @param {import("mongoose").Types.ObjectId|string|null} [excludeId]
 * @param {object} [extraQuery] additional uniqueness scope (e.g. { attributeId })
 */
export async function uniqueSlug(Model, base, excludeId = null, extraQuery = {}) {
  let candidate = base;
  let n = 1;
  /* eslint-disable no-await-in-loop */
  while (true) {
    const query = { slug: candidate, deletedAt: null, ...extraQuery };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Model.exists(query);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  /* eslint-enable no-await-in-loop */
}
