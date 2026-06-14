import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createOrderService } from "./order.service.js";
import { Order, Counter, Product } from "../models/index.js";

/**
 * Admin cancellation with automatic refunds and inventory restoration:
 *
 *  - Cancelling a PAID online order issues a full Razorpay refund FIRST and
 *    marks the payment REFUNDED; a refund failure aborts the cancellation.
 *  - Cancelled quantities return to stock (variant-aware).
 *  - An already-cancelled order cannot be cancelled (or refunded) twice.
 *  - The order resolves by human orderId or Mongo _id (the admin UI sends _id).
 */

function buildService(overrides = {}) {
  const whatsappService = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
  const refundPayment = vi.fn().mockResolvedValue({
    refundId: "rfnd_1",
    paymentId: "pay_1",
    amount: 99800,
    status: "processed",
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createOrderService({
    whatsappService,
    refundPayment,
    verifySignature: vi.fn().mockResolvedValue(true),
    fulfilOrder: vi.fn().mockResolvedValue(undefined),
    logger,
    ...overrides,
  });
  return { service, whatsappService, refundPayment, logger };
}

const customer = () => ({
  name: "Asha Rao",
  phone: "919876543210",
  email: "asha@example.com",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
});

let seq = 0;
async function seedProduct(fields = {}) {
  seq += 1;
  return Product.create({
    name: `Toy ${seq}`,
    slug: `toy-${seq}-${Math.random().toString(36).slice(2, 8)}`,
    price: 499,
    stock: 10,
    ...fields,
  });
}

async function seedOrder(service, { product, paymentMethod = "COD", color = null, quantity = 2 }) {
  const { order } = await service.createOrder(
    {
      customer: customer(),
      items: [
        {
          productId: product._id,
          name: product.name,
          quantity,
          unitPrice: 499,
          color,
        },
      ],
      amount: 499 * quantity,
    },
    paymentMethod === "ONLINE"
      ? {
          method: "ONLINE",
          razorpayOrderId: "order_rzp_1",
          razorpayPaymentId: "pay_1",
          signature: "sig",
        }
      : { method: "COD" },
    {}
  );
  return order;
}

describe("order service - cancelOrder refund + stock restore", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Counter.deleteMany({});
    await Product.deleteMany({});
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("refunds a PAID online order in full and marks it REFUNDED", async () => {
    const { service, refundPayment } = buildService();
    const product = await seedProduct();
    const order = await seedOrder(service, { product, paymentMethod: "ONLINE" });

    const cancelled = await service.cancelOrder(order.orderId, {});

    // Full amount in paise for the stored Razorpay payment id.
    expect(refundPayment).toHaveBeenCalledWith("pay_1", 99800);
    expect(cancelled.orderStatus).toBe("CANCELLED");
    expect(cancelled.paymentStatus).toBe("REFUNDED");
  });

  it("aborts the cancellation entirely when the refund fails", async () => {
    const { service, refundPayment } = buildService();
    refundPayment.mockRejectedValue(new Error("razorpay down"));
    const product = await seedProduct();
    const order = await seedOrder(service, { product, paymentMethod: "ONLINE" });

    await expect(service.cancelOrder(order.orderId, {})).rejects.toThrow(
      /refund failed/i
    );

    // Order untouched: still CONFIRMED and PAID, stock still decremented.
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.orderStatus).toBe("CONFIRMED");
    expect(persisted.paymentStatus).toBe("PAID");
    expect((await Product.findById(product._id).lean()).stock).toBe(8);
  });

  it("does not call the refund API for COD orders", async () => {
    const { service, refundPayment } = buildService();
    const product = await seedProduct();
    const order = await seedOrder(service, { product, paymentMethod: "COD" });

    const cancelled = await service.cancelOrder(order.orderId, {});

    expect(refundPayment).not.toHaveBeenCalled();
    expect(cancelled.orderStatus).toBe("CANCELLED");
    expect(cancelled.paymentStatus).toBe("PENDING");
  });

  it("restores product-level stock on cancellation", async () => {
    const { service } = buildService();
    const product = await seedProduct({ stock: 10 });
    const order = await seedOrder(service, { product, quantity: 3 });
    expect((await Product.findById(product._id).lean()).stock).toBe(7);

    await service.cancelOrder(order.orderId, {});

    expect((await Product.findById(product._id).lean()).stock).toBe(10);
  });

  it("restores the color variant's stock for variant orders", async () => {
    const { service } = buildService();
    const product = await seedProduct({
      variants: [
        { color: "Red", stock: 5 },
        { color: "Blue", stock: 4 },
      ],
    });
    const order = await seedOrder(service, { product, color: "Red", quantity: 2 });

    let variants = (await Product.findById(product._id).lean()).variants;
    expect(variants.find((v) => v.color === "Red").stock).toBe(3);

    await service.cancelOrder(order.orderId, {});

    variants = (await Product.findById(product._id).lean()).variants;
    expect(variants.find((v) => v.color === "Red").stock).toBe(5);
    expect(variants.find((v) => v.color === "Blue").stock).toBe(4);
  });

  it("rejects cancelling an already-cancelled order (no double refund)", async () => {
    const { service, refundPayment } = buildService();
    const product = await seedProduct();
    const order = await seedOrder(service, { product, paymentMethod: "ONLINE" });

    await service.cancelOrder(order.orderId, {});
    expect(refundPayment).toHaveBeenCalledTimes(1);

    await expect(service.cancelOrder(order.orderId, {})).rejects.toThrow(
      /already cancelled/i
    );
    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it("resolves the order by Mongo _id as the admin UI sends it", async () => {
    const { service } = buildService();
    const product = await seedProduct();
    const order = await seedOrder(service, { product });

    const cancelled = await service.cancelOrder(String(order._id), {});
    expect(cancelled.orderStatus).toBe("CANCELLED");
  });

  /** Attach Shiprocket shipment references to a seeded order. */
  async function attachShipment(order, { shiprocketOrderId = "456789", awb = "AWB1", shipmentStatus = "CREATED" } = {}) {
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        "shipping.shiprocketOrderId": shiprocketOrderId,
        "shipping.awb": awb,
        shipmentStatus,
      },
    });
  }

  it("cancels the Shiprocket shipment after the refund and marks it CANCELLED", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: true });
    const { service, refundPayment } = buildService({
      shippingService: { cancelShipment },
    });
    const product = await seedProduct();
    const order = await seedOrder(service, { product, paymentMethod: "ONLINE" });
    await attachShipment(order);

    const cancelled = await service.cancelOrder(order.orderId, {});

    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(cancelShipment).toHaveBeenCalledTimes(1);
    expect(cancelled.shipmentStatus).toBe("CANCELLED");
    expect(cancelled.paymentStatus).toBe("REFUNDED");
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.shipmentStatus).toBe("CANCELLED");
  });

  it("still cancels (and refunds) when the Shiprocket cancellation fails", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: false, reason: "api down" });
    const { service } = buildService({
      shippingService: { cancelShipment },
    });
    const product = await seedProduct({ stock: 10 });
    const order = await seedOrder(service, { product, paymentMethod: "ONLINE", quantity: 2 });
    await attachShipment(order);

    const cancelled = await service.cancelOrder(order.orderId, {});

    // Order cancelled, money returned, stock restored…
    expect(cancelled.orderStatus).toBe("CANCELLED");
    expect(cancelled.paymentStatus).toBe("REFUNDED");
    expect((await Product.findById(product._id).lean()).stock).toBe(10);
    // …but the shipment is NOT marked cancelled, signalling manual follow-up.
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.shipmentStatus).toBe("CREATED");
  });

  it("does not call Shiprocket when the order has no shipment references", async () => {
    const cancelShipment = vi.fn();
    const { service } = buildService({
      shippingService: { cancelShipment },
    });
    const product = await seedProduct();
    const order = await seedOrder(service, { product });

    await service.cancelOrder(order.orderId, {});

    expect(cancelShipment).not.toHaveBeenCalled();
  });

  it("never cancels a shipment twice (already CANCELLED shipment)", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: true });
    const { service } = buildService({
      shippingService: { cancelShipment },
    });
    const product = await seedProduct();
    const order = await seedOrder(service, { product });
    await attachShipment(order, { shipmentStatus: "CANCELLED" });

    await service.cancelOrder(order.orderId, {});

    expect(cancelShipment).not.toHaveBeenCalled();
  });

  it("records request + success entries on the order timeline", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: true });
    const { service } = buildService({ shippingService: { cancelShipment } });
    const product = await seedProduct();
    const order = await seedOrder(service, { product });
    await attachShipment(order);

    await service.cancelOrder(order.orderId, {});

    const history = (await Order.findById(order._id).lean()).statusHistory;
    const statuses = history.map((h) => h.status);
    expect(statuses).toContain("SHIPMENT_CANCEL_REQUESTED");
    expect(statuses).toContain("SHIPMENT_CANCELLED");
    expect(statuses.at(-1)).toBe("CANCELLED");
    expect(
      history.find((h) => h.status === "SHIPMENT_CANCELLED").note
    ).toMatch(/cancelled successfully in shiprocket/i);
  });

  it("records a failed-cancellation entry on the timeline for support/audit", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: false, reason: "already picked up" });
    const { service } = buildService({ shippingService: { cancelShipment } });
    const product = await seedProduct();
    const order = await seedOrder(service, { product });
    await attachShipment(order);

    await service.cancelOrder(order.orderId, {});

    const history = (await Order.findById(order._id).lean()).statusHistory;
    const failed = history.find((h) => h.status === "SHIPMENT_CANCEL_FAILED");
    expect(failed).toBeDefined();
    expect(failed.note).toMatch(/manual cancellation required/i);
  });

  it("cancels via Shiprocket when only an AWB exists (no Shiprocket order id)", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: true });
    const { service } = buildService({ shippingService: { cancelShipment } });
    const product = await seedProduct();
    const order = await seedOrder(service, { product });
    await attachShipment(order, { shiprocketOrderId: null, awb: "AWB99" });

    const cancelled = await service.cancelOrder(order.orderId, {});

    expect(cancelShipment).toHaveBeenCalledTimes(1);
    expect(cancelled.shipmentStatus).toBe("CANCELLED");
  });

  it("records the Shiprocket outcome in the audit entry", async () => {
    const cancelShipment = vi.fn().mockResolvedValue({ ok: true });
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const { service } = buildService({
      shippingService: { cancelShipment },
    });
    const product = await seedProduct();
    const order = await seedOrder(service, { product });
    await attachShipment(order);

    await service.cancelOrder(order.orderId, { recordAudit });

    expect(recordAudit.mock.calls[0][0].metadata).toMatchObject({
      shiprocketShipment: true,
      shiprocketCancelled: true,
    });
  });
});
