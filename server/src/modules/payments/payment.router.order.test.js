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
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createPaymentRouter } from "./payment.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";

/**
 * Integration test for Razorpay order creation (Req 5.1, 5.5).
 *
 * Exercises the full backend slice — Express route -> payment controller ->
 * payment service -> credential resolution — for
 * `POST /api/payment/razorpay-order`. Only the Razorpay SDK itself is mocked so
 * no real network call is made; everything else runs for real. The credential
 * service consults System_Settings (an in-memory MongoDB) and then falls back
 * to the environment variables set below.
 *
 * The two things we assert against the spec:
 *  - Req 5.1: a Razorpay order is created for the order total amount and its id
 *    is returned to the caller.
 *  - Req 5.5: the Razorpay key secret is used only on the Backend and never
 *    appears in the response sent to the frontend.
 */

const TEST_KEY_ID = "rzp_test_keyid123";
const TEST_KEY_SECRET = "rzp_test_secret_DO_NOT_LEAK";

// vi.mock is hoisted; use vi.hoisted so the mock factory can reference these
// shared spies/state. `ordersCreate` echoes the request back with a generated
// id (mirroring the real SDK), and `constructedWith` captures the credentials
// the SDK client was built with so we can prove the secret stays server-side.
const { ordersCreate, constructedWith } = vi.hoisted(() => {
  const constructedWith = {};
  const ordersCreate = vi.fn(async (params) => ({
    id: "order_INTEG123",
    entity: "order",
    amount: params.amount,
    currency: params.currency,
    receipt: params.receipt,
    status: "created",
  }));
  return { ordersCreate, constructedWith };
});

vi.mock("razorpay", () => ({
  default: vi.fn((options) => {
    constructedWith.options = options;
    return { orders: { create: ordersCreate } };
  }),
}));

let mongod;
let server;
let baseUrl;
const savedEnv = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = express();
  app.use(express.json());
  // Mirror the design's mount point for the payment router.
  app.use("/api/payment", createPaymentRouter());
  app.use(errorHandler);

  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (server) server.close();
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
  // No SystemSettings document is created, so getCredential resolves from the
  // environment fallback. ENCRYPTION_KEY is unused on that path but set for
  // completeness.
  process.env.ENCRYPTION_KEY = "payment-integration-test-encryption-key";
  process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
  ordersCreate.mockClear();
  delete constructedWith.options;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function postOrder(body) {
  const res = await fetch(`${baseUrl}/api/payment/razorpay-order`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

describe("POST /api/payment/razorpay-order - integration (Req 5.1, 5.5)", () => {
  it("creates a Razorpay order for the order total and returns its id", async () => {
    const orderTotalRupees = 499;
    const { status, body } = await postOrder({ amount: orderTotalRupees });

    // Req 5.1: the endpoint returns the Razorpay order identifier.
    expect(status).toBe(201);
    expect(body.razorpayOrderId).toBe("order_INTEG123");

    // Req 5.1: the order is created for the order total. The controller converts
    // the major-unit total (rupees) to the smallest unit (paise) before calling
    // the SDK, and the response echoes that amount back.
    const expectedPaise = orderTotalRupees * 100;
    expect(ordersCreate).toHaveBeenCalledTimes(1);
    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expectedPaise, currency: "INR" })
    );
    expect(body.amount).toBe(expectedPaise);
    expect(body.currency).toBe("INR");
  });

  it("creates the order for the exact total when the amount has paise", async () => {
    const { status, body } = await postOrder({ amount: 499.99 });

    expect(status).toBe(201);
    // 499.99 rupees -> 49999 paise, rounded to avoid floating-point drift.
    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 49999 })
    );
    expect(body.amount).toBe(49999);
  });

  it("never leaks the Razorpay key secret in the response (Req 5.5)", async () => {
    const { status, body } = await postOrder({ amount: 1500 });

    expect(status).toBe(201);
    // The secret is used to construct the SDK client on the Backend only...
    expect(constructedWith.options).toMatchObject({ key_secret: TEST_KEY_SECRET });
    // ...and must never appear anywhere in the response payload.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(TEST_KEY_SECRET);
    expect(serialized).not.toMatch(/secret/i);
    expect(body).not.toHaveProperty("keySecret");
    // Only the public, non-secret fields the frontend needs are exposed.
    expect(body).toMatchObject({
      razorpayOrderId: "order_INTEG123",
      keyId: TEST_KEY_ID,
    });
  });

  it("rejects a non-positive amount with 400 and does not create an order", async () => {
    const { status } = await postOrder({ amount: -5 });

    expect(status).toBe(400);
    expect(ordersCreate).not.toHaveBeenCalled();
  });
});
