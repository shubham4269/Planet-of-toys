import { Router } from "express";
import { createSettingsService } from "../services/settings.service.js";
import { createSettingsController } from "../controllers/settings.controller.js";

/**
 * System Settings router (Req 30).
 *
 * Mounted at `/api/admin/settings` (see ROUTER_MOUNTS in app.js). Exposes the
 * System_Settings_Service surface from the design:
 *
 *   GET  /                  -> all sections with masked credentials
 *   PUT  /:section          -> validate format -> encrypt -> persist (audit)
 *   POST /:section/verify   -> live, server-side connection test
 *
 * Every route is guarded by the injected JWT auth guard so only authenticated
 * Administrators can reach the module; unauthenticated requests are denied
 * (Req 30.1, 30.13, 19.5). The auth guard and the audit recorder are injected
 * so the router stays decoupled from the Auth/Audit services and is testable in
 * isolation; both default to no-ops for standalone use.
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 *   JWT auth guard applied to every settings route. Defaults to pass-through.
 * @param {ReturnType<typeof createSettingsService>} [options.settingsService]
 *   System Settings Service instance (defaults to a fresh one).
 * @param {(req: import("express").Request) => any} [options.recordAudit]
 *   Factory returning the audit recorder for a request.
 * @returns {import("express").Router}
 */
export function createSettingsRouter({
  requireAuth = (req, res, next) => next(),
  settingsService = createSettingsService(),
  recordAudit,
} = {}) {
  const router = Router();
  const controller = createSettingsController(settingsService, { recordAudit });

  // Guard every settings route (Req 30.1, 30.13).
  router.use(requireAuth);

  router.get("/", controller.getSettings);
  router.put("/:section", controller.updateSettings);
  router.post("/:section/verify", controller.verifySettings);

  return router;
}

export default createSettingsRouter;
