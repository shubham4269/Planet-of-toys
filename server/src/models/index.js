/**
 * Model barrel (Req 8, 9, 14, 16, 22, 26, 30).
 *
 * Central re-export of every Mongoose model and the order enumeration
 * constants so services and routers can import from a single place.
 */

export { default as Product, computeDiscountPercent } from "./product.model.js";
export {
  default as Order,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  SHIPMENT_STATUSES,
  PAYMENT_METHODS,
  SHIPMENT_EVENT_STATUSES,
} from "./order.model.js";
export { default as Counter } from "./counter.model.js";
export { default as Admin } from "./admin.model.js";
export { default as AuditLog } from "./auditLog.model.js";
export { default as SystemSettings } from "./systemSettings.model.js";
export { default as UnmatchedWebhookEvent } from "./unmatchedWebhookEvent.model.js";
