// server/src/modules/hero/hero.admin.router.js
import { Router } from "express";
import { createHeroController } from "./hero.controller.js";

/**
 * Admin hero router. Mounted at `/api/admin/hero` (see ROUTER_MOUNTS), behind the
 * injected JWT auth guard. Soft delete + restore (no hard delete).
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 */
export function createHeroAdminRouter({ requireAuth = (req, res, next) => next() } = {}) {
  const router = Router();
  const c = createHeroController();
  router.use(requireAuth);
  router.get("/", c.list);
  router.post("/", c.create);
  router.put("/reorder", c.reorder);
  router.get("/:id", c.get);
  router.put("/:id", c.update);
  router.patch("/:id/active", c.setActive);
  router.post("/:id/soft-delete", c.softDelete);
  router.post("/:id/restore", c.restore);
  return router;
}

export default createHeroAdminRouter;
