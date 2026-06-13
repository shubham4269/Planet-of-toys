import { AuditLog as DefaultAuditLog } from "../models/index.js";
import { logger as defaultLogger } from "../config/logger.js";

/**
 * Audit Log Service (Req 26.1–26.5, 30.12).
 *
 * Records security-relevant administrator actions — the action type, the acting
 * administrator, and a timestamp (with optional target and metadata) — on the
 * Backend only. Audit entries are NEVER returned to customers: this service has
 * no read surface for the storefront, and the AuditLog model is excluded from
 * every customer-facing projection (Req 26.5, Property 11).
 *
 * The core {@link recordAudit} persists a normalized entry. Because the
 * auditable hooks already built across the codebase inject their recorder in
 * slightly different shapes, this module also exposes thin adapters that bridge
 * the core persister to each hook's expected signature:
 *
 *  - {@link loginAuditRecorder} — factory `(req) => ({ record({ action, admin }) })`
 *    consumed by the login handler (auth.controller.js, Req 26.1).
 *  - {@link requestAuditRecorder} — factory `(req) => (entry) => …` consumed by
 *    the settings router/controller (Req 30.12) and any router that injects a
 *    per-request recorder.
 *  - {@link directAuditRecorder} — a plain `(entry) => …` recorder consumed by
 *    the order service `cancelOrder` hook (Req 26.3) and the admin product
 *    handlers (Req 26.2).
 *
 * Each adapter delegates to {@link recordAudit}; callers are expected to wrap
 * invocations in their own try/catch so an audit failure never blocks the
 * underlying administrator operation (matching the existing hook conventions).
 */

/**
 * Canonical audit action identifiers. The login/settings/order hooks were built
 * with their own action strings; these constants keep the remaining actions
 * (products, shipment retry) consistent and discoverable.
 */
export const AUDIT_ACTIONS = Object.freeze({
  ADMIN_LOGIN: "ADMIN_LOGIN",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  ORDER_CANCEL: "order.cancel",
  SHIPMENT_RETRY: "shipment.retry",
  SETTINGS_CREATE: "settings.create",
  SETTINGS_UPDATE: "settings.update",
  SETTINGS_DELETE: "settings.delete",
});

/** Raised when an audit entry is missing the data required to record it. */
export class AuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditError";
  }
}

/**
 * Extract a usable administrator identifier from either a raw id (string or
 * ObjectId) or an admin-like object exposing `id` / `_id`.
 *
 * @param {unknown} adminOrId
 * @returns {unknown} the identifier, or `undefined` when none is present
 */
function extractAdminId(adminOrId) {
  if (adminOrId === null || adminOrId === undefined) return undefined;
  // ObjectId instances expose toHexString(); use the canonical hex string so we
  // never accidentally read an ObjectId's raw `.id` Buffer below.
  if (typeof adminOrId.toHexString === "function") {
    return adminOrId.toHexString();
  }
  if (typeof adminOrId === "string") return adminOrId;
  if (typeof adminOrId === "object") {
    return extractAdminId(adminOrId.id ?? adminOrId._id);
  }
  return adminOrId;
}

/**
 * Persist a single audit entry (Req 26.1–26.4, 30.12).
 *
 * Normalizes the entry, defaulting the timestamp to "now" and accepting either
 * an `adminId` or an `admin` object (whose id is extracted). The persisted
 * document captures `{ action, adminId, targetType, targetId, timestamp,
 * metadata }` and is stored server-side only.
 *
 * Throws {@link AuditError} when the action or acting administrator is missing —
 * callers treat auditing as best-effort and should swallow such failures so the
 * underlying operation is never blocked.
 *
 * @param {object} entry
 * @param {string} entry.action the audited action type (see {@link AUDIT_ACTIONS})
 * @param {unknown} [entry.adminId] acting administrator id
 * @param {object} [entry.admin] acting administrator (id extracted if `adminId` absent)
 * @param {string|null} [entry.targetType] the type of entity acted upon
 * @param {string|null} [entry.targetId] the id of the entity acted upon
 * @param {Date} [entry.timestamp] action time (defaults to now)
 * @param {object|null} [entry.metadata] optional non-sensitive context
 * @param {object} [deps]
 * @param {{ create: Function }} [deps.AuditLog] AuditLog model (injected for tests)
 * @returns {Promise<import("mongoose").Document>} the persisted audit entry
 */
