import { SettingsValidationError } from "../services/settings.service.js";

/**
 * System Settings controller (Req 30).
 *
 * Thin HTTP layer over the System Settings Service. It shapes sanitized
 * responses and forwards errors to the central error handler. No credential
 * value, secret, or token is ever copied into a response: the service returns
 * only masked settings and boolean verification outcomes (Req 30.8, 30.20).
 *
 * Handlers are produced by a factory bound to a settings-service instance so
 * the service (and its injected dependencies) can be supplied at wiring time
 * and mocked in tests.
 *
 * @param {{ getMaskedSettings: Function, updateSection: Function, verifySection: Function }} settingsService
 * @param {object} [deps]
 * @param {(req: import("express").Request) => any} [deps.recordAudit]
 *   factory returning the audit recorder for a request (injected at wiring).
 */
export function createSettingsController(settingsService, { recordAudit } = {}) {
  /** GET /api/admin/settings — return all sections with masked credentials. */
  async function getSettings(req, res, next) {
    try {
      const settings = await settingsService.getMaskedSettings();
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/admin/settings/:section — validate → encrypt → persist (audit). */
  async function updateSettings(req, res, next) {
    try {
      const settings = await settingsService.updateSection(
        req.params.section,
        req.body ?? {},
        {
          // The JWT payload carries the admin id in the standard `sub` claim
          // (see auth.service.issueToken), so read it from there. Without this
          // the audit recorder receives no admin id and logs
          // "recordAudit requires an acting administrator id."
          adminId: req.admin?.id ?? req.admin?.sub ?? req.adminId,
          recordAudit: typeof recordAudit === "function" ? recordAudit(req) : undefined,
        }
      );
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/admin/settings/:section/verify — live, server-side test. */
  async function verifySettings(req, res, next) {
    try {
      const result = await settingsService.verifySection(
        req.params.section,
        req.body ?? {}
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  return { getSettings, updateSettings, verifySettings };
}

export { SettingsValidationError };

export default createSettingsController;
