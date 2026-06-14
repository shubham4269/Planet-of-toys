import crypto from "node:crypto";

/**
 * OTP Manager (Req 6, 7).
 *
 * Generates, stores, verifies, and rate-limits six-digit numeric one-time
 * passwords entirely in memory. There is no database persistence: OTP records
 * and the per-phone rate-limit window live in `Map` instances for the lifetime
 * of the process (design "OTP Record" model).
 *
 * Behavior:
 *   - `requestOtp(phone)` enforces a sliding-window rate limit of at most three
 *     requests per phone number per ten-minute window, then generates a
 *     six-digit numeric code with a five-minute time-to-live (Req 7.1, 7.2,
 *     7.4).
 *   - `verifyOtp(phone, code)` succeeds only when a stored code matches and has
 *     not expired; mismatched or expired codes are rejected (Req 6.3, 6.4,
 *     7.3).
 *
 * Time is injectable via the `now` option so tests can advance the clock
 * deterministically without relying on real timers.
 */

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes (Req 7.2)
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (Req 7.4)
export const RATE_LIMIT_MAX_REQUESTS = 3; // 3 requests per window (Req 7.4)
const OTP_MIN = 0;
const OTP_MAX = 999999;
const OTP_DIGITS = 6;

/**
 * Generate a cryptographically random six-digit numeric OTP, zero-padded so it
 * always has exactly six characters (Req 7.1).
 *
 * @returns {string} a six-character numeric string, e.g. "004271"
 */
function generateCode() {
  // randomInt is [min, max) — use max + 1 so 999999 is reachable.
  const value = crypto.randomInt(OTP_MIN, OTP_MAX + 1);
  return String(value).padStart(OTP_DIGITS, "0");
}

/**
 * Create an OTP Manager backed by in-memory stores.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] returns the current time in epoch ms;
 *   defaults to `Date.now`. Injectable for deterministic testing.
 * @param {() => string} [options.codeGenerator] produces a six-digit code;
 *   defaults to a cryptographically random generator. Injectable for tests.
 */
export function createOtpManager({ now = Date.now, codeGenerator = generateCode } = {}) {
  /** @type {Map<string, { code: string, expiresAt: number }>} */
  const otpStore = new Map();
  /** @type {Map<string, number[]>} */
  const rateWindow = new Map();

  /**
   * Drop rate-window timestamps that fall outside the current sliding window.
   *
   * @param {string} phone
   * @param {number} currentTime epoch ms
   * @returns {number[]} the pruned, still-active timestamps for the phone
   */
  function pruneRateWindow(phone, currentTime) {
    const windowStart = currentTime - RATE_LIMIT_WINDOW_MS;
    const timestamps = (rateWindow.get(phone) ?? []).filter(
      (ts) => ts > windowStart
    );
    if (timestamps.length > 0) {
      rateWindow.set(phone, timestamps);
    } else {
      rateWindow.delete(phone);
    }
    return timestamps;
  }

  /**
   * Request a new OTP for a phone number.
   *
   * Enforces the sliding-window rate limit before generating. When the limit is
   * exceeded the request is rejected and no new code is generated or stored.
   *
   * @param {string} phone the customer phone number
   * @returns {{ ok: true, code: string, expiresAt: number } |
   *           { ok: false, reason: "RATE_LIMITED", retryAfterMs: number }}
   */
  function requestOtp(phone) {
    if (typeof phone !== "string" || phone.length === 0) {
      throw new TypeError("requestOtp requires a non-empty phone string");
    }

    const currentTime = now();
    const timestamps = pruneRateWindow(phone, currentTime);

    if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      // Oldest request determines when the window frees up again.
      const oldest = timestamps[0];
      const retryAfterMs = oldest + RATE_LIMIT_WINDOW_MS - currentTime;
      return { ok: false, reason: "RATE_LIMITED", retryAfterMs };
    }

    const code = codeGenerator();
    const expiresAt = currentTime + OTP_TTL_MS;
    otpStore.set(phone, { code, expiresAt });

    timestamps.push(currentTime);
    rateWindow.set(phone, timestamps);

    return { ok: true, code, expiresAt };
  }

  /**
   * Verify a submitted OTP for a phone number.
   *
   * Succeeds only when a stored code exists, matches the submitted code, and
   * has not expired. A successful verification consumes the stored code so it
   * cannot be reused. Mismatched and expired codes are rejected; an expired
   * record is removed.
   *
   * @param {string} phone the customer phone number
   * @param {string} code the submitted OTP
   * @returns {{ ok: true } |
   *           { ok: false, reason: "NOT_FOUND" | "EXPIRED" | "MISMATCH" }}
   */
  function verifyOtp(phone, code) {
    const record = otpStore.get(phone);
    if (!record) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    const currentTime = now();
    if (currentTime >= record.expiresAt) {
      otpStore.delete(phone);
      return { ok: false, reason: "EXPIRED" };
    }

    if (record.code !== code) {
      return { ok: false, reason: "MISMATCH" };
    }

    // Consume the code on success to prevent reuse.
    otpStore.delete(phone);
    return { ok: true };
  }

  /**
   * Remove all stored OTPs and rate-window state. Primarily for tests.
   */
  function reset() {
    otpStore.clear();
    rateWindow.clear();
  }

  return { requestOtp, verifyOtp, reset };
}

// Default process-wide singleton OTP Manager using the real clock.
const otpManager = createOtpManager();

export const requestOtp = otpManager.requestOtp;
export const verifyOtp = otpManager.verifyOtp;

export default otpManager;
