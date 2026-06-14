import http from "node:http";

import express from "express";
import { describe, it, expect } from "vitest";

import {
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_STATUS,
  createLimiter,
  createRateLimiters,
  globalLimiter,
  otpLimiter,
  paymentLimiter,
  orderLimiter,
  loginLimiter,
} from "./rateLimiters.js";

/**
 * Build a tiny Express app whose single route is protected by `limiter`, start
 * it on an ephemeral port, then fire `count` sequential requests from the same
 * source and collect the statuses/bodies. All requests originate from the
 * loopback address so they share one rate-limit key.
 */
async function fireRequests(limiter, count) {
  const app = express();
  app.use(limiter);
  app.get("/", (req, res) => res.status(200).json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const statuses = [];
  const bodies = [];
  try {
    for (let i = 0; i < count; i += 1) {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      statuses.push(res.status);
      bodies.push(await res.json());
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  return { statuses, bodies };
}

describe("createLimiter", () => {
  it("allows requests up to the limit then rejects with a 429 rate-limit response", async () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 3 });
    const { statuses, bodies } = await fireRequests(limiter, 5);

    // First three within the window succeed.
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    // The fourth and fifth exceed the limit and are rejected.
    expect(statuses.slice(3)).toEqual([
      RATE_LIMIT_STATUS,
      RATE_LIMIT_STATUS,
    ]);
    // Rejected responses carry the generic, detail-free body.
    expect(bodies[3]).toEqual(RATE_LIMIT_MESSAGE);
    expect(bodies[4]).toEqual(RATE_LIMIT_MESSAGE);
  });

  it("returns a generic body that discloses no internal detail", () => {
    const serialized = JSON.stringify(RATE_LIMIT_MESSAGE).toLowerCase();
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toContain("mongo");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("token");
    expect(Object.keys(RATE_LIMIT_MESSAGE)).toEqual(["error"]);
  });
});

describe("createRateLimiters", () => {
  it("builds all five named tier limiters as middleware functions", () => {
    const tiers = {
      global: { windowMs: 1000, max: 1 },
      otp: { windowMs: 1000, max: 1 },
      payment: { windowMs: 1000, max: 1 },
      order: { windowMs: 1000, max: 1 },
      login: { windowMs: 1000, max: 1 },
    };
    const limiters = createRateLimiters(tiers);

    expect(typeof limiters.globalLimiter).toBe("function");
    expect(typeof limiters.otpLimiter).toBe("function");
    expect(typeof limiters.paymentLimiter).toBe("function");
    expect(typeof limiters.orderLimiter).toBe("function");
    expect(typeof limiters.loginLimiter).toBe("function");
  });
});

describe("default named limiters", () => {
  it("exports each tier limiter as an Express middleware function", () => {
    for (const limiter of [
      globalLimiter,
      otpLimiter,
      paymentLimiter,
      orderLimiter,
      loginLimiter,
    ]) {
      expect(typeof limiter).toBe("function");
      // Express middleware accepts (req, res, next).
      expect(limiter.length).toBeGreaterThanOrEqual(2);
    }
  });
});
