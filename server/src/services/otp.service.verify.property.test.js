import fc from "fast-check";
import { describe, it, expect } from "vitest";

import { createOtpManager, OTP_TTL_MS } from "./otp.service.js";

/**
 * Property-based test for OTP verification.
 *
 * Feature: planet-of-toys-ecommerce, Property 12: OTP verification succeeds only for the matching, unexpired code
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 7.3
 *
 * The OTP_Manager (otp.service.js, `verifyOtp`) is the component that decides
 * whether a submitted code is accepted. Order creation is layered on top of
 * this decision elsewhere; here we exercise the universal verification rule the
 * COD flow depends on:
 *
 *   - For any phone and freshly generated code, verification SUCCEEDS when the
 *     exact stored code is submitted strictly within the 5-minute validity
 *     period (Req 6.2 / 6.5 — the precondition that lets a COD order be created
 *     with paymentStatus = PENDING).
 *   - For any submitted code that differs from the stored code, verification is
 *     REJECTED as a mismatch while within the window (Req 6.3).
 *   - For any code submitted at or after the validity period elapses,
 *     verification is REJECTED as expired regardless of code value
 *     (Req 6.4, 7.3).
 *
 * Time is supplied through the injectable clock (same pattern as
 * otp.service.test.js) so the validity window is exercised deterministically.
 */

/** A controllable clock matching the helper used in otp.service.test.js. */
function withClock(startTime = 0) {
  let current = startTime;
  return {
    now: () => current,
    set: (ms) => {
      current = ms;
    },
  };
}

/** Phone numbers: a plus sign followed by 10-14 digits. */
const phoneArb = fc
  .tuple(fc.constant("+"), fc.stringMatching(/^[1-9][0-9]{9,13}$/))
  .map(([plus, digits]) => plus + digits);

/** Any six-digit numeric code, zero-padded, matching the generator output. */
const codeArb = fc
  .integer({ min: 0, max: 999999 })
  .map((n) => String(n).padStart(6, "0"));

describe("Property 12: OTP verification succeeds only for the matching, unexpired code", () => {
  it("accepts the exact stored code strictly within the validity period", () => {
    fc.assert(
      fc.property(
        phoneArb,
        codeArb,
        // Issue time, and an offset strictly inside the TTL window.
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: OTP_TTL_MS - 1 }),
        (phone, code, issuedAt, withinOffset) => {
          const clock = withClock(issuedAt);
          const otp = createOtpManager({
            now: clock.now,
            codeGenerator: () => code,
          });

          const request = otp.requestOtp(phone);
          expect(request.ok).toBe(true);

          clock.set(issuedAt + withinOffset);
          expect(otp.verifyOtp(phone, code)).toEqual({ ok: true });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects a mismatched code within the validity period (Req 6.3)", () => {
    fc.assert(
      fc.property(
        phoneArb,
        codeArb,
        codeArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: OTP_TTL_MS - 1 }),
        (phone, storedCode, submittedCode, issuedAt, withinOffset) => {
          // Constrain to a genuine mismatch.
          fc.pre(storedCode !== submittedCode);

          const clock = withClock(issuedAt);
          const otp = createOtpManager({
            now: clock.now,
            codeGenerator: () => storedCode,
          });

          otp.requestOtp(phone);
          clock.set(issuedAt + withinOffset);

          const result = otp.verifyOtp(phone, submittedCode);
          expect(result.ok).toBe(false);
          expect(result.reason).toBe("MISMATCH");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects any code submitted at or after the validity period elapses (Req 6.4, 7.3)", () => {
    fc.assert(
      fc.property(
        phoneArb,
        codeArb,
        codeArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        // Offset at or beyond the TTL boundary -> expired.
        fc.integer({ min: 0, max: 60 * 60 * 1000 }),
        (phone, storedCode, submittedCode, issuedAt, beyondOffset) => {
          const clock = withClock(issuedAt);
          const otp = createOtpManager({
            now: clock.now,
            codeGenerator: () => storedCode,
          });

          otp.requestOtp(phone);
          // expiresAt == issuedAt + OTP_TTL_MS; >= that boundary is expired.
          clock.set(issuedAt + OTP_TTL_MS + beyondOffset);

          // Expiry is rejected regardless of whether the code matches.
          const result = otp.verifyOtp(phone, submittedCode);
          expect(result.ok).toBe(false);
          expect(result.reason).toBe("EXPIRED");
        },
      ),
      { numRuns: 100 },
    );
  });
});
