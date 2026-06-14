// Feature: planet-of-toys-ecommerce, Property 17: Orders are created with correct initial state
import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createOrderService } from "./order.service.js";
import { Order, Counter } from "../models/index.js";

/**
 * Property 17: Orders are created with correct initial state.
 *
 * For any newly created order, `orderStatus == CONFIRMED`,
 * `shipmentStatus == PENDING`, and the status history contains an initial
 * entry recording `CONFIRMED` with a timestamp.
 *
 * Validates: Requirements 9.1, 11.4
 *
 * The service is exercised against an in-memory MongoDB with the external
 * integrations mocked (WhatsApp dispatch, online-payment signature
 * verification, and the out-of-band fulfilment trigger), matching the
 * conventions in order.service.test.js. Only successfully-created orders are
 * generated: ONLINE payments verify successfully so an order is always
 * produced, since the property concerns the initial state of created orders.
 */

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

/** Build a service whose external integrations are mocked for determinism. */
function buildService() {
  const whatsappService = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
  // Verified signature so an ONLINE order is always created (Req 5.3).
  const verifySignature = vi.fn().mockResolvedValue(true);
  const fulfilOrder = vi.fn().mockResolvedValue(undefined);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createOrderService({
    whatsappService,
    verifySignature,
    fulfilOrder,
    logger,
  });
  return service;
}

// A non-empty, trimmed-non-blank short string for free-text fields.
const textArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0);

// A plausible 12-digit phone number.
const phoneArb = fc
  .integer({ min: 100000000000, max: 999999999999 })
  .map((n) => String(n));

// A 6-digit pincode.
const pincodeArb = fc
  .integer({ min: 100000, max: 999999 })
  .map((n) => String(n));

const customerArb = fc.record({
  name: textArb,
  phone: phoneArb,
  email: fc.option(textArb.map((s) => `${s.trim()}@example.com`), { nil: undefined }),
  address: textArb,
  city: textArb,
  state: textArb,
  pincode: pincodeArb,
});

const itemArb = fc.record({
  productId: fc.constant(null).map(() => new mongoose.Types.ObjectId()),
  name: textArb,
  quantity: fc.integer({ min: 1, max: 10 }),
  unitPrice: fc.integer({ min: 1, max: 100000 }),
});

const inputArb = fc.record({
  customer: customerArb,
  items: fc.array(itemArb, { minLength: 1, maxLength: 5 }),
  amount: fc.integer({ min: 1, max: 1000000 }),
});

// Either a COD payment or a (verified) ONLINE payment with razorpay refs.
const paymentArb = fc.oneof(
  fc.constant({ method: "COD" }),
  fc.record({
    method: fc.constant("ONLINE"),
    razorpayOrderId: textArb.map((s) => `order_${s.trim()}`),
    razorpayPaymentId: textArb.map((s) => `pay_${s.trim()}`),
    signature: textArb,
  })
);

// Arbitrary captured attribution record (canonical or utm_* keys), possibly empty.
const utmArb = fc.dictionary(
  fc.constantFrom(
    "source",
    "medium",
    "campaign",
    "term",
    "content",
    "utm_source",
    "utm_medium",
    "utm_campaign"
  ),
  textArb
);

describe("Property 17: orders are created with correct initial state", () => {
  it("every created order is CONFIRMED/PENDING with a seeded CONFIRMED history entry", async () => {
    const service = buildService();

    await fc.assert(
      fc.asyncProperty(inputArb, paymentArb, utmArb, async (input, payment, utm) => {
        const { order } = await service.createOrder(input, payment, utm);

        // Order_Status is CONFIRMED on creation (Req 9.1).
        expect(order.orderStatus).toBe("CONFIRMED");
        // Shipment_Status is PENDING on creation (Req 11.4).
        expect(order.shipmentStatus).toBe("PENDING");

        // The status history is seeded with an initial CONFIRMED entry that
        // records the status and a timestamp.
        expect(Array.isArray(order.statusHistory)).toBe(true);
        expect(order.statusHistory.length).toBeGreaterThanOrEqual(1);
        const initial = order.statusHistory[0];
        expect(initial.status).toBe("CONFIRMED");
        expect(initial.timestamp).toBeInstanceOf(Date);
        expect(Number.isNaN(initial.timestamp.getTime())).toBe(false);

        // The persisted document holds the same initial state (round-trip).
        const persisted = await Order.findById(order._id).lean();
        expect(persisted.orderStatus).toBe("CONFIRMED");
        expect(persisted.shipmentStatus).toBe("PENDING");
        expect(persisted.statusHistory[0].status).toBe("CONFIRMED");
        expect(persisted.statusHistory[0].timestamp).toBeInstanceOf(Date);
      }),
      { numRuns: 100 }
    );
  });
});
