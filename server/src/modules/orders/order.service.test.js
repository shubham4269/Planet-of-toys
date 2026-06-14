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
import {
  createOrderService,
  normalizeUtm,
  toCustomerProjection,
  PaymentVerificationError,
  STATUS_NOTIFICATION_TEMPLATES,
} from "./order.service.js";
import { Order, Counter, AuditLog } from "../models/index.js";

/**
 * Unit tests for the Order Service (task 12.1).
 *
 * Covers order creation initial state (Req 9.1, 11.4), UTM persistence
 * (Req 2.2), online payment PAID/FAILED outcomes (Req 5.3, 5.4), the
 * order-confirmed WhatsApp dispatch (Req 13.1), the decoupled out-of-band
 * fulfilment trigger and its failure isolation (Req 11.9), and the
 * customer-facing projection that carries no shipping/technical detail.
 */

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

/** Build a service with mocked external integrations for deterministic tests. */
function buildService(overrides = {}) {
  const whatsappService = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
  const verifySignature = overrides.verifySignature ?? vi.fn().mockResolvedValue(true);
  const fulfilOrder = overrides.fulfilOrder ?? vi.fn().mockResolvedValue(undefined);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createOrderService({
    whatsappService,
    verifySignature,
    fulfilOrder,
    logger,
    ...overrides.serviceOptions,
  });
  return { service, whatsappService, verifySignature, fulfilOrder, logger };
}

describe("order service - createOrder", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Counter.deleteMany({});
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("creates a COD order CONFIRMED/PENDING with seeded history and sequential id (Req 9.1, 11.4)", async () => {
    const { service } = buildService();
    const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});

    expect(order.orderStatus).toBe("CONFIRMED");
    expect(order.shipmentStatus).toBe("PENDING");
    expect(order.paymentMethod).toBe("COD");
    expect(order.paymentStatus).toBe("PENDING");
    expect(order.orderId).toMatch(/^POT-[2-9A-HJKMNP-Z]{5}$/);
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0].status).toBe("CONFIRMED");
  });

  it("persists the captured UTM attribution with the order (Req 2.2)", async () => {
    const { service } = buildService();
    const utm = {
      utm_source: "meta",
      utm_medium: "cpc",
      utm_campaign: "summer",
      utm_term: "trains",
      utm_content: "ad-a",
    };
    const { order } = await service.createOrder(baseInput(), { method: "COD" }, utm);

    const persisted = await Order.findById(order._id).lean();
    expect(persisted.utm).toMatchObject({
      source: "meta",
      medium: "cpc",
      campaign: "summer",
      term: "trains",
      content: "ad-a",
    });
  });

  it("sets PAID for a verified ONLINE payment and stores razorpay refs (Req 5.3)", async () => {
    const { service, verifySignature } = buildService({
      verifySignature: vi.fn().mockResolvedValue(true),
    });
    const { order } = await service.createOrder(
      baseInput(),
      {
        method: "ONLINE",
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_456",
        signature: "sig",
      },
      {}
    );

    expect(verifySignature).toHaveBeenCalledWith("order_123", "pay_456", "sig");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.razorpay.orderId).toBe("order_123");
    expect(order.razorpay.paymentId).toBe("pay_456");
  });

  it("rejects a failed ONLINE verification without creating any order (Req 5.4)", async () => {
    const { service } = buildService({
      verifySignature: vi.fn().mockResolvedValue(false),
    });

    await expect(
      service.createOrder(
        baseInput(),
        { method: "ONLINE", razorpayOrderId: "o", razorpayPaymentId: "p", signature: "bad" },
        {}
      )
    ).rejects.toBeInstanceOf(PaymentVerificationError);

    expect(await Order.countDocuments()).toBe(0);
  });

  it("dispatches the order-confirmed WhatsApp notification on creation (Req 13.1)", async () => {
    const { service, whatsappService } = buildService();
    const input = baseInput();
    await service.createOrder(input, { method: "COD" }, {});

    expect(whatsappService.sendNotification).toHaveBeenCalledTimes(1);
    const [phone, template] = whatsappService.sendNotification.mock.calls[0];
    expect(phone).toBe(input.customer.phone);
    expect(template).toBe("order-confirmed");
  });

  it("triggers out-of-band fulfilment with the created order (Req 11.9)", async () => {
    const { service, fulfilOrder } = buildService();
    const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});
    // Allow the fire-and-forget microtask to run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(fulfilOrder).toHaveBeenCalledTimes(1);
    expect(fulfilOrder.mock.calls[0][0].orderId).toBe(order.orderId);
  });

  it("keeps the order created even when fulfilment fails, surfacing no error (Req 11.9)", async () => {
    const fulfilOrder = vi.fn().mockRejectedValue(new Error("Shiprocket down"));
    const { service, logger } = buildService({ fulfilOrder });

    const { order, customer } = await service.createOrder(baseInput(), { method: "COD" }, {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(await Order.countDocuments()).toBe(1);
    expect(order.shipmentStatus).toBe("PENDING");
    expect(logger.error).toHaveBeenCalled();
    // The customer projection never leaks shipping/technical detail.
    expect(customer).not.toHaveProperty("shipping");
    expect(customer).not.toHaveProperty("shipmentStatus");
    expect(customer).not.toHaveProperty("razorpay");
    expect(customer).not.toHaveProperty("utm");
    expect(customer.orderId).toBe(order.orderId);
  });
});

