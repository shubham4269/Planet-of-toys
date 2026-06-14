import { Router } from "express";
import { createNewsletterService } from "./newsletter.service.js";
import { createNewsletterController } from "./newsletter.controller.js";

/** Admin newsletter router. Mounted at `/api/admin/newsletter`, auth-guarded. */
export function createNewsletterAdminRouter({
  requireAuth = (req, res, next) => next(),
  newsletterService = createNewsletterService(),
} = {}) {
  const router = Router();
  const controller = createNewsletterController(newsletterService);
  router.use(requireAuth);
  router.get("/subscribers", controller.list);
  router.get("/subscribers/export", controller.exportCsv);
  router.patch("/subscribers/:id/unsubscribe", controller.unsubscribe);
  return router;
}
export default createNewsletterAdminRouter;
