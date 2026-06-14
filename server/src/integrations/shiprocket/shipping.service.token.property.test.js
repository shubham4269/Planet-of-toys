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
import fc from "fast-check";
import { createShippingService } from "./shipping.service.js";

/**
 * Property-based test for Shipping_Service token caching.
 *
 * Feature: planet-of-toys-ecommerce, Property 20: A valid cached Shiprocket token is reused
 *
 * Validates: Requirements 10.2
 *
 * For any sequence of Shipping_Service calls made while a cached token remains
 * valid, Shiprocket authentication is invoked at most once. A token is reused
 * while `now() < authTime + tokenTtlMs`; once the clock crosses that instant the
 * service re-authenticates. This property therefore exercises sequences whose
 * cumulative elapsed time stays strictly inside the TTL window and asserts that
 * exactly one authentication call reaches Shiprocket regardless of how many
 * `getToken` calls are made.
 *
 * `getCredential` consults System_Settings before falling back to environment
 * variables, so an in-memory MongoDB is started (no settings document is
 * created, so the env credentials are used). The HTTP client and clock are both
 * injected, so no real Shiprocket network call is ever made.
 */

const TEST_EMAIL = "ops@planetoftoys.test";
const TEST_PASSWORD = "shiprocket-secret-DO-NOT-LEAK";
const PICKUP = "110001";

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
    "SHIPROCKET_EMAIL",
    "SHIPROCKET_PASSWORD",
    "SHIPROCKET_PICKUP_PINCODE",
  ]) {
    savedEnv[k] = process.env[k];
  }
  process.env.ENCRYPTION_KEY = "shipping-test-encryption-key";
  process.env.SHIPROCKET_EMAIL = TEST_EMAIL;
  process.env.SHIPROCKET_PASSWORD = TEST_PASSWORD;
  process.env.SHIPROCKET_PICKUP_PINCODE = PICKUP;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/**
 * Mock HTTP client that issues a fresh token per authentication and counts how
 * many times `/auth/login` is hit. Non-auth requests are not exercised here.
 */
function mockHttpClient() {
  let authCount = 0;
  const request = vi.fn(async (opts) => {
    if (opts.url.endsWith("/auth/login")) {
      authCount += 1;
      return { status: 200, data: { token: `token-${authCount}` } };
    }
    return { status: 404, data: null };
  });
  return {
    request,
    get authCount() {
      return authCount;
    },
  };
}

describe("Property 20: A valid cached Shiprocket token is reused", () => {
  it("authenticates at most once across any sequence of getToken calls within the TTL", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Per-call elapsed-time advances (ms). The first element drives the
        // gap before the first call; each subsequent element advances the
        // clock before the next getToken call.
        fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 40 }),
        // Slack added on top of the total elapsed time so the cached token
        // stays strictly valid for the whole sequence (now < authTime + ttl).
        fc.integer({ min: 1, max: 1_000_000 }),
        async (advances, slack) => {
          const totalElapsed = advances.reduce((sum, ms) => sum + ms, 0);
          // TTL strictly exceeds the cumulative elapsed time, so the token
          // issued on the first call remains valid for every later call.
          const tokenTtlMs = totalElapsed + slack;

          const http = mockHttpClient();
          let clock = 1_000_000;
          const service = createShippingService({
            httpClient: http,
            now: () => clock,
            tokenTtlMs,
          });

          let firstToken;
          for (const advance of advances) {
            clock += advance;
            const token = await service.getToken();
            if (firstToken === undefined) firstToken = token;
            // Every call returns the same cached token while it is valid.
            expect(token).toBe(firstToken);
          }

          // The whole sequence stayed within the TTL, so Shiprocket
          // authentication happened at most once.
          expect(http.authCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