describe("order service - applyStatusChange and cancelOrder", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Counter.deleteMany({});
    await AuditLog.deleteMany({});
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  /** Create a persisted CONFIRMED order to transition. */
  async function seedOrder(service) {
    const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});
    return order;
  }

  it("appends exactly one status-history entry per change with the new status (Req 9.4, 12.2)", async () => {
    const { service } = buildService();
    const order = await seedOrder(service);
    const startLen = order.statusHistory.length;

    await service.applyStatusChange(order, "PACKED");
    await service.applyStatusChange(order, "SHIPPED");

    const persisted = await Order.findById(order._id).lean();
    expect(persisted.orderStatus).toBe("SHIPPED");
    expect(persisted.statusHistory).toHaveLength(startLen + 2);
    const last = persisted.statusHistory[persisted.statusHistory.length - 1];
    expect(last.status).toBe("SHIPPED");
    expect(last.timestamp).toBeInstanceOf(Date);
  });

  it("dispatches both shipment-created and order-shipped on SHIPPED (Req 13.2)", async () => {
    const { service, whatsappService } = buildService();
    const order = await seedOrder(service);
    whatsappService.sendNotification.mockClear();

    await service.applyStatusChange(order, "SHIPPED");

    const templates = whatsappService.sendNotification.mock.calls.map((c) => c[1]);
    expect(templates).toEqual(["shipment-created", "order-shipped"]);
    whatsappService.sendNotification.mock.calls.forEach((call) => {
      expect(call[0]).toBe(order.customer.phone);
    });
  });

  it("dispatches the single mapped template for OUT_FOR_DELIVERY, DELIVERED, CANCELLED (Req 13.3-13.5)", async () => {
    for (const [status, expected] of [
      ["OUT_FOR_DELIVERY", "out-for-delivery"],
      ["DELIVERED", "delivered"],
      ["CANCELLED", "cancelled"],
    ]) {
      const { service, whatsappService } = buildService();
      const order = await seedOrder(service);
      whatsappService.sendNotification.mockClear();

      await service.applyStatusChange(order, status);

      const templates = whatsappService.sendNotification.mock.calls.map((c) => c[1]);
      expect(templates).toEqual([expected]);
    }
  });

  it("dispatches no WhatsApp template for non-notify statuses but still appends history (PACKED)", async () => {
    const { service, whatsappService } = buildService();
    const order = await seedOrder(service);
    whatsappService.sendNotification.mockClear();

    await service.applyStatusChange(order, "PACKED");

    expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.orderStatus).toBe("PACKED");
    expect(persisted.statusHistory.at(-1).status).toBe("PACKED");
  });

  it("rejects an unknown status without persisting a change", async () => {
    const { service } = buildService();
    const order = await seedOrder(service);
    const before = order.statusHistory.length;

    await expect(service.applyStatusChange(order, "NOPE")).rejects.toThrow();
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.orderStatus).toBe("CONFIRMED");
    expect(persisted.statusHistory).toHaveLength(before);
  });

  it("cancelOrder sets CANCELLED, appends history, and records an audit entry (Req 17.3, 26.3)", async () => {
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const { service, whatsappService } = buildService();
    const order = await seedOrder(service);
    const adminId = new mongoose.Types.ObjectId().toString();
    whatsappService.sendNotification.mockClear();

    const cancelled = await service.cancelOrder(order.orderId, { adminId, recordAudit });

    expect(cancelled.orderStatus).toBe("CANCELLED");
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.orderStatus).toBe("CANCELLED");
    expect(persisted.statusHistory.at(-1).status).toBe("CANCELLED");

    // Cancelled WhatsApp notification dispatched (Req 13.5).
    const templates = whatsappService.sendNotification.mock.calls.map((c) => c[1]);
    expect(templates).toEqual(["cancelled"]);

    // Audit entry captures the action, admin, and order (Req 26.3).
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      action: "order.cancel",
      adminId,
      targetType: "Order",
      targetId: order.orderId,
    });
  });

  it("cancelOrder defaults recordAudit to a no-op and still cancels", async () => {
    const { service } = buildService();
    const order = await seedOrder(service);

    const cancelled = await service.cancelOrder(order.orderId, {});
    expect(cancelled.orderStatus).toBe("CANCELLED");
  });

  it("cancelOrder throws a not-found error for an unknown order id", async () => {
    const { service } = buildService();
    await expect(service.cancelOrder("POT-000000-0000", {})).rejects.toThrow();
  });

  it("cancelOrder still cancels even when the audit recorder throws", async () => {
    const recordAudit = vi.fn().mockRejectedValue(new Error("audit down"));
    const { service, logger } = buildService();
    const order = await seedOrder(service);

    const cancelled = await service.cancelOrder(order.orderId, {
      adminId: "admin-1",
      recordAudit,
    });

    expect(cancelled.orderStatus).toBe("CANCELLED");
    expect(logger.error).toHaveBeenCalled();
  });

  it("exposes the documented status->template mapping", () => {
    expect(STATUS_NOTIFICATION_TEMPLATES.SHIPPED).toEqual([
      "shipment-created",
      "order-shipped",
    ]);
    expect(STATUS_NOTIFICATION_TEMPLATES.OUT_FOR_DELIVERY).toEqual(["out-for-delivery"]);
    expect(STATUS_NOTIFICATION_TEMPLATES.DELIVERED).toEqual(["delivered"]);
    expect(STATUS_NOTIFICATION_TEMPLATES.CANCELLED).toEqual(["cancelled"]);
  });
});

