import { Router } from "express";
import { createNewsletterService } from "./newsletter.service.js";
import { createNewsletterController } from "./newsletter.controller.js";

/** Public newsletter router. Mounted at `/api/newsletter`. */
export function createNewsletterPublicRouter({ newsletterService = createNewsletterService() } = {}) {
  const router = Router();
  const controller = createNewsletterController(newsletterService);
  router.post("/subscribe", controller.subscribe);
  return router;
}
export default createNewsletterPublicRouter;
