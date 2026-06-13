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
  buildOrderListQuery,
  escapeRegExp,
  normalizePage,
  normalizePageSize,
  toAdminOrderDetail,
  DEFAULT_ORDER_PAGE_SIZE,
  MAX_ORDER_PAGE_SIZE,
} from "./order.service.js";
import { Order, Counter } from "../models/index.js";

/**
 * Tests for admin order listing and detail (task 12.9, Req 17.1, 17.2).
 *
 * Covers the filtered/searchable/paginated `listOrders` and the full
 * `getOrderDetail` projection (customer, payment, shipment, Shipment_Status,
 * and the status-history timeline). Pagination is exercised for the
 * non-overlapping / full-coverage guarantee underpinning Property 31.
 */

/** Build a service with mocked external integrations for deterministic tests. */
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

const customer = (overrides = {}) => ({
  name: "Asha Rao",
  phone: "919876543210",
  email: "asha@example.com",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
  ...overrides,
});

const items = () => [
  { productId: new mongoose.Types.ObjectId(), name: "Wooden Train", quantity: 2, unitPrice: 499 },
];

/** Persist an order directly with a fixed createdAt for deterministic ordering. */
async function seedOrder({ orderId, createdAt, ...overrides }) {
  return Order.create({
    orderId,
    customer: customer(overrides.customer),
    items: items(),
    amount: overrides.amount ?? 998,
    paymentMethod: overrides.paymentMethod ?? "COD",
    paymentStatus: overrides.paymentStatus ?? "PENDING",
    orderStatus: overrides.orderStatus ?? "CONFIRMED",
    shipmentStatus: overrides.shipmentStatus ?? "PENDING",
    statusHistory: overrides.statusHistory ?? [{ status: "CONFIRMED", timestamp: createdAt }],
    razorpay: overrides.razorpay ?? {},
    shipping: overrides.shipping ?? {},
    createdAt,
    updatedAt: createdAt,
  });
}

describe("order service - listing helpers (unit)", () => {
  it("escapeRegExp escapes all regex metacharacters", () => {
    expect(escapeRegExp("a.b*c+(d)")).toBe("a\\.b\\*c\\+\\(d\\)");
  });

  it("buildOrderListQuery honours only whitelisted filter fields", () => {
    const query = buildOrderListQuery(
      { orderStatus: "SHIPPED", paymentStatus: "PAID", bogus: "x", empty: "" },
      ""
    );
    expect(query).toEqual({ orderStatus: "SHIPPED", paymentStatus: "PAID" });
    expect(query).not.toHaveProperty("bogus");
  });

  it("buildOrderListQuery builds a case-insensitive literal search across fields", () => {
    const query = buildOrderListQuery({}, "Asha");
    expect(query.$or).toHaveLength(4);
    expect(query.$or[0].orderId).toBeInstanceOf(RegExp);
    expect(query.$or[0].orderId.flags).toContain("i");
    expect("POT-240101-ASHA".match(query.$or[0].orderId)).not.toBeNull();
  });

  it("normalizePage and normalizePageSize clamp invalid input", () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage("3")).toBe(3);
    expect(normalizePageSize(undefined)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizePageSize(0)).toBe(DEFAULT_ORDER_PAGE_SIZE);
    expect(normalizePageSize(5)).toBe(5);
    expect(normalizePageSize(99999)).toBe(MAX_ORDER_PAGE_SIZE);
  });

  it("toAdminOrderDetail surfaces operational fields with an oldest-first timeline", () => {
    const detail = toAdminOrderDetail({
      orderId: "POT-240101-0001",
      orderStatus: "SHIPPED",
      shipmentStatus: "CREATED",
      paymentMethod: "ONLINE",
      paymentStatus: "PAID",
      amount: 998,
      items: [{ productId: "p", name: "Train", quantity: 2, unitPrice: 499 }],
      customer: { name: "Asha", phone: "999", email: "a@b.com" },
      razorpay: { orderId: "o", paymentId: "p" },
      shipping: { awb: "AWB1", courier: "BlueDart", shiprocketOrderId: "SR1" },
      utm: { source: "meta" },
      statusHistory: [
        { status: "SHIPPED", timestamp: new Date("2024-01-02T00:00:00Z") },
        { status: "CONFIRMED", timestamp: new Date("2024-01-01T00:00:00Z") },
      ],
    });

    expect(detail.payment).toEqual({
      method: "ONLINE",
      status: "PAID",
      razorpay: { orderId: "o", paymentId: "p" },
    });
    expect(detail.shipment).toEqual({ awb: "AWB1", courier: "BlueDart", shiprocketOrderId: "SR1" });
    expect(detail.shipmentStatus).toBe("CREATED");
    expect(detail.timeline.map((t) => t.status)).toEqual(["CONFIRMED", "SHIPPED"]);
  });

  it("toAdminOrderDetail returns null for a missing order", () => {
    expect(toAdminOrderDetail(null)).toBeNull();
  });
});

