import http from "node:http";

import express from "express";
import fc from "fast-check";
import { describe, it, expect } from "vitest";

import {
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_STATUS,
  createLimiter,
} from "./rateLimiters.js";

/**
 * Property-based test for the tiered rate limiters.
 *
 * Feature: planet-of-toys-ecommerce, Property 41: Rate-limited endpoints reject excess requests
 *
 * Validates: Requirements 28.1, 28.3, 28.4, 28.5
 *
 * The limiter factory backs every configured tier (public API, OTP, payment
 * creation, order creation). The universal property is: for any configured
 * per-window maximum N and any request count M > N issued from a single source
 * within the window, exactly the first N requests succeed (HTTP 200) and every
 * subsequent request is rejected with the standard rate-limit response
 * (HTTP 429 and the generic, detail-free body).
 */

/**
 * Build a tiny Express app guarded by `limiter`, listen on an ephemeral
 * loopback port, fire `count` sequential requests from the same source (so they
 * share one rate-limit key), and collect the statuses and bodies. A large
 * `windowMs` ensures the window never resets across the burst.
 *
 * @param {{ windowMs: number, max: number }} tier
 * @param {number} count
 * @returns {Promise<{ statuses: number[], bodies: unknown[] }>}
 */
async function fireRequests(tier, count) {
  const app = express();
  app.use(createLimiter(tier));
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

describe("Property 41: Rate-limited endpoints reject excess requests", () => {
  it("admits exactly the first N requests and rejects every request beyond the limit", async () => {
    await fc.assert(
      fc.asyncProperty(
        // N: the configured per-window maximum (kept small to bound runtime).
        fc.integer({ min: 1, max: 5 }),
        // extra: the number of requests beyond the limit (M = N + extra > N).
        fc.integer({ min: 1, max: 4 }),
        async (max, extra) => {
          const total = max + extra;
          // A long window guarantees no reset within a single burst.
          const { statuses, bodies } = await fireRequests(
            { windowMs: 60_000, max },
            total,
          );

          // Exactly the first N requests are admitted with HTTP 200.
          expect(statuses.slice(0, max)).toEqual(Array(max).fill(200));

          // Every request beyond the limit is rejected with the standard
          // rate-limit response: HTTP 429 and the generic, detail-free body.
          for (let i = max; i < total; i += 1) {
            expect(statuses[i]).toBe(RATE_LIMIT_STATUS);
            expect(bodies[i]).toEqual(RATE_LIMIT_MESSAGE);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
