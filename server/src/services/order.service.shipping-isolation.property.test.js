// Feature: planet-of-toys-ecommerce, Property 22: Shipping-provider failure never blocks or leaks to the customer order
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createOrderService } from "./order.service.js";
import { Order, Counter } from "../models/index.js";

/**
 * Property 22: Shipping-provider failure never blocks or leaks to the customer
 * order.
 *
 * For any Shiprocket error or unavailability during order creation, courier
 * assignment, or AWB generation, the customer order is retained as successfully
 * created, `shipmentStatus` remains `PENDING`, the customer-facing response
 * indicates success and contains no shipping-provider or technical-failure
 * detail.
 *
 * Here the out-of-band fulfilment (`fulfilOrder`) is driven to fail across the
 * full space of realistic failure modes — a synchronous throw, an asynchronous
 * rejection, Error and non-Error payloads — while order inputs (COD/ONLINE,
 * customers, items, attribution) vary. In every case `createOrder` must resolve
 * with a successful, persisted CONFIRMED/PENDING order whose customer
 * projection carries only the order identifier and a non-technical summary.
 *
 * Validates: Requirements 11.5, 11.9, 17.6
 */

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await Order.deleteMany({});
  await Counter.deleteMany({});
  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// ---------------------------------------------------------------------------
// Generators — constrained to the valid order-input space.
// ---------------------------------------------------------------------------

// Free text restricted to letters/spaces so it can never contain the
// underscore-delimited failure markers asserted-absent below.
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ".split("");
const textArb = fc
  .array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: 18 })
  .map((chars) => chars.join(""))
  .filter((s) => s.trim().length > 0);

const digitsArb = (min, max) =>
  fc
    .array(fc.constantFrom(..."0123456789".split("")), {
      minLength: min,
      maxLength: max,
    })
    .map((d) => d.join(""));

const customerArb = fc.record({
  name: textArb,
  phone: digitsArb(10, 12),
  email: fc.constant(""),
  address: textArb,
  city: textArb,
  state: textArb,
  pincode: digitsArb(6, 6),
});

const itemArb = fc.record({
  productId: fc.constant(null).map(() => new mongoose.Types.ObjectId()),
  name: textArb,
  quantity: fc.integer({ min: 1, max: 10 }),
  unitPrice: fc.integer({ min: 0, max: 5000 }),
});

const inputArb = fc.record({
  customer: customerArb,
  items: fc.array(itemArb, { minLength: 1, maxLength: 4 }),
  amount: fc.integer({ min: 0, max: 100000 }),
});

// Payment descriptor: COD, or a verified ONLINE payment (signature mocked true).
const paymentArb = fc.oneof(
  fc.constant({ method: "COD" }),
  fc.record({
    method: fc.constant("ONLINE"),
    razorpayOrderId: fc.constant("order_test"),
    razorpayPaymentId: fc.constant("pay_test"),
    signature: fc.constant("sig_test"),
  })
);

// Optional captured attribution.
const utmArb = fc.oneof(
  fc.constant({}),
  fc.record({
    utm_source: textArb,
    utm_medium: textArb,
    utm_campaign: textArb,
  })
);

// The full failure space for the out-of-band fulfilment attempt: a synchronous
// throw vs. an async rejection, carrying an Error, a raw string, or an object
// stuffed with shipping-provider/technical detail.
const failureArb = fc.record({
  mode: fc.constantFrom("throw", "reject"),
  payloadKind: fc.constantFrom("error", "string", "object"),
  marker: fc
    .integer({ min: 0, max: 0xffffffff })
    .map((n) => `__SHIPROCKET_FAILURE_${n.toString(16)}__`),
});

/**
 * Build a fulfilment function that fails per the generated `failure`. The
 * failure payload embeds the unique `marker` plus simulated shipping-provider
 * detail (AWB, courier, Shiprocket order id) — none of which may ever appear in
 * the customer-facing response.
 */
function buildFailingFulfilment({ mode, payloadKind, marker }) {
  const makePayload = () => {
    const detail = {
      marker,
      awb: `AWB-${marker}`,
      courier: `BlueDart-${marker}`,
      shiprocketOrderId: `SR-${marker}`,
    };
    if (payloadKind === "string") return marker;
    if (payloadKind === "object") return detail;
    const err = new Error(`Shiprocket unavailable: ${marker}`);
    Object.assign(err, detail);
    return err;
  };

  return vi.fn((order) => {
    if (!order) throw new Error("order must be passed to fulfilment");
    if (mode === "throw") {
      throw makePayload();
    }
    return Promise.reject(makePayload());
  });
}

/** Build an order service whose external integrations are mocked. */
function buildService(failure) {
  const whatsappService = {
    sendNotification: vi.fn().mockResolvedValue({ ok: true }),
  };
  const verifySignature = vi.fn().mockResolvedValue(true);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const fulfilOrder = buildFailingFulfilment(failure);
  const service = createOrderService({
    whatsappService,
    verifySignature,
    fulfilOrder,
    logger,
  });
  return { service, whatsappService, verifySignature, logger, fulfilOrder };
}

// Keys that must never appear in the customer-facing projection because they
// expose shipping-provider or other technical/internal detail.
const FORBIDDEN_CUSTOMER_KEYS = [
  "shipping",
  "shipmentStatus",
  "razorpay",
  "utm",
  "statusHistory",
  "awb",
  "courier",
  "shiprocketOrderId",
];

describe("Property 22: shipping-provider failure isolation in createOrder", () => {
  it("retains a successful CONFIRMED/PENDING order and leaks no failure detail to the customer", async () => {
    await fc.assert(
      fc.asyncProperty(
        inputArb,
        paymentArb,
        utmArb,
        failureArb,
        async (input, payment, utm, failure) => {
          const { service, logger, fulfilOrder } = buildService(failure);

          // The out-of-band shipping failure must never surface to the caller:
          // createOrder resolves with a success result.
          const result = await service.createOrder(input, payment, utm);

          // Allow the fire-and-forget fulfilment microtask to run and be caught.
          await new Promise((resolve) => setImmediate(resolve));

          const { order, customer } = result;

          // Order retained as successfully created (Req 11.5).
          expect(order).toBeTruthy();
          expect(order.orderStatus).toBe("CONFIRMED");
          // Shipment_Status stays PENDING after the failed attempt (Req 11.5, 17.6).
          expect(order.shipmentStatus).toBe("PENDING");

          // The fulfilment attempt was actually made (and failed internally).
          expect(fulfilOrder).toHaveBeenCalledTimes(1);
          // The failure is recorded server-side, never propagated (Req 11.6/11.9).
          expect(logger.error).toHaveBeenCalled();

          // Persisted state confirms the same guarantee at the database level.
          const persisted = await Order.findById(order._id).lean();
          expect(persisted).toBeTruthy();
          expect(persisted.orderStatus).toBe("CONFIRMED");
          expect(persisted.shipmentStatus).toBe("PENDING");

          // The customer-facing response indicates success: it carries the
          // order identifier and summary only (Req 11.9).
          expect(customer).toBeTruthy();
          expect(customer.orderId).toBe(order.orderId);

          // No shipping-provider or technical detail leaks structurally.
          for (const key of FORBIDDEN_CUSTOMER_KEYS) {
            expect(customer).not.toHaveProperty(key);
          }

          // ...nor anywhere in the serialized customer response: the unique
          // failure marker (and the AWB/courier strings built from it) is
          // absent from everything the customer can see.
          const serialized = JSON.stringify(customer);
          expect(serialized).not.toContain(failure.marker);
        }
      ),
      { numRuns: 100 }
    );
  });
});
