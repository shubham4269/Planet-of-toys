import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import crypto from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  createRazorpayOrder,
  verifySignature,
  PaymentConfigError,
  PaymentValidationError,
} from "./payment.service.js";
import { SystemSettings } from "../models/index.js";

// The SystemSettings-backed precedence in getCredential is exercised in the
// credential service tests; here we drive resolution purely from environment
// variables and mock the Razorpay SDK so no network call is made. An in-memory
// MongoDB is started because getCredential consults System_Settings before the
// environment fallback — no document is created, so resolution falls through to
// the env vars set below.

const TEST_KEY_ID = "rzp_test_keyid123";
const TEST_KEY_SECRET = "rzp_test_secret_DO_NOT_LEAK";

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
  for (const k of [
    "ENCRYPTION_KEY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
  ]) {
    savedEnv[k] = process.env[k];
  }
  // No SystemSettings document is created in these tests, so getCredential
  // resolves from the environment. ENCRYPTION_KEY is unused on that path but
  // set for completeness.
  process.env.ENCRYPTION_KEY = "payment-test-encryption-key";
  process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/**
 * Build a mock Razorpay client factory whose `orders.create` echoes the input
 * back with a generated id, mirroring the real SDK's response shape.
 */
function mockRazorpayFactory(captured = {}) {
  const create = vi.fn(async (params) => ({
    id: "order_MOCK123",
    entity: "order",
    amount: params.amount,
    currency: params.currency,
    receipt: params.receipt,
    status: "created",
  }));
  const factory = vi.fn((credentials) => {
    captured.credentials = credentials;
    return { orders: { create } };
  });
  factory.create = create;
  return factory;
}

describe("payment service - createRazorpayOrder (Req 5.1, 5.5)", () => {
  it("creates a Razorpay order and returns only non-secret fields", async () => {
    const factory = mockRazorpayFactory();

    const result = await createRazorpayOrder(
      { amount: 49900, currency: "INR", receipt: "POT-240305-0001" },
      { razorpayFactory: factory }
    );

    expect(result).toEqual({
      razorpayOrderId: "order_MOCK123",
      amount: 49900,
      currency: "INR",
      keyId: TEST_KEY_ID,
    });
  });

  it("passes the amount through to the Razorpay SDK", async () => {
    const factory = mockRazorpayFactory();

    await createRazorpayOrder({ amount: 12345 }, { razorpayFactory: factory });

    expect(factory.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12345, currency: "INR" })
    );
  });

  it("constructs the SDK client with the resolved credentials", async () => {
    const captured = {};
    const factory = mockRazorpayFactory(captured);

    await createRazorpayOrder({ amount: 100 }, { razorpayFactory: factory });

    expect(captured.credentials).toEqual({
      keyId: TEST_KEY_ID,
      keySecret: TEST_KEY_SECRET,
    });
  });

  it("never includes the key secret in the returned value", async () => {
    const factory = mockRazorpayFactory();
    const result = await createRazorpayOrder(
      { amount: 5000 },
      { razorpayFactory: factory }
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TEST_KEY_SECRET);
    expect(result).not.toHaveProperty("keySecret");
  });

  it("rejects non-positive, non-integer, and non-numeric amounts", async () => {
    const factory = mockRazorpayFactory();
    await expect(
      createRazorpayOrder({ amount: 0 }, { razorpayFactory: factory })
    ).rejects.toThrow(PaymentValidationError);
    await expect(
      createRazorpayOrder({ amount: -10 }, { razorpayFactory: factory })
    ).rejects.toThrow(PaymentValidationError);
    await expect(
      createRazorpayOrder({ amount: 10.5 }, { razorpayFactory: factory })
    ).rejects.toThrow(PaymentValidationError);
    await expect(
      createRazorpayOrder({ amount: "100" }, { razorpayFactory: factory })
    ).rejects.toThrow(PaymentValidationError);
    expect(factory.create).not.toHaveBeenCalled();
  });

  it("throws PaymentConfigError when credentials are missing", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const factory = mockRazorpayFactory();
    await expect(
      createRazorpayOrder({ amount: 1000 }, { razorpayFactory: factory })
    ).rejects.toThrow(PaymentConfigError);
  });
});

describe("payment service - verifySignature (Req 5.2, 5.5)", () => {
  /** Compute a valid Razorpay signature the same way the server does. */
  function sign(orderId, paymentId, secret) {
    return crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  }

  it("accepts a correct signature", async () => {
    const orderId = "order_MOCK123";
    const paymentId = "pay_ABC456";
    const signature = sign(orderId, paymentId, TEST_KEY_SECRET);
    expect(await verifySignature(orderId, paymentId, signature)).toBe(true);
  });

  it("rejects a tampered order id", async () => {
    const signature = sign("order_MOCK123", "pay_ABC456", TEST_KEY_SECRET);
    expect(
      await verifySignature("order_TAMPERED", "pay_ABC456", signature)
    ).toBe(false);
  });

  it("rejects a tampered payment id", async () => {
    const signature = sign("order_MOCK123", "pay_ABC456", TEST_KEY_SECRET);
    expect(
      await verifySignature("order_MOCK123", "pay_TAMPERED", signature)
    ).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", async () => {
    const signature = sign("order_MOCK123", "pay_ABC456", "the-wrong-secret");
    expect(
      await verifySignature("order_MOCK123", "pay_ABC456", signature)
    ).toBe(false);
  });

  it("rejects malformed, empty, and non-string signatures without throwing", async () => {
    expect(await verifySignature("o", "p", "")).toBe(false);
    expect(await verifySignature("o", "p", "not-hex-and-wrong-length")).toBe(
      false
    );
    expect(await verifySignature("o", "p", undefined)).toBe(false);
    expect(await verifySignature("o", "p", 12345)).toBe(false);
  });

  it("throws PaymentConfigError when the key secret is missing", async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    await expect(verifySignature("o", "p", "sig")).rejects.toThrow(
      PaymentConfigError
    );
  });
});
