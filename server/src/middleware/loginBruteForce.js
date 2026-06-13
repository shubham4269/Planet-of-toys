import { buildConfig } from "../config/env.js";

/**
 * Login brute-force protection (Req 25.2).
 *
 * Complements the {@link loginLimiter} rate limiter (Req 25.1) by tracking
 * *failed* administrator login attempts per source and temporarily blocking a
 * source once its failures exceed the configured threshold within the
 * configured window. The block lasts until the window elapses, after which the
 * source may try again (Req 25.2).
 *
 * The tracker is intentionally simple and in-memory: a single admin panel does
 * not need a distributed store, and the state is naturally short-lived (one
 * rolling window per source). State is keyed by a caller-supplied key
 * (defaults to the request IP) so it can be exercised deterministically in
 * tests via a custom key generator and an injectable clock.
 *
 * The controller records the outcome of each attempt:
 *  - {@link createLoginBruteForce}'s `recordFailure` is called for every failed
 *    authentication (wrong password or unregistered email — both are generic
 *    failures, Req 25.3, 25.4).
 *  - `recordSuccess` clears a source's counter on a successful login.
 *
 * The `guard` middleware rejects requests from a currently-blocked source with
 * a generic rate-limit response that discloses no internal detail (Req 27).
 */

/** Generic, information-free body returned to a blocked source (Req 27). */
export const LOGIN_BLOCK_MESSAGE = Object.freeze({
  error: "Too many failed login attempts, please try again later.",
});

/** HTTP status used when a source is temporarily blocked. */
export const LOGIN_BLOCK_STATUS = 429;

/** Default key generator: identify a source by its request IP. */
function defaultKeyGenerator(req) {
  return req.ip ?? "unknown";
}

/**
 * Create a login brute-force tracker plus its guard middleware.
 *
 * @param {object} [options]
 * @param {number} [options.threshold] Failed-attempt count that, once
 *   exceeded, blocks the source. Defaults to `config.rateLimits.login.blockThreshold`.
 * @param {number} [options.windowMs] Rolling window in ms after which a
 *   source's failure counter resets. Defaults to `config.rateLimits.login.windowMs`.
 * @param {() => number} [options.now] Clock, injectable for tests. Defaults to `Date.now`.
 * @param {(req: import("express").Request) => string} [options.keyGenerator]
 *   Maps a request to a source key. Defaults to the request IP.
 * @returns {{
 *   guard: import("express").RequestHandler,
 *   recordFailure: (key: string) => void,
 *   recordSuccess: (key: string) => void,
 *   isBlocked: (key: string) => boolean,
 *   keyFor: (req: import("express").Request) => string,
 *   reset: () => void,
 * }}
 */
export function createLoginBruteForce({
  threshold,
  windowMs,
  now = Date.now,
  keyGenerator = defaultKeyGenerator,
} = {}) {
  const { rateLimits } = buildConfig(process.env);
  const limit =
    Number.isFinite(threshold) ? threshold : rateLimits.login.blockThreshold;
  const window = Number.isFinite(windowMs) ? windowMs : rateLimits.login.windowMs;

  /** @type {Map<string, { count: number, windowStart: number }>} */
  const attempts = new Map();

  /** True when the source's current window has elapsed (so it should reset). */
  function windowElapsed(entry, at) {
    return at - entry.windowStart >= window;
  }

  function isBlocked(key) {
    const entry = attempts.get(key);
    if (!entry) return false;
    const at = now();
    // Once the window elapses the source is allowed to try again (Req 25.2).
    if (windowElapsed(entry, at)) {
      attempts.delete(key);
      return false;
    }
    // "exceeds the configured threshold" — strictly greater than (Req 25.2).
    return entry.count > limit;
  }

  function recordFailure(key) {
    const at = now();
    let entry = attempts.get(key);
    if (!entry || windowElapsed(entry, at)) {
      entry = { count: 0, windowStart: at };
    }
    entry.count += 1;
    attempts.set(key, entry);
  }

  function recordSuccess(key) {
    attempts.delete(key);
  }

  function keyFor(req) {
    return keyGenerator(req);
  }

  function reset() {
    attempts.clear();
  }

  /**
   * Express middleware that blocks requests from a currently-blocked source
   * before any credential processing occurs. Attaches the resolved source key
   * to `req.loginSourceKey` so the controller can record the attempt outcome
   * against the same source.
   *
   * @type {import("express").RequestHandler}
   */
  function guard(req, res, next) {
    const key = keyFor(req);
    req.loginSourceKey = key;
    if (isBlocked(key)) {
      return res.status(LOGIN_BLOCK_STATUS).json(LOGIN_BLOCK_MESSAGE);
    }
    return next();
  }

  return { guard, recordFailure, recordSuccess, isBlocked, keyFor, reset };
}

export default createLoginBruteForce;
