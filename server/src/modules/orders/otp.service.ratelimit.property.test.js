import fc from "fast-check";
import { describe, it, expect } from "vitest";

import {
  createOtpManager,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
} from "./otp.service.js";

/**
 * Property-based test for OTP issuance rate limiting.
 *
 * Feature: planet-of-toys-ecommerce, Property 14: OTP issuance is rate-limited per phone number
 *
 * Validates: Requirements 7.4, 28.2
 *
 * For any phone number, at most three OTP requests are accepted within any
 * ten-minute window; the fourth and subsequent requests within that window are
 * rejected, and requests are accepted again once the window has elapsed.
 *
 * The OTP manager exposes an injectable clock via the `now` option, so a burst
 * of requests can be replayed at deterministic timestamps without real timers.
 * Each request is checked against an independent sliding-window reference model
 * that mirrors the specification: a request at time `t` is accepted iff strictly
 * fewer than RATE_LIMIT_MAX_REQUESTS previously accepted requests fall within
 * the half-open window `(t - RATE_LIMIT_WINDOW_MS, t]`.
 */

/** Controllable clock matching the pattern used in otp.service.test.js. */
function withClock(startTime = 0) {
  let current = startTime;
  return {
    now: () => current,
    set: (ms) => {
      current = ms;
    },
  };
}

/**
 * Reference sliding-window rate limiter. Returns whether a request at
 * `currentTime` should be accepted given the previously accepted timestamps,
 * and (when accepted) records the timestamp. Mirrors the service's pruning rule
 * which keeps timestamps strictly greater than `currentTime - window`.
 */
function modelAccepts(acceptedTimestamps, currentTime) {
  const windowStart = currentTime - RATE_LIMIT_WINDOW_MS;
  const active = acceptedTimestamps.filter((ts) => ts > windowStart);
  return active.length < RATE_LIMIT_MAX_REQUESTS;
}

describe("Property 14: OTP issuance is rate-limited per phone number", () => {
  it("accepts a request iff fewer than the max are active in the sliding window", () => {
    fc.assert(
      fc.property(
        // A phone number: "+91" followed by ten digits.
        fc
          .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 10 })
          .map((digits) => `+91${digits.join("")}`),
        // A burst of requests expressed as non-negative time increments (ms)
        // between successive requests, producing monotonic non-decreasing
        // timestamps. Increments span values both inside and outside the
        // ten-minute window so windows fill, reject, and later free up.
        fc.array(
          fc.integer({ min: 0, max: RATE_LIMIT_WINDOW_MS + 60_000 }),
          { minLength: 1, maxLength: 12 }
        ),
        (phone, increments) => {
          const clock = withClock(0);
          const otp = createOtpManager({ now: clock.now });

          const accepted = [];
          let t = 0;
          for (const inc of increments) {
            t += inc;
            clock.set(t);

            const expectedAccept = modelAccepts(accepted, t);
            const result = otp.requestOtp(phone);

            expect(result.ok).toBe(expectedAccept);

            if (expectedAccept) {
              expect(result.code).toMatch(/^\d{6}$/);
              accepted.push(t);
            } else {
              expect(result.reason).toBe("RATE_LIMITED");
              expect(result.retryAfterMs).toBeGreaterThan(0);
            }
          }

          // Invariant: no ten-minute window ever contains more than the max
          // accepted requests.
          for (const ref of accepted) {
            const inWindow = accepted.filter(
              (ts) => ts > ref - RATE_LIMIT_WINDOW_MS && ts <= ref
            );
            expect(inWindow.length).toBeLessThanOrEqual(RATE_LIMIT_MAX_REQUESTS);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("rejects the immediate request after the max, then accepts once the oldest leaves the window", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 10 })
          .map((digits) => `+91${digits.join("")}`),
        // Small spacing so all max requests land inside one window.
        fc.integer({ min: 0, max: 1000 }),
        (phone, spacing) => {
          const clock = withClock(0);
          const otp = createOtpManager({ now: clock.now });

          let t = 0;
          for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i += 1) {
            clock.set(t);
            expect(otp.requestOtp(phone).ok).toBe(true);
            t += spacing;
          }

          // The next request, still inside the window, is rejected.
          clock.set(t);
          const rejected = otp.requestOtp(phone);
          expect(rejected.ok).toBe(false);
          expect(rejected.reason).toBe("RATE_LIMITED");

          // Once the first accepted request has fully left the window, a new
          // request is accepted again.
          clock.set(RATE_LIMIT_WINDOW_MS + 1);
          expect(otp.requestOtp(phone).ok).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
