// Feature: planet-of-toys-ecommerce, Property 18: Status and payment values stay within their enumerations
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Order, {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  SHIPMENT_STATUSES,
} from "./order.model.js";

/**
 * Property 18: Status and payment values stay within their enumerations.
 *
 * For any order at any point in its lifecycle, `orderStatus` is one of the
 * order-status enumeration, `paymentStatus` is one of the payment-status
 * enumeration, and `shipmentStatus` is one of the shipment-status enumeration;
 * assigning a value outside these sets is rejected at the schema level.
 *
 * Validates: Requirements 9.2, 9.3
 */

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

/** A minimal, otherwise-valid order document, parameterized by the enum fields. */
function buildOrder({ orderStatus, paymentStatus, shipmentStatus }, suffix) {
  return {
    orderId: `POT-250101-${suffix}`,
    customer: {
      name: "Test Customer",
      phone: "9999999999",
      address: "1 Test Street",
      city: "Test City",
      state: "Test State",
      pincode: "560001",
    },
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        name: "Test Toy",
        quantity: 1,
        unitPrice: 100,
      },
    ],
    amount: 100,
    paymentMethod: "COD",
    orderStatus,
    paymentStatus,
    shipmentStatus,
  };
}

// Generator for in-enum tuples: every field draws from its valid enumeration.
const inEnumArb = fc.record({
  orderStatus: fc.constantFrom(...ORDER_STATUSES),
  paymentStatus: fc.constantFrom(...PAYMENT_STATUSES),
  shipmentStatus: fc.constantFrom(...SHIPMENT_STATUSES),
});

// A string guaranteed to be outside every enumeration used here.
const ALL_VALID = new Set([
  ...ORDER_STATUSES,
  ...PAYMENT_STATUSES,
  ...SHIPMENT_STATUSES,
]);
const outOfEnumValueArb = fc
  .string()
  .filter((s) => !ALL_VALID.has(s) && s.trim().length > 0);

// Generator that produces an order with at least one field set out-of-enum,
// while the remaining fields stay valid. `target` selects which field is bad.
const outOfEnumArb = fc.record({
  target: fc.constantFrom("orderStatus", "paymentStatus", "shipmentStatus"),
  badValue: outOfEnumValueArb,
  orderStatus: fc.constantFrom(...ORDER_STATUSES),
  paymentStatus: fc.constantFrom(...PAYMENT_STATUSES),
  shipmentStatus: fc.constantFrom(...SHIPMENT_STATUSES),
});

let counter = 0;
function nextSuffix() {
  counter += 1;
  return String(counter).padStart(4, "0");
}

describe("Property 18: status/payment/shipment enumerations", () => {
  it("accepts orders whose enum fields are all within their enumerations", async () => {
    await fc.assert(
      fc.asyncProperty(inEnumArb, async (fields) => {
        const order = new Order(buildOrder(fields, nextSuffix()));
        // validate() resolves only when the document satisfies the schema,
        // including all enum constraints.
        await order.validate();
        expect(ORDER_STATUSES).toContain(order.orderStatus);
        expect(PAYMENT_STATUSES).toContain(order.paymentStatus);
        expect(SHIPMENT_STATUSES).toContain(order.shipmentStatus);
      }),
      { numRuns: 100 }
    );
  });

  it("rejects orders whose enum field holds an out-of-enumeration value", async () => {
    await fc.assert(
      fc.asyncProperty(outOfEnumArb, async (gen) => {
        const fields = {
          orderStatus: gen.orderStatus,
          paymentStatus: gen.paymentStatus,
          shipmentStatus: gen.shipmentStatus,
        };
        // Force the chosen field out of its enumeration.
        fields[gen.target] = gen.badValue;

        const order = new Order(buildOrder(fields, nextSuffix()));

        await expect(order.validate()).rejects.toMatchObject({
          errors: expect.objectContaining({
            [gen.target]: expect.anything(),
          }),
        });
      }),
      { numRuns: 100 }
    );
  });
});
