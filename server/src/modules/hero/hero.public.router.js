// server/src/modules/hero/hero.public.router.js
import { Router } from "express";
import { createHeroController } from "./hero.controller.js";

/** Public hero router. Mounted at `/api/hero` (see ROUTER_MOUNTS). */
export function createHeroPublicRouter() {
  const router = Router();
  const c = createHeroController();
  router.get("/", c.publicSlides);
  return router;
}

export default createHeroPublicRouter;
