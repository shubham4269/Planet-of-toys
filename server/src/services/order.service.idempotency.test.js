// Idempotency: applyStatusChange must not re-notify / re-record when the order
// is already in the target status. This prevents duplicate WhatsApp messages
// from Shiprocket webhooks where several courier statuses (PICKED UP, SHIPPED,
// IN TRANSIT) all map to SHIPPED, and from webhook redeliveries.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createOrderService } from "./order.service.js";
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
  return { service, whatsappService };
}

describe("applyStatusChange idempotency", () => {
  let mongod;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterEach(async () => { await Order.deleteMany({}); await Counter.deleteMany({}); vi.clearAllMocks(); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });

  it("does not re-send notifications or re-append history when status is unchanged", async () => {
    const { service, whatsappService } = buildService();
    const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});
    // AWB must exist for the SHIPPED notification to be sent at all.
    order.shipping.awb = "AWB123456";
    order.shipping.courier = "Delhivery";
    await order.save();
    whatsappService.sendNotification.mockClear();

    const historyBefore = order.statusHistory.length;

    // First transition to SHIPPED: fires both shipped templates, one history entry.
    await service.applyStatusChange(order, "SHIPPED");
    expect(whatsappService.sendNotification.mock.calls.map((c) => c[1]))
      .toEqual(["shipment-created", "order-shipped"]);
    expect(order.statusHistory.length).toBe(historyBefore + 1);

    whatsappService.sendNotification.mockClear();

    // Repeat SHIPPED (e.g. PICKED UP→SHIPPED then IN TRANSIT→SHIPPED, or a
    // webhook redelivery): must be a no-op — no messages, no new history.
    const reloaded = await Order.findById(order._id);
    await service.applyStatusChange(reloaded, "SHIPPED");
    expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    expect(reloaded.statusHistory.length).toBe(historyBefore + 1);
  });

  it("still notifies for genuine status changes", async () => {
    const { service, whatsappService } = buildService();
    const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});
    order.shipping.awb = "AWB123456";
    order.shipping.courier = "Delhivery";
    await order.save();
    whatsappService.sendNotification.mockClear();

    await service.applyStatusChange(order, "SHIPPED");
    whatsappService.sendNotification.mockClear();

    // A different, forward status must still fire its template.
    await service.applyStatusChange(order, "OUT_FOR_DELIVERY");
    expect(whatsappService.sendNotification.mock.calls.map((c) => c[1])).toEqual(["out-for-delivery"]);
  });
});
