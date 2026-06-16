// server/src/modules/catalog/catalog.public.router.js
import { Router } from "express";
import { createCatalogController } from "./catalog.controller.js";

/**
 * Public catalog router. Mounted at `/api/catalog` (see ROUTER_MOUNTS).
 * Unauthenticated, active-only reads consumed by the storefront.
 */
export function createCatalogPublicRouter() {
  const router = Router();
  const c = createCatalogController();
  router.get("/categories", c.publicCategories);
  router.get("/categories/:slug", c.publicCategoryBySlug);
  router.get("/collections", c.publicCollections);
  router.get("/collections/:slug", c.publicCollectionBySlug);
  router.get("/collections/:slug/filters", c.collectionFilters);
  router.get("/collections/:slug/products", c.collectionProducts);
  router.get("/categories/:slug/filters", c.categoryFilters);
  router.get("/categories/:slug/products", c.categoryProducts);
  router.get("/navigation", c.publicNavigation);
  router.get("/attributes", c.publicAttributes);
  return router;
}

export default createCatalogPublicRouter;
