import { Order, UnmatchedWebhookEvent, ORDER_STATUSES } from "../models/index.js";
import { applyStatusChange as defaultApplyStatusChange } from "./order.service.js";
import { logger as defaultLogger } from "../config/logger.js";

/**
 * Webhook_Handler service — Shiprocket status webhooks (Req 12, 24).
 *
 * Processes inbound Shiprocket status webhooks after the router has verified
 * their authenticity (Req 24.1, 24.4):
 *
 *  - Maps a recognized Shiprocket status to the platform's `Order_Status`
 *    enumeration and updates the matching order via the Order_Service's
 *    `applyStatusChange`, which appends exactly one status-history entry and
 *    dispatches the mapped WhatsApp notification (Req 12.1, 12.2).
 *  - When the webhook references no existing order, it mutates nothing and
 *    records an {@link UnmatchedWebhookEvent} with the reason (Req 12.4).
 *  - When the order matches but the status is not recognized, it likewise
 *    mutates nothing and records the event for review.
 *
 * Shipping-derived `Order_Status` changes flow ONLY through this webhook path;
 * the platform exposes no manual shipping-status control (Req 12.3). The
 * separate admin "fulfill" action triggers courier/AWB generation only.
 *
 * Every collaborator (Order model, `applyStatusChange`, the unmatched-event
 * model, logger) is injectable so the handler is testable against an in-memory
 * database with mocked notifications.
 */

/**
 * Map of normalized Shiprocket status strings to the platform `Order_Status`
 * enumeration. Keys are upper-cased and whitespace-collapsed so the lookup is
 * tolerant of Shiprocket's casing/spacing variations.
 */
export const SHIPROCKET_STATUS_MAP = Object.freeze({
  PACKED: "PACKED",
  "PICKUP SCHEDULED": "PACKED",
  "PICKUP GENERATED": "PACKED",
  "PICKED UP": "SHIPPED",
  SHIPPED: "SHIPPED",
  "IN TRANSIT": "SHIPPED",
  "OUT FOR DELIVERY": "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
  "RTO INITIATED": "RTO",
  "RTO IN TRANSIT": "RTO",
  "RTO DELIVERED": "RTO",
  RTO: "RTO",
});

/**
 * Normalize a raw Shiprocket status string for lookup: trim, collapse internal
 * whitespace, and upper-case.
 *
 * @param {unknown} status
 * @returns {string}
 */