describe("order service - listOrders and getOrderDetail (integration)", () => {
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

  /** Seed N orders with strictly increasing createdAt and distinct ids. */
  async function seedMany(n) {
    const base = Date.parse("2024-01-01T00:00:00Z");
    const created = [];
    for (let i = 0; i < n; i += 1) {
      created.push(
        await seedOrder({
          orderId: `POT-240101-${String(i + 1).padStart(4, "0")}`,
          createdAt: new Date(base + i * 60_000),
        })
      );
    }
    return created;
  }

  it("returns orders newest-first with pagination metadata", async () => {
    const { service } = buildService();
    await seedMany(5);

    const result = await service.listOrders({ page: 1, pageSize: 2 });
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.orders).toHaveLength(2);
    // Newest-first: order 5 then order 4.
    expect(result.orders[0].orderId).toBe("POT-240101-0005");
    expect(result.orders[1].orderId).toBe("POT-240101-0004");
  });

  it("paginates without overlap and covers exactly the matching set (Property 31)", async () => {
    const { service } = buildService();
    await seedMany(7);

    const pageSize = 3;
    const seen = [];
    for (let page = 1; page <= 3; page += 1) {
      const { orders } = await service.listOrders({ page, pageSize });
      seen.push(...orders.map((o) => o.orderId));
    }

    // No overlap across pages.
    expect(new Set(seen).size).toBe(seen.length);
    // Full coverage of every seeded order.
    expect(new Set(seen)).toEqual(
      new Set(
        Array.from({ length: 7 }, (_, i) => `POT-240101-${String(i + 1).padStart(4, "0")}`)
      )
    );
  });

  it("filters by exact orderStatus and ignores non-matching orders", async () => {
    const { service } = buildService();
    const base = Date.parse("2024-01-01T00:00:00Z");
    await seedOrder({ orderId: "POT-240101-0001", createdAt: new Date(base), orderStatus: "CONFIRMED" });
    await seedOrder({ orderId: "POT-240101-0002", createdAt: new Date(base + 1000), orderStatus: "SHIPPED" });
    await seedOrder({ orderId: "POT-240101-0003", createdAt: new Date(base + 2000), orderStatus: "SHIPPED" });

    const result = await service.listOrders({ filter: { orderStatus: "SHIPPED" } });
    expect(result.total).toBe(2);
    expect(result.orders.every((o) => o.orderStatus === "SHIPPED")).toBe(true);
  });

  it("searches by customer name and order id case-insensitively", async () => {
    const { service } = buildService();
    const base = Date.parse("2024-01-01T00:00:00Z");
    await seedOrder({
      orderId: "POT-240101-0001",
      createdAt: new Date(base),
      customer: { name: "Asha Rao" },
    });
    await seedOrder({
      orderId: "POT-240101-0002",
      createdAt: new Date(base + 1000),
      customer: { name: "Vikram Singh" },
    });

    const byName = await service.listOrders({ search: "vikram" });
    expect(byName.total).toBe(1);
    expect(byName.orders[0].customer.name).toBe("Vikram Singh");

    const byId = await service.listOrders({ search: "0001" });
    expect(byId.total).toBe(1);
    expect(byId.orders[0].orderId).toBe("POT-240101-0001");
  });

  it("getOrderDetail returns full detail with customer, payment, shipment, status, and timeline (Req 17.2)", async () => {
    const { service } = buildService();
    const base = Date.parse("2024-01-01T00:00:00Z");
    await seedOrder({
      orderId: "POT-240101-0001",
      createdAt: new Date(base),
      paymentMethod: "ONLINE",
      paymentStatus: "PAID",
      shipmentStatus: "CREATED",
      razorpay: { orderId: "order_x", paymentId: "pay_y" },
      shipping: { awb: "AWB9", courier: "Delhivery", shiprocketOrderId: "SR9" },
      statusHistory: [
        { status: "CONFIRMED", timestamp: new Date(base) },
        { status: "SHIPPED", timestamp: new Date(base + 5000) },
      ],
    });

    const detail = await service.getOrderDetail("POT-240101-0001");
    expect(detail.customer.name).toBe("Asha Rao");
    expect(detail.payment).toMatchObject({
      method: "ONLINE",
      status: "PAID",
      razorpay: { orderId: "order_x", paymentId: "pay_y" },
    });
    expect(detail.shipment).toMatchObject({ awb: "AWB9", courier: "Delhivery", shiprocketOrderId: "SR9" });
    expect(detail.shipmentStatus).toBe("CREATED");
    expect(detail.timeline.map((t) => t.status)).toEqual(["CONFIRMED", "SHIPPED"]);
  });

  it("getOrderDetail resolves by Mongo _id as a fallback", async () => {
    const { service } = buildService();
    const order = await seedOrder({
      orderId: "POT-240101-0001",
      createdAt: new Date(),
    });

    const detail = await service.getOrderDetail(order._id.toString());
    expect(detail.orderId).toBe("POT-240101-0001");
  });

  it("getOrderDetail throws a 404 for an unknown order", async () => {
    const { service } = buildService();
    await expect(service.getOrderDetail("POT-000000-9999")).rejects.toThrow();
  });
});
