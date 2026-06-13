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
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createShippingService } from "./shipping.service.js";

/**
 * cancelShipment: calls off the Shiprocket pickup when an order is cancelled.
 * Prefers cancelling the Shiprocket order by id, falls back to AWB-based
 * cancellation, reports (never throws) failures, and no-ops without refs.
 *
 * getCredential consults System_Settings before env fallback, so an in-memory
 * MongoDB runs; credentials resolve from env vars. HTTP is always mocked.
 */

const TEST_EMAIL = "ops@planetoftoys.test";
const TEST_PASSWORD = "shiprocket-secret-DO-NOT-LEAK";

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
  for (const k of ["ENCRYPTION_KEY", "SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD"]) {
    savedEnv[k] = process.env[k];
  }
  process.env.ENCRYPTION_KEY = "shipping-cancel-test-key";
  process.env.SHIPROCKET_EMAIL = TEST_EMAIL;
  process.env.SHIPROCKET_PASSWORD = TEST_PASSWORD;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/** Path-driven mock HTTP client covering auth + both cancel endpoints. */
function mockHttpClient({ onCancelOrder, onCancelAwb } = {}) {
  const request = vi.fn(async (opts) => {
    if (opts.url.endsWith("/auth/login")) {
      return { status: 200, data: { token: "token-1" } };
    }
    if (opts.url.endsWith("/orders/cancel/shipment/awbs")) {
      if (onCancelAwb) return onCancelAwb(opts);
      return { status: 200, data: { message: "cancelled" } };
    }
    if (opts.url.endsWith("/orders/cancel")) {
      if (onCancelOrder) return onCancelOrder(opts);
      return { status: 200, data: { message: "cancelled" } };
    }
    return { status: 404, data: null };
  });
  return { request };
}

function buildService(httpClient, logger = { warn: vi.fn(), error: vi.fn() }) {
  return createShippingService({ httpClient, logger });
}

describe("shipping service - cancelShipment", () => {
  it("cancels the Shiprocket order by numeric id", async () => {
    const httpClient = mockHttpClient();
    const service = buildService(httpClient);

    const result = await service.cancelShipment({
      orderId: "POT-AB2C3",
      shipping: { shiprocketOrderId: "456789", awb: "AWB1" },
    });

    expect(result.ok).toBe(true);
    const cancelCall = httpClient.request.mock.calls.find(([opts]) =>
      opts.url.endsWith("/orders/cancel")
    );
    expect(cancelCall[0].body).toEqual({ ids: [456789] });
  });

  it("falls back to AWB cancellation when only the AWB exists", async () => {
    const httpClient = mockHttpClient();
    const service = buildService(httpClient);

    const result = await service.cancelShipment({
      orderId: "POT-AB2C3",
      shipping: { shiprocketOrderId: null, awb: "AWB42" },
    });

    expect(result.ok).toBe(true);
    const awbCall = httpClient.request.mock.calls.find(([opts]) =>
      opts.url.endsWith("/orders/cancel/shipment/awbs")
    );
    expect(awbCall[0].body).toEqual({ awbs: ["AWB42"] });
  });

  it("reports a Shiprocket failure without throwing", async () => {
    const httpClient = mockHttpClient({
      onCancelOrder: () => ({ status: 500, data: { message: "boom" } }),
    });
    const service = buildService(httpClient);

    const result = await service.cancelShipment({
      orderId: "POT-AB2C3",
      shipping: { shiprocketOrderId: "456789", awb: null },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/status 500/);
  });

  it("reports failure and logs the provider response when pickup is already completed", async () => {
    const providerResponse = {
      message: "Shipment cannot be cancelled as it is already picked up.",
    };
    const httpClient = mockHttpClient({
      onCancelOrder: () => ({ status: 400, data: providerResponse }),
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = buildService(httpClient, logger);

    const result = await service.cancelShipment({
      orderId: "POT-AB2C3",
      shipping: { shiprocketOrderId: "456789", awb: "AWB1" },
    });

    expect(result.ok).toBe(false);
    // The raw Shiprocket response is preserved in server logs for
    // troubleshooting, never in customer-facing output.
    expect(logger.error).toHaveBeenCalledWith(
      "Shiprocket shipment cancellation failed.",
      expect.objectContaining({ providerResponse })
    );
  });

  it("skips successfully when the order has no Shiprocket references", async () => {
    const httpClient = mockHttpClient();
    const service = buildService(httpClient);

    const result = await service.cancelShipment({
      orderId: "POT-AB2C3",
      shipping: { shiprocketOrderId: null, awb: null },
    });

    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(httpClient.request).not.toHaveBeenCalled();
  });
});
