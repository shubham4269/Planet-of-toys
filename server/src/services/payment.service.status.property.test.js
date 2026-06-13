// Feature: planet-of-toys-ecommerce, Property 10: Payment status follows signature verification result
import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  vi,
} from "vitest";
import fc from "fast-check";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { createOrderService, PaymentVerificationError } from "./order.service.js";
import { verifySignature } from "./payment.service.js";
import Order from "../models/order.model.js";

/**
 * Property 10: Payment status follows signature verification result.
 *
 * For any online-payment attempt, the order's `paymentStatus` is `PAID` when
 * signature verification succeeds and `FAILED` (with no confirmed order
 * created) when verification fails.
 *
 * Validates: Requirements 5.3, 5.4
 *
 * The implementation under test is the ONLINE order-creation path in
 * `order.service.js` combined with the real `verifySignature` from
 * `payment.service.js`. We exercise the genuine HMAC-SHA256 verification
 * (keyed by the test Razorpay secret resolved from the environment) rather
 * than a stub, so the property covers the real combined behavior:
 *
 *   - A correctly computed signature -> verification succeeds -> the order is
 *     persisted with paymentStatus = PAID (Req 5.3).
 *   - A signature that does not match the (order_id, payment_id) pair ->
 *     verification fails -> createOrder rejects and NO order is persisted, so
 *     no confirmed order exists with paymentStatus = PAID (Req 5.4).
 *
 * External side effects are isolated: WhatsApp dispatch is mocked to a no-op
 * and out-of-band Shiprocket fulfilment is replaced with a no-op so the test
 * makes no network calls. MongoDB-dependent persistence runs against an
 * in-memory MongoDB.
 */

const TEST_KEY_SECRET = "rzp_test_secret_property10";

let mongod;
const savedEnv = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(() => {
  for (const k of ["ENCRYPTION_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
    savedEnv[k] = process.env[k];
  }
  // No SystemSettings document is created, so getCredential resolves Razorpay
  // credentials from the environment. ENCRYPTION_KEY is set for completeness.
  process.env.ENCRYPTION_KEY = "property10-test-encryption-key";
  process.env.RAZORPAY_KEY_ID = "rzp_test_keyid_property10";
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
});

afterEach(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
  // Keep the collection clean between property runs so persistence assertions
  // are unambiguous.
  await Order.deleteMany({});
});

/** Compute a valid Razorpay signature exactly as the server does. */
function sign(orderId, paymentId, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

/**
 * Build an Order_Service wired to the real `verifySignature` but with isolated,
 * non-network side effects (no-op WhatsApp + no-op fulfilment).
 */
function buildService() {
  return createOrderService({
    verifySignature,
    whatsappService: { sendNotification: vi.fn(async () => ({ ok: true })) },
    // Replace out-of-band Shiprocket fulfilment with a no-op so the test makes
    // no real network calls; this does not affect paymentStatus.
    fulfilOrder: async () => {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

/** A minimal, otherwise-valid checkout input parameterized by amount. */
function buildInput(amount) {
  return {
    customer: {
      name: "Property Ten",
      phone: "9999900000",
      email: "buyer@example.com",
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
        unitPrice: amount,
      },
    ],
    amount,
  };
}

// Razorpay-style identifiers: non-empty alphanumeric tokens.
const idArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => s.replace(/[^a-zA-Z0-9]/g, "")) // keep id-like characters
  .filter((s) => s.length > 0);

const amountArb = fc.integer({ min: 1, max: 5_000_00 });

describe("Property 10: payment status follows signature verification result", () => {
  it("sets paymentStatus = PAID when the signature verifies (Req 5.3)", async () => {
    const service = buildService();

    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        amountArb,
        async (razorpayOrderId, razorpayPaymentId, amount) => {
          const signature = sign(razorpayOrderId, razorpayPaymentId, TEST_KEY_SECRET);

          const { order, customer } = await service.createOrder(
            buildInput(amount),
            {
              method: "ONLINE",
              razorpayOrderId,
              razorpayPaymentId,
              signature,
            }
          );

          // The order is created with PAID (Req 5.3).
          expect(order.paymentStatus).toBe("PAID");
          expect(order.paymentMethod).toBe("ONLINE");
          expect(customer.paymentStatus).toBe("PAID");

          // And it is actually persisted.
          const persisted = await Order.findOne({ orderId: order.orderId });
          expect(persisted).not.toBeNull();
          expect(persisted.paymentStatus).toBe("PAID");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects and creates no confirmed order when the signature fails (Req 5.4)", async () => {
    const service = buildService();

    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        amountArb,
        async (razorpayOrderId, razorpayPaymentId, amount) => {
          // A valid signature for the ORIGINAL pair, but the attempt tampers the
          // payment id, so HMAC verification of the presented pair fails.
          const signature = sign(razorpayOrderId, razorpayPaymentId, TEST_KEY_SECRET);
          const tamperedPaymentId = `${razorpayPaymentId}_tampered`;

          const before = await Order.countDocuments();

          await expect(
            service.createOrder(buildInput(amount), {
              method: "ONLINE",
              razorpayOrderId,
              razorpayPaymentId: tamperedPaymentId,
              signature,
            })
          ).rejects.toBeInstanceOf(PaymentVerificationError);

          // No confirmed order was created (Req 5.4): the document count is
          // unchanged and no PAID order exists for this attempt.
          const after = await Order.countDocuments();
          expect(after).toBe(before);
          const leaked = await Order.findOne({
            "razorpay.orderId": razorpayOrderId,
          });
          expect(leaked).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
