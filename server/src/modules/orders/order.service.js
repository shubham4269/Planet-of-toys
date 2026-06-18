import mongoose from "mongoose";
import { Order, Product, ORDER_STATUSES } from "../../models/index.js";
import { nextOrderId as defaultNextOrderId } from "../../shared/utils/counter.service.js";
import {
  verifySignature as defaultVerifySignature,
  refundPayment as defaultRefundPayment,
} from "../../integrations/razorpay/payment.service.js";
import { whatsappService as defaultWhatsappService } from "../../integrations/whatsapp/whatsapp.service.js";
import { shippingService as defaultShippingService } from "../../integrations/shiprocket/shipping.service.js";
import { logger as defaultLogger } from "../../shared/config/logger.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

/**
 * Order Service — order creation and decoupled fulfilment (Req 2.2, 5.3, 5.4,
 * 9.1, 11.4, 11.9, 13.1).
 *
 * `createOrder` is the single entry point for turning a verified checkout into
 * a persisted order. It enforces the platform's core conversion-resilience
 * guarantees:
 *
 *  - The order is always created with `Order_Status = CONFIRMED` and
 *    `Shipment_Status = PENDING`, with a seeded status-history entry recording
 *    the initial CONFIRMED status (Req 9.1, 11.4).
 *  - A sequential, human-readable identifier is assigned via the Counter
 *    Service (Req 8, used here).
 *  - The UTM attribution captured for the customer session is persisted
 *    unchanged with the order (Req 2.2).
 *  - For ONLINE payments the Razorpay signature is verified server-side: a
 *    successful verification yields `Payment_Status = PAID` (Req 5.3); a failed
 *    verification yields `Payment_Status = FAILED` and NO confirmed order is
 *    created (Req 5.4).
 *  - On successful creation an order-confirmed WhatsApp notification is
 *    dispatched (Req 13.1).
 *  - Shiprocket fulfilment is triggered OUT-OF-BAND (decoupled): order
 *    persistence is committed first, and the fulfilment attempt runs as a
 *    fire-and-forget side effect whose failures can never block or surface to
 *    the customer (Req 11.9). The customer-facing result carries only the
 *    order identifier and summary — never shipping or technical detail.
 *
 * Every external dependency (counter, payment verification, WhatsApp, shipping,
 * logger, Order model) is injectable so the conversion flow can be tested with
 * mocked integrations and an in-memory database.
 */

/** Raised when an ONLINE payment signature fails server-side verification. */
export class PaymentVerificationError extends AppError {
  constructor(message = "Razorpay payment signature verification failed.") {
    super(message, 400, {
      // Generic, non-technical message for the customer (Req 11.9, 27.1).
      clientMessage: "Payment could not be verified. Please try again.",
    });
    this.name = "PaymentVerificationError";
  }
}

/**
 * Mapping from a target Order_Status to the WhatsApp notification template(s)
 * dispatched on that transition (Req 13.2–13.5). SHIPPED dispatches BOTH a
 * shipment-created and an order-shipped notification, in that order; the other
 * notify-on states dispatch their single corresponding template. Statuses with
 * no customer notification (CONFIRMED beyond creation, PACKED, RTO) are absent
 * from the map and dispatch nothing — the status-history entry is still
 * appended (Req 9.4, 12.2).
 */
export const STATUS_NOTIFICATION_TEMPLATES = Object.freeze({
  SHIPPED: Object.freeze(["shipment-created", "order-shipped"]),
  OUT_FOR_DELIVERY: Object.freeze(["out-for-delivery"]),
  DELIVERED: Object.freeze(["delivered"]),
  CANCELLED: Object.freeze(["cancelled"]),
});

/**
 * Normalize a captured attribution record into the persisted `utm` shape.
 *
 * Accepts either the canonical keys (`source`, `medium`, `campaign`, `term`,
 * `content`) or the raw `utm_*` query-parameter keys, mapping each to the
 * model field. Missing values resolve to `null`. An empty/absent record yields
 * an object with all-`null` fields, matching "empty attribution record"
 * semantics (Req 2.2, 2.3).
 *
 * @param {Record<string, unknown>|null|undefined} utm
 * @returns {{ source: string|null, medium: string|null, campaign: string|null, term: string|null, content: string|null }}
 */
