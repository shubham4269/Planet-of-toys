// server/src/modules/catalog/catalog.admin.router.js
import { Router } from "express";
import { createCatalogController } from "./catalog.controller.js";

/**
 * Admin catalog router. Mounted at `/api/admin/catalog` (see ROUTER_MOUNTS),
 * behind the injected JWT auth guard. Manages categories, collections,
 * attributes (with inline values), and bulk product assignment.
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 */
export function createCatalogAdminRouter({ requireAuth = (req, res, next) => next() } = {}) {
  const router = Router();
  const c = createCatalogController();
  router.use(requireAuth);

  // categories
  router.get("/categories", c.listCategories);
  router.post("/categories", c.createCategory);
  router.put("/categories/reorder", c.reorderCategories);
  router.get("/categories/:id", c.getCategory);
  router.put("/categories/:id", c.updateCategory);
  router.post("/categories/:id/archive", c.archiveCategory);
  router.post("/categories/:id/restore", c.restoreCategory);

  // collections
  router.get("/collections", c.listCollections);
  router.post("/collections", c.createCollection);
  router.put("/collections/reorder", c.reorderCollections);
  router.get("/collections/:id", c.getCollection);
  router.put("/collections/:id", c.updateCollection);
  router.post("/collections/:id/archive", c.archiveCollection);
  router.post("/collections/:id/restore", c.restoreCollection);

  // attributes + inline values
  router.get("/attributes", c.listAttributes);
  router.post("/attributes", c.createAttribute);
  router.put("/attributes/reorder", c.reorderAttributes);
  router.get("/attributes/:id", c.getAttribute);
  router.put("/attributes/:id", c.updateAttribute);
  router.post("/attributes/:id/archive", c.archiveAttribute);
  router.post("/attributes/:id/restore", c.restoreAttribute);
  router.post("/attributes/:attrId/values", c.addValue);
  router.put("/attributes/:attrId/values/reorder", c.reorderValues);
  router.put("/values/:id", c.updateValue);
  router.post("/values/:id/archive", c.archiveValue);
  router.post("/values/:id/restore", c.restoreValue);

  // bulk product assignment
  router.post("/products/bulk-assign", c.bulkAssignProducts);

  return router;
}

export default createCatalogAdminRouter;
