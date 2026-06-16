// server/src/modules/catalog/categoryBrowse.service.js
import Category from "./category.model.js";
import { resolveFiltersForScope } from "./filterResolver.service.js";
import { queryProductsForScope } from "./collectionQuery.service.js";
import { defaultFilterConfig } from "./filterConfig.service.js";

/** Active category by slug, or null. */
async function activeCategory(slug) {
  return Category.findOne({ slug, isActive: true, deletedAt: null });
}

/** Dynamic filters for a category page (default config over the category's products). */
export async function resolveCategoryFilters(slug) {
  const cat = await activeCategory(slug);
  if (!cat) return null;
  return resolveFiltersForScope({ field: "categoryIds", id: cat._id }, await defaultFilterConfig());
}

/** Filtered/sorted/paginated products for a category page. */
export async function queryCategoryProducts(slug, query = {}) {
  const cat = await activeCategory(slug);
  if (!cat) return null;
  return queryProductsForScope({ field: "categoryIds", id: cat._id }, query);
}
