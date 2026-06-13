import mongoose from "mongoose";

/**
 * Order model (Req 8, 9, 11, 12, 17).
 *
 * Enumerations for order status, payment status, shipment status, and payment
 * method are enforced at the schema level so out-of-enumeration assignments are
 * rejected (Req 9.2, 9.3). The status history is appended on every status
 * change (Req 9.4, 12.2) and the captured UTM attribution is persisted from the
 * customer session (Req 2.2). The `razorpay` sub-document never stores a secret
 * (Req 5.5).
 */

const { Schema } = mongoose;

/** Allowed order lifecycle states (Req 9.2). */
export const ORDER_STATUSES = Object.freeze([
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RTO",
]);

/** Allowed payment states (Req 9.3). */
export const PAYMENT_STATUSES = Object.freeze([
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
]);

/** Allowed shipment states (Req 11.4). */
export const SHIPMENT_STATUSES = Object.freeze([
  "PENDING",
  "CREATED",
  "CANCELLED",
]);

/** Allowed payment methods. */
export const PAYMENT_METHODS = Object.freeze(["ONLINE", "COD"]);

/**
 * Shipment-lifecycle events recordable in the status-history timeline (in
 * addition to order-status transitions), so cancellation attempts against
 * Shiprocket are auditable per order.
 */
export const SHIPMENT_EVENT_STATUSES = Object.freeze([
  "SHIPMENT_CANCEL_REQUESTED",
  "SHIPMENT_CANCELLED",
  "SHIPMENT_CANCEL_FAILED",
]);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    // Selected color variation; null for products without variants.
    color: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const razorpaySchema = new Schema(
  {
    // Online-payment references only; the key secret is never persisted here.
    orderId: { type: String, default: null },
    paymentId: { type: String, default: null },
  },
  { _id: false }
);

const shippingSchema = new Schema(
  {
    awb: { type: String, default: null },
    courier: { type: String, default: null },
    shiprocketOrderId: { type: String, default: null },
  },
  { _id: false }
);

const statusHistorySchema = new Schema(
  {
    // Order-status transitions plus auditable shipment-lifecycle events.
    status: {
      type: String,
      required: true,
      enum: [...ORDER_STATUSES, ...SHIPMENT_EVENT_STATUSES],
    },
    timestamp: { type: Date, required: true, default: Date.now },
    // Optional admin-facing annotation (e.g. "Manual cancellation required").
    note: { type: String, default: null },
  },
  { _id: false }
);

const utmSchema = new Schema(
  {
    source: { type: String, default: null },
    medium: { type: String, default: null },
    campaign: { type: String, default: null },
    term: { type: String, default: null },
    content: { type: String, default: null },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customer: { type: customerSchema, required: true },
    items: { type: [orderItemSchema], required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, required: true, enum: PAYMENT_METHODS },
    paymentStatus: {
      type: String,
      required: true,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
    },
    razorpay: { type: razorpaySchema, default: () => ({}) },
    orderStatus: {
      type: String,
      required: true,
      enum: ORDER_STATUSES,
      default: "CONFIRMED",
    },
    shipmentStatus: {
      type: String,
      required: true,
      enum: SHIPMENT_STATUSES,
      default: "PENDING",
    },
    shipping: { type: shippingSchema, default: () => ({}) },
    statusHistory: { type: [statusHistorySchema], default: [] },
    // Empty object when no attribution parameters were present (Req 2.2).
    utm: { type: utmSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