export function normalizeUtm(utm) {
  const record = utm && typeof utm === "object" ? utm : {};
  const pick = (key) => {
    const value = record[key] ?? record[`utm_${key}`];
    return value === undefined || value === null ? null : String(value);
  };
  return {
    source: pick("source"),
    medium: pick("medium"),
    campaign: pick("campaign"),
    term: pick("term"),
    content: pick("content"),
  };
}

/**
 * Build the customer-facing projection of a created order (Req 11.9, 20.1).
 *
 * Includes only the order identifier and a non-technical summary. Shipping
 * details (AWB, courier, Shiprocket order id), the shipment status, the
 * Razorpay references, the status history, and the attribution record are all
 * intentionally excluded so no shipping-provider or technical detail can leak
 * to the customer.
 *
 * @param {import("mongoose").Document} order
 * @returns {Record<string, unknown>}
 */
export function toCustomerProjection(order) {
  if (!order) return null;
  const obj = typeof order.toJSON === "function" ? order.toJSON() : { ...order };
  return {
    orderId: obj.orderId,
    orderStatus: obj.orderStatus,
    paymentMethod: obj.paymentMethod,
    paymentStatus: obj.paymentStatus,
    amount: obj.amount,
    items: (obj.items ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      color: item.color ?? null,
    })),
    customer: { name: obj.customer?.name },
    createdAt: obj.createdAt,
  };
}

/**
 * Escape a user-supplied string for safe, literal use inside a RegExp. Every
 * regex metacharacter is backslash-escaped so admin search terms are matched
 * verbatim and can never be interpreted as a pattern (Req 17.1, 19.4).
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Default page size for the admin order list when none is supplied. */
export const DEFAULT_ORDER_PAGE_SIZE = 20;
/** Upper bound on the admin order-list page size (Req 17.1). */
export const MAX_ORDER_PAGE_SIZE = 100;

/** Order fields an administrator may filter the list by (exact match). */
const ORDER_FILTER_FIELDS = Object.freeze([
  "orderStatus",
  "paymentStatus",
  "shipmentStatus",
  "paymentMethod",
]);

/**
 * Build the Mongo query object for the admin order list from a filter record
 * and a free-text search term (Req 17.1).
 *
 * Only the whitelisted {@link ORDER_FILTER_FIELDS} are honoured as exact-match
 * filters; unknown or empty filter keys are ignored so an attacker cannot inject
 * arbitrary query clauses. The search term is matched case-insensitively and
 * literally (regex-escaped) against the human-readable `orderId` and the
 * customer's name, phone, and email.
 *
 * @param {object} [filter] exact-match filter fields
 * @param {string} [search] free-text search term
 * @returns {Record<string, unknown>}
 */
export function buildOrderListQuery(filter = {}, search = "") {
  const query = {};

  const filterRecord = filter && typeof filter === "object" ? filter : {};
  for (const field of ORDER_FILTER_FIELDS) {
    const value = filterRecord[field];
    if (value !== undefined && value !== null && value !== "") {
      query[field] = value;
    }
  }

  const term = typeof search === "string" ? search.trim() : "";
  if (term) {
    const rx = new RegExp(escapeRegExp(term), "i");
    query.$or = [
      { orderId: rx },
      { "customer.name": rx },
      { "customer.phone": rx },
      { "customer.email": rx },
    ];
  }

  return query;
}

/**
 * Clamp a requested 1-based page number to a positive integer (defaults to 1).
 *
 * @param {unknown} page
 * @returns {number}
 */