function normalizeStatus(status) {
  if (typeof status !== "string") return "";
  return status.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Map a raw Shiprocket status to the platform `Order_Status`, or `null` when it
 * is not a recognized, mappable status (Property 23).
 *
 * @param {unknown} status
 * @returns {string|null}
 */
export function mapShiprocketStatus(status) {
  const mapped = SHIPROCKET_STATUS_MAP[normalizeStatus(status)];
  return mapped && ORDER_STATUSES.includes(mapped) ? mapped : null;
}

/**
 * Extract the candidate order references and the status from a Shiprocket
 * webhook payload, tolerating the provider's varied field names.
 *
 * @param {Record<string, unknown>} payload
 * @returns {{ awb: string|null, orderId: string|null, status: unknown }}
 */
export function extractWebhookFields(payload = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const awb = p.awb ?? p.awb_code ?? null;
  const orderId =
    p.order_id ?? p.orderId ?? p.channel_order_id ?? p.sr_order_id ?? null;
  const status =
    p.current_status ?? p.shipment_status ?? p.status ?? p.current_status_body;
  return {
    awb: awb != null ? String(awb) : null,
    orderId: orderId != null ? String(orderId) : null,
    status,
  };
}

/**
 * Create a Webhook_Handler service instance.
 *
 * @param {object} [options]
 * @param {typeof Order} [options.orderModel]
 * @param {typeof UnmatchedWebhookEvent} [options.unmatchedModel]
 * @param {(order: object, status: string) => Promise<object>} [options.applyStatusChange]
 * @param {{ info?: Function, warn: Function, error: Function }} [options.logger]
 */
export function createWebhookService({
  orderModel = Order,
  unmatchedModel = UnmatchedWebhookEvent,
  applyStatusChange = defaultApplyStatusChange,
  logger = defaultLogger,
} = {}) {
  /**
   * Locate the order a webhook refers to by AWB first, then by our human
   * order id, then by the stored Shiprocket order id. Returns `null` when no
   * order matches.
   */
  async function findOrder({ awb, orderId }) {
    if (awb) {
      const byAwb = await orderModel.findOne({ "shipping.awb": awb });
      if (byAwb) return byAwb;
    }
    if (orderId) {
      const byOrderId = await orderModel.findOne({ orderId });
      if (byOrderId) return byOrderId;
      const bySrId = await orderModel.findOne({
        "shipping.shiprocketOrderId": orderId,
      });
      if (bySrId) return bySrId;
    }
    return null;
  }

  /**
   * Record a non-mutating webhook event for later review (Req 12.4, 24.3).
   * Best-effort: a persistence failure is logged but never thrown.
   */
  async function recordUnmatched(payload, reason) {
    try {
      await unmatchedModel.create({ payload, reason });
    } catch (error) {
      logger.error("Failed to record unmatched webhook event.", {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process an authentic Shiprocket status webhook (Req 12.1, 12.2, 12.4).
   *
   * @param {Record<string, unknown>} payload the webhook body
   * @returns {Promise<{ status: "updated"|"unmatched"|"ignored", orderStatus?: string }>}
   */
  async function processShiprocketEvent(payload) {
    const { awb, orderId, status } = extractWebhookFields(payload);

    const order = await findOrder({ awb, orderId });
    if (!order) {
      // No matching order: reject + record, mutate nothing (Req 12.4, Property 24).
      await recordUnmatched(payload, "No matching order for webhook reference.");
      return { status: "unmatched" };
    }

    const mapped = mapShiprocketStatus(status);
    if (!mapped) {
      // Order matched but the status is not recognized: record without mutation.
      await recordUnmatched(
        payload,
        `Unrecognized Shiprocket status: ${String(status)}`
      );
      return { status: "ignored" };
    }

    // Authentic, matched, recognized: update Order_Status, append one history
    // entry, and dispatch the mapped WhatsApp notification (Req 12.1, 12.2).
    await applyStatusChange(order, mapped);
    return { status: "updated", orderStatus: mapped };
  }

  /**
   * Process an authentic Razorpay payment webhook.
   *
   * Orders are normally created (already PAID) by the synchronous checkout
   * verification (Req 5.1), so this handler is a reconciliation safety net:
   *
   *  - `payment.captured` with a matching unpaid order → mark it PAID and
   *    backfill the payment id (the customer paid but verification never
   *    completed).
   *  - `payment.captured` with NO matching order → report "unmatched" so the
   *    router responds non-2xx and Razorpay retries. Right after a payment
   *    this is usually just the webhook outrunning the client's verify call,
   *    so an UnmatchedWebhookEvent is recorded only once the payment is old
   *    enough that the order should long since exist; genuine dropouts
   *    (browser/network died mid-checkout) therefore surface for admin
   *    follow-up without recording noise for every healthy order.
   *  - `payment.failed` with a matching non-PAID order → mark it FAILED. A
   *    PAID order is never downgraded by a late or duplicate failure event,
   *    and a missing order is the expected case (orders only exist after
   *    successful verification) — both are acknowledged as "ignored".
   *  - Any other event type is acknowledged as "ignored".
   *
   * @param {Record<string, unknown>} payload the webhook body
   * @returns {Promise<{ status: "updated"|"unmatched"|"ignored", event: string, paymentStatus?: string }>}
   */
  async function processRazorpayEvent(payload) {
    const body = payload && typeof payload === "object" ? payload : {};
    const event = typeof body.event === "string" ? body.event : "";
    const entity = body.payload?.payment?.entity ?? {};
    const razorpayOrderId =
      entity.order_id != null ? String(entity.order_id) : null;
    const razorpayPaymentId = entity.id != null ? String(entity.id) : null;

    if (event !== "payment.captured" && event !== "payment.failed") {
      return { status: "ignored", event };
    }
    if (!razorpayOrderId) {
      await recordUnmatched(body, "Razorpay webhook carries no order reference.");
      return { status: "unmatched", event };
    }

    const order = await orderModel.findOne({
      "razorpay.orderId": razorpayOrderId,
    });

    if (event === "payment.captured") {
      if (!order) {
        // Razorpay sends `created_at` as epoch seconds. Within this window the
        // synchronous verify call is likely still in flight; past it, the
        // payment is treated as a genuine dropout and recorded for follow-up.
        const RECONCILE_GRACE_SECONDS = 5 * 60;
        const createdAt = Number(entity.created_at);
        const ageSeconds = Number.isFinite(createdAt)
          ? Date.now() / 1000 - createdAt
          : Infinity;
        if (ageSeconds > RECONCILE_GRACE_SECONDS) {
          await recordUnmatched(
            body,
            "Razorpay payment captured with no matching order."
          );
        }
        return { status: "unmatched", event };
      }
      if (order.paymentStatus === "PAID") {
        // Already reconciled by the synchronous flow — the normal case.
        return { status: "ignored", event };
      }
      order.paymentStatus = "PAID";
      if (razorpayPaymentId && !order.razorpay?.paymentId) {
        order.razorpay.paymentId = razorpayPaymentId;
      }
      await order.save();
      logger.info?.("Razorpay webhook reconciled order as PAID.", {
        orderId: order.orderId,
        razorpayOrderId,
        razorpayPaymentId,
      });
      return { status: "updated", event, paymentStatus: "PAID" };
    }

    // payment.failed
    if (!order || order.paymentStatus === "PAID") {
      return { status: "ignored", event };
    }
    order.paymentStatus = "FAILED";
    await order.save();
    logger.info?.("Razorpay webhook marked order payment as FAILED.", {
      orderId: order.orderId,
      razorpayOrderId,
      errorReason: entity.error_reason,
    });
    return { status: "updated", event, paymentStatus: "FAILED" };
  }

  return Object.freeze({ processShiprocketEvent, processRazorpayEvent });
}

/** Default application Webhook_Handler instance. */
export const webhookService = createWebhookService();

export default webhookService;
