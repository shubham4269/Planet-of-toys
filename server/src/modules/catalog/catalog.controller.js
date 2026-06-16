// server/src/modules/catalog/catalog.controller.js
import * as categories from "./category.service.js";
import * as collections from "./collection.service.js";
import * as attributes from "./attribute.service.js";
import * as navigation from "./navigation.service.js";
import { bulkAssign } from "./productAssign.service.js";
import { resolveFilters } from "./filterResolver.service.js";
import { queryCollectionProducts } from "./collectionQuery.service.js";
import { getFilterConfig, saveFilterConfig } from "./filterConfig.service.js";
import { getPublicNavigation } from "./navigation.service.js";
import { resolveCategoryFilters, queryCategoryProducts } from "./categoryBrowse.service.js";

/**
 * Catalog controller — thin HTTP layer over the catalog services. Admin handlers
 * expose full (incl. archived when ?archived=true) data; public handlers expose
 * active-only projections. Errors are forwarded to the central error handler.
 */
export function createCatalogController() {
  const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
  };
  const archived = (req) => req.query.archived === "true";

  return {
    // ---- categories (admin) ----
    listCategories: wrap(async (req, res) => res.json({ categories: await categories.listCategoryTree({ includeArchived: archived(req) }) })),
    getCategory: wrap(async (req, res) => res.json({ category: await categories.getCategoryById(req.params.id) })),
    createCategory: wrap(async (req, res) => res.status(201).json({ category: await categories.createCategory(req.body ?? {}) })),
    updateCategory: wrap(async (req, res) => res.json({ category: await categories.updateCategory(req.params.id, req.body ?? {}) })),
    archiveCategory: wrap(async (req, res) => res.json({ category: await categories.archiveCategory(req.params.id) })),
    restoreCategory: wrap(async (req, res) => res.json({ category: await categories.restoreCategory(req.params.id) })),
    reorderCategories: wrap(async (req, res) => res.json({ categories: await categories.reorderCategories(req.body?.items ?? req.body ?? []) })),

    // ---- collections (admin) ----
    listCollections: wrap(async (req, res) => res.json({ collections: await collections.listCollections({ includeArchived: archived(req) }) })),
    getCollection: wrap(async (req, res) => res.json({ collection: await collections.getCollectionById(req.params.id) })),
    createCollection: wrap(async (req, res) => res.status(201).json({ collection: await collections.createCollection(req.body ?? {}) })),
    updateCollection: wrap(async (req, res) => res.json({ collection: await collections.updateCollection(req.params.id, req.body ?? {}) })),
    archiveCollection: wrap(async (req, res) => res.json({ collection: await collections.archiveCollection(req.params.id) })),
    restoreCollection: wrap(async (req, res) => res.json({ collection: await collections.restoreCollection(req.params.id) })),
    reorderCollections: wrap(async (req, res) => res.json({ collections: await collections.reorderCollections(req.body?.items ?? req.body ?? []) })),

    // ---- attributes + values (admin) ----
    listAttributes: wrap(async (req, res) => res.json({ attributes: await attributes.listAttributes({ includeArchived: archived(req) }) })),
    getAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.getAttributeById(req.params.id) })),
    createAttribute: wrap(async (req, res) => res.status(201).json({ attribute: await attributes.createAttribute(req.body ?? {}) })),
    updateAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.updateAttribute(req.params.id, req.body ?? {}) })),
    archiveAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.archiveAttribute(req.params.id) })),
    restoreAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.restoreAttribute(req.params.id) })),
    reorderAttributes: wrap(async (req, res) => res.json({ attributes: await attributes.reorderAttributes(req.body?.items ?? req.body ?? []) })),
    addValue: wrap(async (req, res) => res.status(201).json({ value: await attributes.addValue(req.params.attrId, req.body ?? {}) })),
    updateValue: wrap(async (req, res) => res.json({ value: await attributes.updateValue(req.params.id, req.body ?? {}) })),
    archiveValue: wrap(async (req, res) => res.json({ value: await attributes.archiveValue(req.params.id) })),
    restoreValue: wrap(async (req, res) => res.json({ value: await attributes.restoreValue(req.params.id) })),
    reorderValues: wrap(async (req, res) => res.json({ attribute: await attributes.reorderValues(req.params.attrId, req.body?.items ?? req.body ?? []) })),

    // ---- bulk product assignment (admin) ----
    bulkAssignProducts: wrap(async (req, res) => res.json({ result: await bulkAssign(req.body ?? {}) })),

    // ---- public reads ----
    publicCategories: wrap(async (_req, res) => res.json({ categories: await categories.listCategoryTree({ includeArchived: false }) })),
    publicCategoryBySlug: wrap(async (req, res) => {
      const category = await categories.getCategoryBySlug(req.params.slug);
      if (!category) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json({ category });
    }),
    publicCollections: wrap(async (_req, res) => res.json({ collections: await collections.listCollections({ includeArchived: false }) })),
    publicCollectionBySlug: wrap(async (req, res) => {
      const collection = await collections.getPublicCollectionBySlug(req.params.slug);
      if (!collection) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      const products = await collections.getCollectionProducts(collection.id);
      return res.json({ collection, products });
    }),
    publicAttributes: wrap(async (_req, res) => res.json({ attributes: await attributes.listPublicAttributes() })),

    // ---- public: dynamic filters + product query (Sub-project B) ----
    collectionFilters: wrap(async (req, res) => {
      const collection = await collections.getPublicCollectionBySlug(req.params.slug);
      if (!collection) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json({ filters: await resolveFilters(collection.id) });
    }),
    collectionProducts: wrap(async (req, res) => {
      const result = await queryCollectionProducts(req.params.slug, req.query || {});
      if (!result) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json(result);
    }),

    // ---- admin: filter config (Sub-project B) ----
    getFilterConfig: wrap(async (req, res) => res.json({ config: await getFilterConfig(req.params.id) })),
    putFilterConfig: wrap(async (req, res) => res.json({ config: await saveFilterConfig(req.params.id, req.body?.filters ?? []) })),

    // ---- public: navigation + category browse (Sub-project C) ----
    publicNavigation: wrap(async (req, res) => res.json({ items: await getPublicNavigation({ menuKey: req.query.menuKey || "header" }) })),
    categoryFilters: wrap(async (req, res) => {
      const filters = await resolveCategoryFilters(req.params.slug);
      if (!filters) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json({ filters });
    }),
    categoryProducts: wrap(async (req, res) => {
      const result = await queryCategoryProducts(req.params.slug, req.query || {});
      if (!result) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json(result);
    }),

    // ---- admin: navigation CRUD (Sub-project C) ----
    navList: wrap(async (req, res) => res.json({ items: await navigation.listNavigationItems({ includeArchived: req.query.archived === "true", menuKey: req.query.menuKey }) })),
    navCreate: wrap(async (req, res) => res.status(201).json({ item: await navigation.createNavigationItem(req.body ?? {}) })),
    navUpdate: wrap(async (req, res) => res.json({ item: await navigation.updateNavigationItem(req.params.id, req.body ?? {}) })),
    navArchive: wrap(async (req, res) => res.json({ item: await navigation.archiveNavigationItem(req.params.id) })),
    navRestore: wrap(async (req, res) => res.json({ item: await navigation.restoreNavigationItem(req.params.id) })),
    navReorder: wrap(async (req, res) => res.json({ items: await navigation.reorderNavigationItems(req.body?.items ?? req.body ?? []) })),

    // navigation services are foundation-only (no routes in Sub-project A); kept
    // imported so future wiring lives alongside the rest of the controller.
    _navigation: navigation,
  };
}

export default createCatalogController;