export async function recordAudit(entry = {}, { AuditLog = DefaultAuditLog } = {}) {
  const {
    action,
    adminId,
    admin,
    targetType = null,
    targetId = null,
    timestamp,
    metadata = null,
  } = entry;

  if (typeof action !== "string" || action.trim() === "") {
    throw new AuditError("recordAudit requires a non-empty action.");
  }

  const resolvedAdminId = extractAdminId(adminId ?? admin);
  if (resolvedAdminId === undefined || resolvedAdminId === null || String(resolvedAdminId) === "") {
    throw new AuditError("recordAudit requires an acting administrator id.");
  }

  return AuditLog.create({
    action,
    // Coerce to the canonical 24-hex string so Mongoose casts it to an
    // ObjectId regardless of which ObjectId/bson instance produced the value.
    adminId: typeof resolvedAdminId === "string" ? resolvedAdminId : String(resolvedAdminId),
    targetType: targetType ?? null,
    targetId: targetId !== undefined && targetId !== null ? String(targetId) : null,
    timestamp: timestamp instanceof Date ? timestamp : new Date(),
    metadata: metadata ?? null,
  });
}

/**
 * Adapter for the login handler (auth.controller.js, Req 26.1).
 *
 * Returns a per-request factory `(req) => ({ record })` whose `record` accepts
 * `{ action, admin, metadata }` (the shape the login handler emits) and maps
 * the admin to an `adminId`, tagging the entry as targeting the Admin entity.
 *
 * @param {object} [deps] forwarded to {@link recordAudit}
 * @param {object} [deps.logger] logger for best-effort failure reporting
 * @returns {(req: import("express").Request) => { record: (e: object) => Promise<unknown> }}
 */
export function loginAuditRecorder({ logger = defaultLogger, ...deps } = {}) {
  return function bind(_req) {
    return {
      async record({ action = AUDIT_ACTIONS.ADMIN_LOGIN, admin, metadata } = {}) {
        try {
          const adminId = extractAdminId(admin);
          return await recordAudit(
            {
              action,
              adminId,
              targetType: "Admin",
              targetId: adminId,
              metadata: metadata ?? (admin?.email ? { email: admin.email } : null),
            },
            deps
          );
        } catch (err) {
          logger?.error?.("Failed to record login audit entry", {
            reason: err?.message ?? String(err),
          });
          return undefined;
        }
      },
    };
  };
}

/**
 * Adapter for routers/services that inject a per-request recorder which is then
 * invoked with a fully-formed entry (settings router/controller, Req 30.12).
 *
 * Returns a factory `(req) => (entry) => recordAudit(entry)`.
 *
 * @param {object} [deps] forwarded to {@link recordAudit}
 * @returns {(req: import("express").Request) => (entry: object) => Promise<unknown>}
 */
export function requestAuditRecorder(deps = {}) {
  return function bind(_req) {
    return (entry) => recordAudit(entry, deps);
  };
}

/**
 * Adapter for hooks that accept a plain `(entry) => …` recorder directly — the
 * order service `cancelOrder` hook (Req 26.3) and the admin product handlers
 * (Req 26.2).
 *
 * @param {object} [deps] forwarded to {@link recordAudit}
 * @returns {(entry: object) => Promise<unknown>}
 */
export function directAuditRecorder(deps = {}) {
  return (entry) => recordAudit(entry, deps);
}

export default {
  AUDIT_ACTIONS,
  AuditError,
  recordAudit,
  loginAuditRecorder,
  requestAuditRecorder,
  directAuditRecorder,
};
