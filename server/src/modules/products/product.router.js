import { Router } from "express";
import * as productController from "./product.controller.js";

/**
 * Product routers (Req 1, 16).
 *
 * Two surfaces:
 *  - Public storefront router: `GET /:slug` resolving an active product
 *    projection, mounted at `/api/products` (Req 1, 1.6).
 *  - Admin router: list/create/update/state-toggle/delete, mounted at
 *    `/api/admin/products`, guarded by JWT auth (Req 16).
 *
 * The admin guard (`requireAuth`) and the audit recorder are injected so this
 * router stays decoupled from the Auth/Audit services (implemented separately)
 * and can be wired during integration (task 20.1). Both default to no-ops so
 * the router is independently testable; production wiring supplies the real
 * JWT guard and audit logger.
 */

/** Pass-through middleware used as the default auth guard in standalone/test use. */
function passThrough(req, res, next) {
  next();
}

/**
 * Create the public storefront product router.
 * Mount at `/api/products`.
 *
 * @returns {import("express").Router}
 */
export function createPublicProductRouter() {
  const router = Router();
  router.get("/:slug", productController.getProductBySlug);
  return router;
}

/**
 * Create the admin product-management router.
 * Mount at `/api/admin/products`.
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 *   JWT auth guard applied to every admin route (Req 19.5). Defaults to a
 *   pass-through for standalone/testing use.
 * @param {(entry: object) => unknown} [options.recordAudit]
 *   Audit recorder invoked after each successful create/update/delete
 *   (Req 26.2). Defaults to undefined (no auditing) for standalone use.
 * @returns {import("express").Router}
 */
export function createAdminProductRouter({ requireAuth = passThrough, recordAudit } = {}) {
  const router = Router();
  const handlers = productController.createAdminProductHandlers({ recordAudit });

  router.use(requireAuth);

  router.get("/", productController.listProducts);
  router.post("/", handlers.createProduct);
  router.put("/:id", handlers.updateProduct);
  router.patch("/:id/state", handlers.setProductState);
  router.delete("/:id", handlers.deleteProduct);

  return router;
}

export default createPublicProductRouter;
