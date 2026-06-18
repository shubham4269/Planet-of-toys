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
import { Order, Counter, ORDER_STATUSES } from "../../models/index.js";

/**
 * Tests for the admin dashboard statistics aggregation (task 12.11, Req 15.1,
 * Property 28).
 *
 * `getDashboardStats` returns `{ orderCount, revenue, statusBreakdown }` over
 * the whole order set:
 *  - orderCount = size of the set
 *  - revenue = sum of `amount` over revenue-eligible (paymentStatus === "PAID")
 *    orders
 *  - statusBreakdown = per-Order_Status tally with EVERY status present,
 *    defaulting to 0
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
  return { service };
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

let orderSeq = 0;

/** Persist a single order with controllable status/payment/amount. */
async function seedOrder({ orderStatus, paymentStatus, amount } = {}) {
  orderSeq += 1;
  const orderId = `POT-240101-${String(orderSeq).padStart(4, "0")}`;
  return Order.create({
    orderId,
    customer: customer(),
    items: items(),
    amount: amount ?? 998,
    paymentMethod: "COD",
    paymentStatus: paymentStatus ?? "PENDING",
    orderStatus: orderStatus ?? "CONFIRMED",
    shipmentStatus: "PENDING",
    statusHistory: [{ status: orderStatus ?? "CONFIRMED", timestamp: new Date() }],
    razorpay: {},
    shipping: {},
  });
}

describe("order service - getDashboardStats (integration)", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Counter.deleteMany({});
    orderSeq = 0;
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("returns zeroed stats over an empty order set", async () => {
    const { service } = buildService();
    const stats = await service.getDashboardStats();

    expect(stats.orderCount).toBe(0);
    expect(stats.revenue).toBe(0);
    // Every status present and zeroed.
    expect(Object.keys(stats.statusBreakdown).sort()).toEqual([...ORDER_STATUSES].sort());
    expect(Object.values(stats.statusBreakdown).every((c) => c === 0)).toBe(true);
  });

  it("counts the full order set regardless of status or payment", async () => {
    const { service } = buildService();
    await seedOrder({ orderStatus: "CONFIRMED", paymentStatus: "PENDING" });
    await seedOrder({ orderStatus: "SHIPPED", paymentStatus: "PAID" });
    await seedOrder({ orderStatus: "CANCELLED", paymentStatus: "FAILED" });

    const stats = await service.getDashboardStats();
    expect(stats.orderCount).toBe(3);
  });

  it("sums revenue only over PAID (revenue-eligible) orders", async () => {
    const { service } = buildService();
    await seedOrder({ paymentStatus: "PAID", amount: 1000 });
    await seedOrder({ paymentStatus: "PAID", amount: 250 });
    await seedOrder({ paymentStatus: "PENDING", amount: 500 }); // excluded
    await seedOrder({ paymentStatus: "FAILED", amount: 999 }); // excluded

    const stats = await service.getDashboardStats();
    expect(stats.revenue).toBe(1250);
  });

  it("tallies the status breakdown with every status present and counts summing to orderCount", async () => {
    const { service } = buildService();
    await seedOrder({ orderStatus: "CONFIRMED" });
    await seedOrder({ orderStatus: "CONFIRMED" });
    await seedOrder({ orderStatus: "SHIPPED" });
    await seedOrder({ orderStatus: "DELIVERED" });
    await seedOrder({ orderStatus: "CANCELLED" });

    const stats = await service.getDashboardStats();

    expect(stats.statusBreakdown.CONFIRMED).toBe(2);
    expect(stats.statusBreakdown.SHIPPED).toBe(1);
    expect(stats.statusBreakdown.DELIVERED).toBe(1);
    expect(stats.statusBreakdown.CANCELLED).toBe(1);
    // Untouched statuses default to 0.
    expect(stats.statusBreakdown.PACKED).toBe(0);
    expect(stats.statusBreakdown.OUT_FOR_DELIVERY).toBe(0);
    expect(stats.statusBreakdown.RTO).toBe(0);

    // Every known status is present as a key.
    expect(Object.keys(stats.statusBreakdown).sort()).toEqual([...ORDER_STATUSES].sort());
    // The breakdown counts sum to the total order count.
    const sum = Object.values(stats.statusBreakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.orderCount);
  });

  it("returns the shape consumed by GET /api/admin/dashboard", async () => {
    const { service } = buildService();
    await seedOrder({ orderStatus: "DELIVERED", paymentStatus: "PAID", amount: 750 });

    const stats = await service.getDashboardStats();
    expect(stats).toEqual({
      orderCount: 1,
      revenue: 750,
      statusBreakdown: expect.objectContaining({ DELIVERED: 1 }),
    });
  });
});
