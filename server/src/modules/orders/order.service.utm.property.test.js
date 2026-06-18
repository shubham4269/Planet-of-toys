// Feature: planet-of-toys-ecommerce, Property 5: UTM capture and persistence round-trip
import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createOrderService, normalizeUtm } from "./order.service.js";
import { Order, Counter } from "../../models/index.js";

/**
 * Property 5: UTM capture and persistence round-trip.
 *
 * For any landing URL, the attribution record stored in sessionStorage equals
 * exactly the `utm_*` parameters present in the URL (an empty record when none
 * are present), and an order created in that session persists that same
 * attribution record unchanged.
 *
 * The sessionStorage/URL-capture half of this property is exercised by the
 * client UTM tests (`client/src/lib/utm.test.js`). This server-side property
 * focuses on the persistence round-trip: the captured attribution record
 * (the `utm_*` parameters present for the session) is persisted by
 * `Order_Service.createOrder` and read back unchanged, via the `normalizeUtm`
 * helper that maps the captured record onto the persisted `utm` shape.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */

// The recognized UTM query parameters (requirements glossary) mapped to the
// canonical persisted field names on the order's `utm` sub-document.
const UTM_FIELD_MAP = Object.freeze({
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_term: "term",
  utm_content: "content",
});
const UTM_KEYS = Object.freeze(Object.keys(UTM_FIELD_MAP));

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

/** Build an Order_Service with all external integrations mocked (deterministic). */
function buildService() {
  const whatsappService = {
    sendNotification: vi.fn().mockResolvedValue({ ok: true }),
  };
  const verifySignature = vi.fn().mockResolvedValue(true);
  // Out-of-band fulfilment is stubbed so no real Shiprocket call is attempted.
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

/** A minimal, otherwise-valid COD checkout input. */
function baseInput() {
  return {
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
      {
        productId: new mongoose.Types.ObjectId(),
        name: "Wooden Train",
        quantity: 2,
        unitPrice: 499,
      },
    ],
    amount: 998,
  };
}

// A captured attribution record: each recognized `utm_*` parameter is
// independently either present (with an arbitrary string value, including the
// empty string for `?utm_x=`) or absent — exactly modelling the set of `utm_*`
// parameters that could appear in a landing URL. An all-absent draw models a
// landing URL with no UTM parameters (the empty attribution record).
const capturedUtmArb = fc
  .record(
    Object.fromEntries(
      UTM_KEYS.map((key) => [key, fc.option(fc.string(), { nil: undefined })])
    )
  )
  .map((record) => {
    const present = {};
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) present[key] = value;
    }
    return present;
  });

/** The attribution record we expect to be persisted for a captured record. */
function expectedPersistedUtm(captured) {
  const expected = {
    source: null,
    medium: null,
    campaign: null,
    term: null,
    content: null,
  };
  for (const [key, field] of Object.entries(UTM_FIELD_MAP)) {
    if (Object.prototype.hasOwnProperty.call(captured, key)) {
      expected[field] = String(captured[key]);
    }
  }
  return expected;
}

describe("Property 5: UTM capture and persistence round-trip", () => {
  it("persists the captured attribution record unchanged with the created order", async () => {
    const service = buildService();

    await fc.assert(
      fc.asyncProperty(capturedUtmArb, async (captured) => {
        const expected = expectedPersistedUtm(captured);

        // The helper that maps the captured record onto the persisted shape
        // must equal the expected attribution record (empty -> all null).
        expect(normalizeUtm(captured)).toEqual(expected);

        // Creating an order in that session persists the same record...
        const { order } = await service.createOrder(
          baseInput(),
          { method: "COD" },
          captured
        );

        // ...and reading it back from the database yields it unchanged.
        const persisted = await Order.findById(order._id).lean();
        expect(persisted.utm).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});
