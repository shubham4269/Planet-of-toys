// server/src/modules/content/content.admin.router.js
import { Router } from "express";
import { createContentService } from "./content.service.js";
import { createContentController } from "./content.controller.js";

/**
 * Admin content router. Mounted at `/api/admin/content` (see ROUTER_MOUNTS).
 * Every route is behind the injected JWT auth guard. For now it manages the
 * promotional header; future content types add their own sub-paths here.
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 * @param {ReturnType<typeof createContentService>} [options.contentService]
 */
export function createContentAdminRouter({
  requireAuth = (req, res, next) => next(),
  contentService = createContentService(),
} = {}) {
  const router = Router();
  const controller = createContentController(contentService);

  router.use(requireAuth);
  router.get("/promo-banner", controller.getPromoBanner);
  router.put("/promo-banner", controller.updatePromoBanner);

  return router;
}

export default createContentAdminRouter;
