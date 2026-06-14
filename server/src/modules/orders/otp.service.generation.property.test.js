// Feature: planet-of-toys-ecommerce, Property 13: Generated OTP is six numeric digits with a five-minute TTL
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createOtpManager, OTP_TTL_MS } from "./otp.service.js";

/**
 * Property 13: Generated OTP is six numeric digits with a five-minute TTL.
 *
 * For any OTP generation at time `t`, the produced code matches `^[0-9]{6}$`
 * and is stored with `expiresAt == t + 5 minutes`.
 *
 * The OTP manager supports an injectable clock via the `now` option, so we
 * drive generation at arbitrary epoch times `t` and assert the format and TTL
 * contract deterministically without relying on real timers.
 *
 * Validates: Requirements 7.1, 7.2
 */
describe("otp service - Property 13: six-digit code with five-minute TTL", () => {
  it("produces a six-digit numeric code expiring exactly t + 5 minutes for any generation time", () => {
    fc.assert(
      fc.property(
        // Arbitrary generation time in epoch ms (kept well within safe-integer
        // range so `t + OTP_TTL_MS` never overflows).
        fc.integer({ min: 0, max: 4_102_444_800_000 }),
        // Arbitrary non-empty phone number.
        fc.string({ minLength: 1, maxLength: 20 }),
        (t, phone) => {
          const otp = createOtpManager({ now: () => t });
          const result = otp.requestOtp(phone);

          // Req 7.1: a six-digit numeric value.
          expect(result.ok).toBe(true);
          expect(result.code).toMatch(/^[0-9]{6}$/);

          // Req 7.2: stored with a five-minute TTL from generation time.
          expect(result.expiresAt).toBe(t + OTP_TTL_MS);
        }
      ),
      { numRuns: 100 }
    );
  });
});
