import { describe, it, expect } from "vitest";
import {
  createOtpManager,
  OTP_TTL_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
} from "./otp.service.js";

/**
 * Build an OTP manager with a controllable clock so TTL and rate-limit windows
 * can be exercised without real timers.
 */
function withClock(startTime = 0) {
  let current = startTime;
  const clock = {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (ms) => {
      current = ms;
    },
  };
  return clock;
}

describe("otp service - requestOtp", () => {
  it("generates a six-digit numeric code (Req 7.1)", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now });
    const result = otp.requestOtp("+919999999999");
    expect(result.ok).toBe(true);
    expect(result.code).toMatch(/^\d{6}$/);
  });

  it("stores the code with a five-minute TTL (Req 7.2)", () => {
    const clock = withClock(1000);
    const otp = createOtpManager({ now: clock.now });
    const result = otp.requestOtp("+919999999999");
    expect(result.expiresAt).toBe(1000 + OTP_TTL_MS);
  });

  it("zero-pads codes to six characters", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now, codeGenerator: () => "000042" });
    const result = otp.requestOtp("+910000000000");
    expect(result.code).toBe("000042");
    expect(result.code).toHaveLength(6);
  });

  it("throws for an empty or non-string phone", () => {
    const otp = createOtpManager();
    expect(() => otp.requestOtp("")).toThrow(TypeError);
    expect(() => otp.requestOtp(undefined)).toThrow(TypeError);
  });
});

describe("otp service - rate limiting (Req 7.4)", () => {
  it("allows three requests within the ten-minute window", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now });
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i += 1) {
      clock.advance(1000);
      expect(otp.requestOtp("+911111111111").ok).toBe(true);
    }
  });

  it("rejects the fourth request inside the window", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now });
    otp.requestOtp("+911111111111");
    otp.requestOtp("+911111111111");
    otp.requestOtp("+911111111111");
    const fourth = otp.requestOtp("+911111111111");
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toBe("RATE_LIMITED");
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows a new request once the oldest falls out of the window", () => {
    const clock = withClock(0);
    const otp = createOtpManager({ now: clock.now });
    otp.requestOtp("+911111111111"); // t=0
    clock.advance(1000);
    otp.requestOtp("+911111111111"); // t=1000
    clock.advance(1000);
    otp.requestOtp("+911111111111"); // t=2000
    expect(otp.requestOtp("+911111111111").ok).toBe(false);

    // Advance just past the first request leaving the window.
    clock.set(RATE_LIMIT_WINDOW_MS + 1);
    expect(otp.requestOtp("+911111111111").ok).toBe(true);
  });

  it("rate-limits per phone number independently", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now });
    otp.requestOtp("+911111111111");
    otp.requestOtp("+911111111111");
    otp.requestOtp("+911111111111");
    expect(otp.requestOtp("+911111111111").ok).toBe(false);
    // A different phone is unaffected.
    expect(otp.requestOtp("+922222222222").ok).toBe(true);
  });
});

describe("otp service - verifyOtp (Req 6.3, 6.4, 7.3)", () => {
  it("succeeds for a matching, unexpired code", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now, codeGenerator: () => "123456" });
    otp.requestOtp("+911111111111");
    expect(otp.verifyOtp("+911111111111", "123456")).toEqual({ ok: true });
  });

  it("rejects a mismatched code (Req 6.3)", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now, codeGenerator: () => "123456" });
    otp.requestOtp("+911111111111");
    const result = otp.verifyOtp("+911111111111", "000000");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("MISMATCH");
  });

  it("rejects a code after the TTL has elapsed (Req 6.4, 7.3)", () => {
    const clock = withClock(0);
    const otp = createOtpManager({ now: clock.now, codeGenerator: () => "123456" });
    otp.requestOtp("+911111111111");
    clock.set(OTP_TTL_MS); // exactly at expiry boundary -> expired
    const result = otp.verifyOtp("+911111111111", "123456");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("EXPIRED");
  });

  it("accepts a code just before the TTL boundary", () => {
    const clock = withClock(0);
    const otp = createOtpManager({ now: clock.now, codeGenerator: () => "123456" });
    otp.requestOtp("+911111111111");
    clock.set(OTP_TTL_MS - 1);
    expect(otp.verifyOtp("+911111111111", "123456").ok).toBe(true);
  });

  it("rejects when no code exists for the phone", () => {
    const otp = createOtpManager();
    const result = otp.verifyOtp("+910000000000", "123456");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });

  it("consumes the code so it cannot be reused", () => {
    const clock = withClock();
    const otp = createOtpManager({ now: clock.now, codeGenerator: () => "123456" });
    otp.requestOtp("+911111111111");
    expect(otp.verifyOtp("+911111111111", "123456").ok).toBe(true);
    const second = otp.verifyOtp("+911111111111", "123456");
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("NOT_FOUND");
  });
});
