import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import fc from "fast-check";
import crypto from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { verifySignature } from "./payment.service.js";

// Feature: planet-of-toys-ecommerce, Property 9: Razorpay signature verification is sound and tamper-evident
//
// For any pair (razorpay_order_id, razorpay_payment_id), the signature computed
// as HMAC_SHA256(order_id + "|" + payment_id, key_secret) verifies as valid,
// and for any signature, order id, or payment id that has been altered,
// verification fails.
//
// Validates: Requirements 5.2

const NUM_RUNS = 100;

const TEST_KEY_SECRET = "rzp_test_secret_DO_NOT_LEAK";

// getCredential consults System_Settings before falling back to environment
// variables, so an in-memory MongoDB is started for these tests. No
// SystemSettings document is created, so credential resolution falls through to
// the env vars set in beforeEach below.
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
  process.env.ENCRYPTION_KEY = "payment-property-test-encryption-key";
  process.env.RAZORPAY_KEY_ID = "rzp_test_keyid123";
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Compute a valid Razorpay signature the same way the server does. */
function sign(orderId, paymentId, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

/**
 * Identifier generator. Razorpay-style ids are non-empty strings; we keep them
 * unconstrained in content (including the "|" separator and unicode) to probe
 * the message-construction boundary, while requiring at least one character so
 * "tampered" variants can always be made to differ.
 */
const idArb = fc.string({ minLength: 1, maxLength: 40 });

/** Flip a single hex digit in a signature, yielding a same-length variant
 * that is guaranteed to differ (so the constant-time compare reaches the
 * mismatch path rather than short-circuiting on length). */
function tamperHex(signature, index, swap) {
  const i = index % signature.length;
  const original = signature[i];
  // Map to a different hex digit deterministically.
  const hex = "0123456789abcdef";
  let replacement = hex[swap % 16];
  if (replacement === original) {
    replacement = hex[(swap + 1) % 16];
  }
  return signature.slice(0, i) + replacement + signature.slice(i + 1);
}

describe("payment service - verifySignature property (Req 5.2)", () => {
  it("accepts every correctly computed signature", async () => {
    await fc.assert(
      fc.asyncProperty(idArb, idArb, async (orderId, paymentId) => {
        const signature = sign(orderId, paymentId, TEST_KEY_SECRET);
        expect(await verifySignature(orderId, paymentId, signature)).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("rejects any tampering with the order id", async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        idArb,
        async (orderId, paymentId, otherId) => {
          // Only meaningful when the order id actually changes.
          fc.pre(otherId !== orderId);
          const signature = sign(orderId, paymentId, TEST_KEY_SECRET);
          expect(await verifySignature(otherId, paymentId, signature)).toBe(
            false
          );
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("rejects any tampering with the payment id", async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        idArb,
        async (orderId, paymentId, otherPaymentId) => {
          fc.pre(otherPaymentId !== paymentId);
          const signature = sign(orderId, paymentId, TEST_KEY_SECRET);
          expect(
            await verifySignature(orderId, otherPaymentId, signature)
          ).toBe(false);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("rejects any tampering with the signature", async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        fc.nat(),
        fc.nat(),
        async (orderId, paymentId, index, swap) => {
          const signature = sign(orderId, paymentId, TEST_KEY_SECRET);
          const tampered = tamperHex(signature, index, swap);
          expect(tampered).not.toBe(signature);
          expect(await verifySignature(orderId, paymentId, tampered)).toBe(
            false
          );
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("rejects signatures produced with any other secret", async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        idArb,
        fc.string({ minLength: 1, maxLength: 40 }),
        async (orderId, paymentId, wrongSecret) => {
          fc.pre(wrongSecret !== TEST_KEY_SECRET);
          const signature = sign(orderId, paymentId, wrongSecret);
          // A different secret almost always yields a different digest; on the
          // astronomically unlikely collision the digests match and the
          // signature is, by definition, authentic.
          const expected = sign(orderId, paymentId, TEST_KEY_SECRET);
          const result = await verifySignature(orderId, paymentId, signature);
          expect(result).toBe(signature === expected);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