describe("order service - helpers", () => {
  it("normalizeUtm maps utm_* and canonical keys, defaulting missing to null", () => {
    expect(normalizeUtm({ utm_source: "meta", medium: "cpc" })).toEqual({
      source: "meta",
      medium: "cpc",
      campaign: null,
      term: null,
      content: null,
    });
    expect(normalizeUtm(null)).toEqual({
      source: null,
      medium: null,
      campaign: null,
      term: null,
      content: null,
    });
  });

  it("toCustomerProjection excludes shipping and technical fields", () => {
    const projection = toCustomerProjection({
      orderId: "POT-240101-0001",
      orderStatus: "CONFIRMED",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      amount: 998,
      items: [{ name: "Train", quantity: 2, unitPrice: 499, productId: "x" }],
      customer: { name: "Asha", phone: "9990001112" },
      shipping: { awb: "AWB1", courier: "BlueDart" },
      shipmentStatus: "PENDING",
      razorpay: { orderId: "o", paymentId: "p" },
      utm: { source: "meta" },
      statusHistory: [{ status: "CONFIRMED" }],
    });

    expect(projection).toEqual({
      orderId: "POT-240101-0001",
      orderStatus: "CONFIRMED",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      amount: 998,
      items: [{ name: "Train", quantity: 2, unitPrice: 499, color: null }],
      customer: { name: "Asha" },
      createdAt: undefined,
    });
  });
});
