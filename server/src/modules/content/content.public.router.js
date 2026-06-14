// server/src/modules/content/content.public.router.js
import { Router } from "express";
import { createContentService } from "./content.service.js";
import { createContentController } from "./content.controller.js";

/**
 * Public content router. Mounted at `/api/content` (see ROUTER_MOUNTS).
 * Unauthenticated; returns only the filtered, public banner projection so the
 * storefront can render the promotional header at runtime.
 *
 * @param {object} [options]
 * @param {ReturnType<typeof createContentService>} [options.contentService]
 */
export function createContentPublicRouter({
  contentService = createContentService(),
} = {}) {
  const router = Router();
  const controller = createContentController(contentService);

  router.get("/promo-banner", controller.getPublicPromoBanner);

  return router;
}

export default createContentPublicRouter;
