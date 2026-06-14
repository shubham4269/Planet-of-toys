/**
 * Mongoose model registry.
 *
 * Each model now lives inside the module that owns its domain (e.g. the Product
 * model under `modules/products`, the Order model under `modules/orders`). This
 * file is a thin aggregation layer that re-exports every model — and the order
 * enumeration constants — from one place.
 *
 * It exists for two reasons:
 *  1. Importing it guarantees every Mongoose model is registered, which matters
 *     for population and for code paths that reference a model by name.
 *  2. It preserves the long-standing `models/index.js` import contract so the
 *     module reorganization did not require rewriting dozens of call sites.
 *
 * New code may import a model directly from its owning module instead; this
 * registry remains for cross-cutting consumers (e.g. tests setting up fixtures
 * across several domains).
 */

export {
  default as Product,
  computeDiscountPercent,
} from "../modules/products/product.model.js";
export {
  default as Order,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  SHIPMENT_STATUSES,
  PAYMENT_METHODS,
  SHIPMENT_EVENT_STATUSES,
} from "../modules/orders/order.model.js";
export { default as Counter } from "../shared/utils/counter.model.js";
export { default as Admin } from "../modules/auth/admin.model.js";
export { default as AuditLog } from "../modules/auth/auditLog.model.js";
export { default as SystemSettings } from "../modules/settings/systemSettings.model.js";
export { default as PromoBanner } from "../modules/content/promoBanner.model.js";
export { default as FooterContent } from "../modules/content/footerContent.model.js";
export { default as UnmatchedWebhookEvent } from "../modules/webhooks/unmatchedWebhookEvent.model.js";