export function normalizePage(page) {
  const n = Number.parseInt(page, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Clamp a requested page size into `[1, MAX_ORDER_PAGE_SIZE]`, defaulting to
 * {@link DEFAULT_ORDER_PAGE_SIZE} when absent or invalid.
 *
 * @param {unknown} pageSize
 * @returns {number}
 */
export function normalizePageSize(pageSize) {
  const n = Number.parseInt(pageSize, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_ORDER_PAGE_SIZE;
  return Math.min(n, MAX_ORDER_PAGE_SIZE);
}

/**
 * Build the full admin-facing detail projection for a single order (Req 17.2).
 *
 * Unlike {@link toCustomerProjection}, the administrator view intentionally
 * surfaces every operational field: full customer information, payment
 * information (method, status, Razorpay references), shipment information (AWB,
 * courier, Shiprocket order id), the Shipment_Status, and the status-history
 * timeline ordered oldest-first. The Razorpay key secret is never persisted on
 * the order, so it cannot leak here (Req 5.5).
 *
 * @param {import("mongoose").Document|object|null} order
 * @returns {Record<string, unknown>|null}
 */
export function toAdminOrderDetail(order) {
  if (!order) return null;
  const obj = typeof order.toJSON === "function" ? order.toJSON() : { ...order };

  const timeline = [...(obj.statusHistory ?? [])]
    .map((entry) => ({
      status: entry.status,
      timestamp: entry.timestamp,
      note: entry.note ?? null,
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    id: obj.id,
    orderId: obj.orderId,
    orderStatus: obj.orderStatus,
    shipmentStatus: obj.shipmentStatus,
    amount: obj.amount,
    items: (obj.items ?? []).map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      color: item.color ?? null,
    })),
    customer: { ...(obj.customer ?? {}) },
    payment: {
      method: obj.paymentMethod,
      status: obj.paymentStatus,
      razorpay: { ...(obj.razorpay ?? {}) },
    },
    shipment: { ...(obj.shipping ?? {}) },
    timeline,
    utm: { ...(obj.utm ?? {}) },
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

/**
 * Create an Order_Service instance.
 *
 * @param {object} [options]
 * @param {(date?: Date) => Promise<string>} [options.nextOrderId] sequential id generator
 * @param {(orderId: string, paymentId: string, signature: string) => Promise<boolean>} [options.verifySignature]
 * @param {{ sendNotification: Function }} [options.whatsappService]
 * @param {{ createShipment?: Function }} [options.shippingService] out-of-band fulfilment provider
 * @param {Function} [options.fulfilOrder] explicit fulfilment fn (overrides shippingService.createShipment)
 * @param {{ info?: Function, warn: Function, error: Function }} [options.logger]
 * @param {object} [options.orderModel] Order model (injectable for tests)
 */
export function createOrderService({
  nextOrderId = defaultNextOrderId,
  verifySignature = defaultVerifySignature,
  refundPayment = defaultRefundPayment,
  whatsappService = defaultWhatsappService,
  shippingService = defaultShippingService,
  fulfilOrder,
  logger = defaultLogger,
  orderModel = Order,
  productModel = Product,
} = {}) {
  /**
   * Decrement product stock for each ordered line item (Req 16.4 inventory).
   *
   * Each item's product stock is reduced by the ordered quantity using an
   * atomic `$inc` guarded by `stock >= quantity`, so stock can never drop below
   * zero (the conditional simply no-ops when insufficient stock remains, which
   * also prevents overselling). A stock-update failure is logged server-side
   * and never blocks the already-created order, consistent with the platform's
   * conversion-resilience guarantee (Req 11.9).
   *
   * Items carrying a `color` decrement that color variant's stock instead of
   * the product-level stock, so per-color inventory stays accurate.
   *
   * @param {Array<{ productId?: unknown, quantity?: number, color?: string|null }>} items
   */
  async function decrementStockForItems(items = []) {
    for (const item of items) {
      const quantity = Number(item?.quantity) || 0;
      if (!item?.productId || quantity <= 0) continue;
      try {
        if (item.color) {
          // Variant-scoped: guard + decrement the matching variant atomically.
          await productModel.updateOne(
            {
              _id: item.productId,
              variants: {
                $elemMatch: { color: item.color, stock: { $gte: quantity } },
              },
            },
            { $inc: { "variants.$.stock": -quantity } }
          );
        } else {
          await productModel.updateOne(
            { _id: item.productId, stock: { $gte: quantity } },
            { $inc: { stock: -quantity } }
          );
        }
      } catch (error) {
        logger.error("Failed to decrement product stock after order creation.", {
          productId: String(item.productId),
          quantity,
          color: item.color ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Return the cancelled quantities to inventory — the inverse of
   * {@link decrementStockForItems}, variant-aware and best-effort: a failure
   * (or a since-deleted product) is logged and never blocks the cancellation.
   *
   * @param {Array<{ productId?: unknown, quantity?: number, color?: string|null }>} items
   */
  async function restoreStockForItems(items = []) {
    for (const item of items) {
      const quantity = Number(item?.quantity) || 0;
      if (!item?.productId || quantity <= 0) continue;
      try {
        if (item.color) {
          await productModel.updateOne(
            { _id: item.productId, "variants.color": item.color },
            { $inc: { "variants.$.stock": quantity } }
          );
        } else {
          await productModel.updateOne(
            { _id: item.productId },
            { $inc: { stock: quantity } }
          );
        }
      } catch (error) {
        logger.error("Failed to restore product stock after cancellation.", {
          productId: String(item.productId),
          quantity,
          color: item.color ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  /**
   * Resolve the out-of-band fulfilment function. Prefers an explicit
   * `fulfilOrder`, otherwise delegates to `shippingService.createShipment` when
   * available. Returns `null` when no fulfilment provider is wired (in which
   * case the order is still created and left at `Shipment_Status = PENDING` for
   * the background retry sweep / admin manual trigger).
   */
  function resolveFulfilment() {
    if (typeof fulfilOrder === "function") return fulfilOrder;
    if (shippingService && typeof shippingService.createShipment === "function") {
      return (order) => shippingService.createShipment(order);
    }
    return null;
  }

  /**
   * Trigger Shiprocket fulfilment out-of-band (Req 11.9).
   *
   * The fulfilment attempt is detached from the request/response path: it is
   * never awaited by `createOrder`, and any rejection is caught and logged on
   * the server side so it can never block order creation or surface a
   * technical error to the customer. The order remains successfully created
   * regardless of the fulfilment outcome (Req 11.5, 11.9).
   *
   * @param {import("mongoose").Document} order
   */
  function triggerFulfilment(order) {
    const fulfil = resolveFulfilment();
    if (!fulfil) {
      // No fulfilment provider wired yet; the order stays PENDING for the
      // background retry sweep / admin manual trigger (Req 11.7, 11.8).
      return;
    }
    // Fire-and-forget. Use a resolved promise so a synchronous throw inside the
    // fulfilment function is also captured rather than propagating.
    Promise.resolve()
      .then(() => fulfil(order))
      .catch((error) => {
        logger.error("Out-of-band Shiprocket fulfilment failed; order retained as PENDING.", {
          orderId: order?.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Resolve the payment method and payment status for the order.
   *
   * ONLINE payments are verified server-side via HMAC signature: success →
   * PAID (Req 5.3); failure → a {@link PaymentVerificationError} is thrown and
   * NO confirmed order is created (Req 5.4). COD orders are created with
   * Payment_Status = PENDING (OTP verification happens upstream).
   *
   * @param {object} payment
   * @returns {Promise<{ paymentMethod: string, paymentStatus: string, razorpay: object }>}
   */
  async function resolvePayment(payment = {}) {
    const method = payment.method ?? payment.paymentMethod ?? "COD";

    if (method === "ONLINE") {
      const { razorpayOrderId, razorpayPaymentId, signature } = payment;
      const verified = await verifySignature(
        razorpayOrderId,
        razorpayPaymentId,
        signature
      );
      if (!verified) {
        // Payment_Status is FAILED and no confirmed order is created (Req 5.4).
        throw new PaymentVerificationError();
      }
      return {
        paymentMethod: "ONLINE",
        paymentStatus: "PAID",
        razorpay: { orderId: razorpayOrderId, paymentId: razorpayPaymentId },
      };
    }

    // Cash on Delivery: payment is collected at delivery (Req 6.2).
    return { paymentMethod: "COD", paymentStatus: "PENDING", razorpay: {} };
  }

  /**
   * Create an order from a verified checkout (Req 2.2, 5.3, 5.4, 9.1, 11.4,
   * 11.9, 13.1).
   *
   * @param {object} input
   * @param {object} input.customer customer contact + address
   * @param {Array<object>} input.items ordered line items
   * @param {number} input.amount order total
   * @param {object} [payment] payment descriptor (method + ONLINE references)
   * @param {object} [utm] captured attribution record for the session
   * @returns {Promise<{ order: import("mongoose").Document, customer: Record<string, unknown> }>}
   */
  async function createOrder(input = {}, payment = {}, utm = {}) {
    const { customer, items, amount } = input;

    if (!customer || !Array.isArray(items) || items.length === 0) {
      throw new AppError("Order requires a customer and at least one item.", 400, {
        clientMessage: "Your order details are incomplete. Please try again.",
      });
    }

    // Resolve payment first: a failed ONLINE verification must abort BEFORE any
    // order is persisted (Req 5.4).
    const { paymentMethod, paymentStatus, razorpay } = await resolvePayment(payment);

    const orderId = await nextOrderId(new Date());

    // Seed the status history with the initial CONFIRMED transition (Req 9.1,
    // 9.4). Order_Status = CONFIRMED, Shipment_Status = PENDING (Req 9.1, 11.4).
    const order = await orderModel.create({
      orderId,
      customer,
      items,
      amount,
      paymentMethod,
      paymentStatus,
      razorpay,
      orderStatus: "CONFIRMED",
      shipmentStatus: "PENDING",
      statusHistory: [{ status: "CONFIRMED", timestamp: new Date() }],
      utm: normalizeUtm(utm),
    });

    // Reduce inventory for each ordered line item now that the order is
    // committed. Best-effort + atomic: a failure is logged and never blocks
    // the created order (Req 11.9).
    await decrementStockForItems(items);

    // Dispatch the order-confirmed WhatsApp notification (Req 13.1). The
    // WhatsApp service is non-blocking and never throws, so a messaging outage
    // cannot affect the created order.
    await whatsappService.sendNotification(order.customer.phone, "order-confirmed", {
      orderId: order.orderId,
      amount: order.amount,
    });

    // Trigger Shiprocket fulfilment out-of-band — decoupled from the customer
    // response (Req 11.9). Never awaited; failures are logged, not surfaced.
    triggerFulfilment(order);

    // The customer success response carries only the identifier + summary
    // (Req 11.9, 20.1) — no shipping or technical detail.
    return { order, customer: toCustomerProjection(order) };
  }

  /**
   * Dispatch the WhatsApp notification(s) mapped to a target Order_Status
   * (Req 13.2–13.5). Sending is fully non-blocking: the WhatsApp service never
   * throws, and dispatch happens for the configured states only (SHIPPED sends
   * both shipment-created and order-shipped). Statuses with no mapped template
   * dispatch nothing.
   *
   * @param {import("mongoose").Document} order
   * @param {string} status the new Order_Status
   */
  async function dispatchStatusNotifications(order, status) {
    const templates = STATUS_NOTIFICATION_TEMPLATES[status] ?? [];
    for (const template of templates) {
      await whatsappService.sendNotification(order.customer.phone, template, {
        orderId: order.orderId,
      });
    }
  }

  /**
   * Apply an Order_Status change to an order (Req 9.4, 12.2, 13.2–13.5).
   *
   * Appends EXACTLY ONE status-history entry recording the new status and the
   * change timestamp, sets `orderStatus` to the new value, persists the order,
   * and then dispatches the WhatsApp template(s) mapped to that status. This is
   * the single status-transition entry point shared by the Shiprocket webhook
   * handler and administrator cancellation, guaranteeing the
   * "one history entry per change" invariant (Property 19).
   *
   * @param {import("mongoose").Document} order the order document to transition
   * @param {string} status the new Order_Status
   * @returns {Promise<import("mongoose").Document>} the saved order
   */
  async function applyStatusChange(order, status) {
    if (!order) {
      throw new AppError("An order is required to apply a status change.", 400, {
        clientMessage: "That order could not be updated. Please try again.",
      });
    }
    if (!ORDER_STATUSES.includes(status)) {
      throw new AppError(`Unknown order status: ${status}.`, 400, {
        clientMessage: "That order status is not recognised.",
      });
    }

    const timestamp = new Date();
    order.orderStatus = status;
    // Exactly one history entry is appended per change (Req 9.4, 12.2).
    order.statusHistory.push({ status, timestamp });
    await order.save();

    // Dispatch the mapped WhatsApp notification(s) (Req 13.2–13.5). Non-blocking.
    await dispatchStatusNotifications(order, status);

    return order;
  }

  /**
   * Cancel an order on behalf of an Administrator (Req 17.3, 26.3).
   *
   * Order of operations:
   *  1. Resolve the order by human-readable `orderId`, falling back to the
   *     Mongo `_id` (the admin UI passes either).
   *  2. Reject when the order is already CANCELLED (prevents double refunds
   *     and duplicate notifications).
   *  3. For a PAID online order, issue a FULL Razorpay refund FIRST. A refund
   *     failure aborts the cancellation entirely — money handling must never
   *     fail silently — so the order stays untouched and the admin sees an
   *     explicit error. On success `paymentStatus` becomes REFUNDED and is
   *     persisted immediately (a retry can never double-refund).
   *  4. Cancel the Shiprocket shipment when one exists (best-effort): a
   *     Shiprocket failure never blocks the cancellation — the admin is warned
   *     to cancel the pickup manually instead. Success sets
   *     `shipmentStatus = CANCELLED`, which also dedupes repeat cancellations.
   *  5. Set `orderStatus = CANCELLED`, append a status-history entry, and
   *     dispatch the cancelled WhatsApp notification (via applyStatusChange).
   *  6. Return the cancelled quantities to inventory (variant-aware,
   *     best-effort).
   *  7. Record an Audit_Log entry (best-effort) including the refund id and
   *     the Shiprocket cancellation outcome.
   *
   * @param {string} orderId order identifier (human-readable or Mongo id)
   * @param {object} [ctx]
   * @param {string} [ctx.adminId] acting administrator id (for the audit entry)
   * @param {(entry: object) => any} [ctx.recordAudit] audit recorder (injected)
   * @returns {Promise<import("mongoose").Document>} the cancelled order
   */
  async function cancelOrder(orderId, { adminId, recordAudit = () => {} } = {}) {
    let order = await orderModel.findOne({ orderId });
    if (!order && mongoose.isValidObjectId(orderId)) {
      order = await orderModel.findById(orderId);
    }
    if (!order) {
      throw new AppError(`Order not found: ${orderId}.`, 404, {
        clientMessage: "That order could not be found.",
      });
    }

    if (order.orderStatus === "CANCELLED") {
      throw new AppError(`Order already cancelled: ${order.orderId}.`, 400, {
        clientMessage: "This order has already been cancelled.",
      });
    }

    // Refund BEFORE cancelling so a refund failure leaves the order intact
    // and visible to the admin instead of cancelling without returning money.
    let refundId = null;
    const needsRefund =
      order.paymentMethod === "ONLINE" &&
      order.paymentStatus === "PAID" &&
      Boolean(order.razorpay?.paymentId);
    if (needsRefund) {
      try {
        const refund = await refundPayment(
          order.razorpay.paymentId,
          Math.round(Number(order.amount) * 100) // INR -> paise
        );
        refundId = refund?.refundId ?? null;
      } catch (error) {
        logger.error("Razorpay refund failed; order NOT cancelled.", {
          orderId: order.orderId,
          paymentId: order.razorpay.paymentId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new AppError(
          `Refund failed for order ${order.orderId}.`,
          502,
          {
            clientMessage:
              "The refund could not be issued, so the order was NOT cancelled. Please try again or refund manually in the Razorpay dashboard.",
          }
        );
      }
      // Persist REFUNDED immediately: if any later step fails, a retry must
      // see the refund and never issue it twice.
      order.paymentStatus = "REFUNDED";
      await order.save();
    }

    // Call off the Shiprocket pickup when a shipment exists (best-effort,
    // after the refund): a missed pickup cancellation is recoverable manually
    // in the Shiprocket dashboard, so a Shiprocket failure must never block
    // returning the customer's money or cancelling the order. A shipment
    // already marked CANCELLED is never cancelled twice.
    const hasShipment = Boolean(
      order.shipping?.shiprocketOrderId || order.shipping?.awb
    );
    let shiprocketCancelled = null; // null = no shipment existed
    if (hasShipment && order.shipmentStatus === "CANCELLED") {
      shiprocketCancelled = true; // cancelled previously — dedupe
    } else if (hasShipment) {
      // Every attempt is recorded on the order's timeline so support/audits
      // can reconstruct exactly what happened (persisted with the
      // applyStatusChange save below).
      order.statusHistory.push({
        status: "SHIPMENT_CANCEL_REQUESTED",
        timestamp: new Date(),
        note: "Shipment cancellation requested from Shiprocket.",
      });

      let result = null;
      try {
        result = await shippingService?.cancelShipment?.(order);
        shiprocketCancelled = Boolean(result?.ok);
      } catch (error) {
        // Defensive: the shipping service contracts to never throw.
        shiprocketCancelled = false;
        result = { ok: false, reason: error instanceof Error ? error.message : String(error) };
        logger.error("Shiprocket cancellation threw unexpectedly.", {
          orderId: order.orderId,
          error: result.reason,
        });
      }

      if (shiprocketCancelled) {
        order.shipmentStatus = "CANCELLED";
        order.statusHistory.push({
          status: "SHIPMENT_CANCELLED",
          timestamp: new Date(),
          note: "Shipment cancelled successfully in Shiprocket.",
        });
      } else {
        // The raw provider reason goes to the server logs for troubleshooting;
        // the timeline note stays clean and actionable.
        logger.warn("Shiprocket cancellation unsuccessful; manual action required.", {
          orderId: order.orderId,
          shiprocketOrderId: order.shipping?.shiprocketOrderId ?? null,
          awb: order.shipping?.awb ?? null,
          reason: result?.reason ?? "unknown",
        });
        order.statusHistory.push({
          status: "SHIPMENT_CANCEL_FAILED",
          timestamp: new Date(),
          note: "Shiprocket cancellation failed. Manual cancellation required.",
        });
      }
    }

    await applyStatusChange(order, "CANCELLED");

    // Return the cancelled quantities to inventory (best-effort).
    await restoreStockForItems(order.items ?? []);

    // Record the auditable cancellation (Req 26.3). Auditing must not break the
    // operation: a recorder failure is logged and swallowed.
    if (typeof recordAudit === "function") {
      try {
        await recordAudit({
          action: "order.cancel",
          adminId,
          targetType: "Order",
          targetId: order.orderId,
          metadata: {
            orderId: order.orderId,
            refundId,
            refunded: needsRefund,
            shiprocketShipment: hasShipment,
            shiprocketCancelled,
          },
        });
      } catch (error) {
        logger.error("Failed to record order cancellation audit entry.", {
          orderId: order.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return order;
  }

  /**
   * List orders for the admin panel with filtering, search, and pagination
   * (Req 17.1).
   *
   * Orders are returned newest-first using a deterministic, total ordering
   * (`createdAt` descending with `_id` descending as a tiebreaker) so that
   * successive pages never overlap and together cover exactly the matching set
   * (Property 31). Only whitelisted filter fields and a regex-escaped search
   * term are honoured (see {@link buildOrderListQuery}); the requested page and
   * page size are clamped to safe bounds.
   *
   * @param {object} [params]
   * @param {object} [params.filter] exact-match filter fields
   * @param {string} [params.search] free-text search term
   * @param {number} [params.page] 1-based page number
   * @param {number} [params.pageSize] results per page
   * @returns {Promise<{ orders: object[], total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async function listOrders({ filter, search, page, pageSize } = {}) {
    const query = buildOrderListQuery(filter, search);
    const resolvedPage = normalizePage(page);
    const resolvedPageSize = normalizePageSize(pageSize);
    const skip = (resolvedPage - 1) * resolvedPageSize;

    const [total, orders] = await Promise.all([
      orderModel.countDocuments(query),
      orderModel
        .find(query)
        // Deterministic total ordering keeps pages non-overlapping (Property 31).
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(resolvedPageSize),
    ]);

    return {
      orders,
      total,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      totalPages: Math.ceil(total / resolvedPageSize),
    };
  }

  /**
   * Fetch the full admin-facing detail for a single order (Req 17.2).
   *
   * Resolves by the human-readable `orderId` first and falls back to the Mongo
   * `_id` when the supplied value is a valid ObjectId, so the route handler can
   * pass either identifier. Returns the {@link toAdminOrderDetail} projection —
   * customer, payment, shipment, Shipment_Status, and the ordered status-history
   * timeline — or throws a 404 when no order matches.
   *
   * @param {string} orderId order identifier (human-readable or Mongo id)
   * @returns {Promise<Record<string, unknown>>}
   */
  async function getOrderDetail(orderId) {
    if (!orderId) {
      throw new AppError("An order identifier is required.", 400, {
        clientMessage: "That order could not be found.",
      });
    }

    let order = await orderModel.findOne({ orderId });
    if (!order && mongoose.isValidObjectId(orderId)) {
      order = await orderModel.findById(orderId);
    }

    if (!order) {
      throw new AppError(`Order not found: ${orderId}.`, 404, {
        clientMessage: "That order could not be found.",
      });
    }

    return toAdminOrderDetail(order);
  }

  /**
   * Aggregate the headline dashboard statistics over the entire order set
   * (Req 15.1, Property 28).
   *
   * Returns three figures derived directly from the persisted orders:
   *
   *  - `orderCount` — the size of the order set (every order, regardless of
   *    status or payment).
   *  - `revenue` — the sum of the `amount` of every REVENUE-ELIGIBLE order.
   *    Revenue-eligible is defined as `paymentStatus === "PAID"`: revenue
   *    counts money actually captured. This deliberately excludes COD/online
   *    orders still PENDING (not yet collected) and FAILED payments, so the
   *    figure reflects realised income rather than gross order value. This is
   *    the single documented rule the dashboard reports against.
   *  - `statusBreakdown` — a per-Order_Status tally. EVERY status in
   *    {@link ORDER_STATUSES} is present as a key, defaulting to `0` when no
   *    order currently holds that status, so the breakdown shape is stable and
   *    the counts sum to `orderCount`.
   *
   * The shape exactly matches what the admin DashboardPage consumes from
   * `GET /api/admin/dashboard`: `{ orderCount, revenue, statusBreakdown }`.
   *
   * @returns {Promise<{ orderCount: number, revenue: number, statusBreakdown: Record<string, number> }>}
   */
  async function getDashboardStats() {
    const [orderCount, statusCounts, revenueAgg] = await Promise.all([
      orderModel.countDocuments({}),
      orderModel.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]),
      orderModel.aggregate([
        // Revenue-eligible = payment captured (Req 15.1; documented rule above).
        { $match: { paymentStatus: "PAID" } },
        { $group: { _id: null, revenue: { $sum: "$amount" } } },
      ]),
    ]);

    // Seed every known status at 0 so the breakdown shape is complete and stable.
    const statusBreakdown = {};
    for (const status of ORDER_STATUSES) {
      statusBreakdown[status] = 0;
    }
    for (const row of statusCounts) {
      if (row._id != null && Object.prototype.hasOwnProperty.call(statusBreakdown, row._id)) {
        statusBreakdown[row._id] = row.count;
      }
    }

    const revenue = revenueAgg.length > 0 ? revenueAgg[0].revenue : 0;

    return { orderCount, revenue, statusBreakdown };
  }

  return Object.freeze({
    createOrder,
    applyStatusChange,
    cancelOrder,
    listOrders,
    getOrderDetail,
    getDashboardStats,
  });
}

/** Default application Order_Service instance wired to the real services. */
export const orderService = createOrderService();

/** Bound convenience export over the default instance. */
export const createOrder = (...args) => orderService.createOrder(...args);
export const applyStatusChange = (...args) => orderService.applyStatusChange(...args);
export const cancelOrder = (...args) => orderService.cancelOrder(...args);
export const listOrders = (...args) => orderService.listOrders(...args);
export const getOrderDetail = (...args) => orderService.getOrderDetail(...args);
export const getDashboardStats = (...args) => orderService.getDashboardStats(...args);

export default orderService;
