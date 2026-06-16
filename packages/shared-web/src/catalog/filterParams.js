// packages/shared-web/src/catalog/filterParams.js
/**
 * Pure helpers translating between the URL query string and filter state.
 * State shape: { selection, sort, page } where selection is keyed by filter key
 * (attribute key "f_<slug>" → string[]; "price" → [min,max]; "category" → slug).
 * Reserved keys (sort, page, limit) are never treated as attribute filters.
 */
const RESERVED = new Set(["sort", "page", "limit"]);

/** Parse a URLSearchParams into { selection, sort, page }. */
export function parseFilterParams(searchParams) {
  const selection = {};
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED.has(key) || !value) continue;
    if (key === "price") {
      const m = /^(\d+)-(\d+)$/.exec(value);
      if (m) selection.price = [Number(m[1]), Number(m[2])];
    } else if (key === "category") {
      selection.category = value;
    } else if (key.startsWith("f_")) {
      selection[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  const sort = searchParams.get("sort") || "featured";
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  return { selection, sort, page };
}

/** Serialize { selection, sort, page } back to a query string (defaults omitted). */
export function toQueryString({ selection = {}, sort = "featured", page = 1 } = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(selection)) {
    if (key === "price" && Array.isArray(value)) sp.set("price", `${value[0]}-${value[1]}`);
    else if (key === "category" && value) sp.set("category", value);
    else if (key.startsWith("f_") && Array.isArray(value) && value.length) sp.set(key, value.join(","));
  }
  if (sort && sort !== "featured") sp.set("sort", sort);
  if (page && page > 1) sp.set("page", String(page));
  return sp.toString();
}
