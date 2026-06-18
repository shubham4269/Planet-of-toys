// Shiprocket tracking link in SHIPPED notifications.
//
// Proves the SHIPPED templates receive { orderId, awb, courier, trackingUrl },
// that the tracking URL is built from the AWB, that a missing AWB suppresses the
// SHIPPED notification (no blank tracking number), and that duplicate SHIPPED
// webhooks do not produce duplicate tracking messages.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  createOrderService,
  buildTrackingUrl,
  SHIPROCKET_TRACKING_BASE,
} from "./order.service.js";
import { Order, Counter } from "../models/index.js";

const baseInput = () => ({
  customer: {
    name: "Asha Rao",
    phone: "919876543210",
    email: "asha@example.com",
    address: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  items: [
    { productId: new mongoose.Types.ObjectId(), name: "Wooden Train", quantity: 2, unitPrice: 499 },
  ],
  amount: 998,
});

function buildService() {
  const whatsappService = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createOrderService({
    whatsappService,
    verifySignature: vi.fn().mockResolvedValue(true),
    fulfilOrder: vi.fn().mockResolvedValue(undefined),
    logger,
  });
  return { service, whatsappService, logger };
}

/** Create an order and (optionally) attach AWB/courier, returning the doc. */
async function seedOrder(service, { awb, courier } = {}) {
  const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});
  if (awb !== undefined) {
    order.shipping.awb = awb;
    order.shipping.courier = courier ?? null;
    await order.save();
  }
  return order;
}

describe("buildTrackingUrl", () => {
  it("builds the Shiprocket tracking URL from the AWB", () => {
    expect(buildTrackingUrl("ABC123")).toBe(`${SHIPROCKET_TRACKING_BASE}/ABC123`);
    expect(buildTrackingUrl("ABC123")).toBe("https://shiprocket.co/tracking/ABC123");
  });
  it("returns null when there is no AWB", () => {
    expect(buildTrackingUrl(null)).toBeNull();
    expect(buildTrackingUrl("")).toBeNull();
    expect(buildTrackingUrl("   ")).toBeNull();
    expect(buildTrackingUrl(undefined)).toBeNull();
  });
});

describe("SHIPPED notification tracking details", () => {
  let mongod;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterEach(async () => { await Order.deleteMany({}); await Counter.deleteMany({}); vi.clearAllMocks(); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });

  it("includes orderId, awb, courier, and trackingUrl in the SHIPPED templates", async () => {
    const { service, whatsappService } = buildService();
    const order = await seedOrder(service, { awb: "AWB777", courier: "Delhivery" });
    whatsappService.sendNotification.mockClear();

    await service.applyStatusChange(order, "SHIPPED");

    const calls = whatsappService.sendNotification.mock.calls;
    expect(calls.map((c) => c[1])).toEqual(["shipment-created", "order-shipped"]);
    for (const call of calls) {
      const params = call[2];
      expect(params.orderId).toBe(order.orderId);
      expect(params.awb).toBe("AWB777");
      expect(params.courier).toBe("Delhivery");
      expect(params.trackingUrl).toBe("https://shiprocket.co/tracking/AWB777");
    }
  });

  it("does NOT send SHIPPED notifications when the AWB is missing", async () => {
    const { service, whatsappService, logger } = buildService();
    const order = await seedOrder(service); // no AWB assigned
    whatsappService.sendNotification.mockClear();

    await service.applyStatusChange(order, "SHIPPED");

    expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    // The status transition itself still happened (history recorded).
    expect(order.orderStatus).toBe("SHIPPED");
  });

  it("does not send duplicate tracking messages for repeated SHIPPED webhooks", async () => {
    const { service, whatsappService } = buildService();
    const order = await seedOrder(service, { awb: "AWB777", courier: "Delhivery" });
    whatsappService.sendNotification.mockClear();

    // First SHIPPED (e.g. PICKED UP -> SHIPPED): sends the pair once.
    await service.applyStatusChange(order, "SHIPPED");
    expect(whatsappService.sendNotification).toHaveBeenCalledTimes(2);

    whatsappService.sendNotification.mockClear();

    // Second SHIPPED (e.g. IN TRANSIT -> SHIPPED, or a webhook redelivery):
    // blocked by the idempotency guard — no duplicate tracking messages.
    const reloaded = await Order.findById(order._id);
    await service.applyStatusChange(reloaded, "SHIPPED");
    expect(whatsappService.sendNotification).not.toHaveBeenCalled();
  });
});
