import rateLimit from "express-rate-limit";

import { buildConfig } from "../config/env.js";

/**
 * Tiered rate limiters (Req 19.3, 28).
 *
 * The platform applies endpoint-specific `express-rate-limit` instances on top
 * of a global public-API limiter:
 *   - global  : all public API endpoints          (Req 28.1)
 *   - otp      : OTP generation requests            (Req 28.2)
 *   - payment  : payment-order creation requests    (Req 28.3)
 *   - order    : order-creation requests            (Req 28.4)
 *   - login    : administrator login endpoint       (Req 19.3, 25.1)
 *
 * When a client exceeds a configured limit, the limiter rejects the excess
 * request with a standard rate-limit response: HTTP 429 and a generic JSON
 * body that discloses no internal detail (Req 28.5, 27).
 *
 * Each tier's window and maximum are sourced from `config.rateLimits` so they
 * are environment-configurable (Req 28). The limiters are mounted onto the
 * relevant routers in later tasks (20.1).
 */

/** Generic, information-free body returned on every rate-limit breach. */
export const RATE_LIMIT_MESSAGE = Object.freeze({
  error: "Too many requests, please try again later.",
});

/** HTTP status used for all rate-limit responses. */
export const RATE_LIMIT_STATUS = 429;

/**
 * Standard handler invoked when a request exceeds its tier limit (Req 28.5).
 * Returns a generic 429 response with no internal detail.
 *
 * @type {import("express-rate-limit").RateLimitExceededEventHandler}
 */
function rateLimitHandler(req, res /*, next, options */) {
  res.status(RATE_LIMIT_STATUS).json(RATE_LIMIT_MESSAGE);
}

/**
 * Build a single `express-rate-limit` middleware for a tier.
 *
 * @param {{ windowMs: number, max: number }} tier  Tier window and maximum.
 * @returns {import("express").RequestHandler} The configured limiter.
 */
export function createLimiter(tier) {
  const { windowMs, max } = tier;
  return rateLimit({
    windowMs,
    // `limit` is the v7 name for the per-window maximum (alias of `max`).
    limit: max,
    standardHeaders: true, // expose RateLimit-* headers
    legacyHeaders: false, // disable the deprecated X-RateLimit-* headers
    handler: rateLimitHandler,
  });
}

/**
 * Build the full set of tiered limiters from a rate-limit configuration.
 * Pure factory so the limiters can be constructed with any configuration in
 * tests without relying on module-load-time environment state.
 *
 * @param {object} rateLimits  The `config.rateLimits` object (per-tier
 *   `{ windowMs, max }` settings).
 * @returns {{
 *   globalLimiter: import("express").RequestHandler,
 *   otpLimiter: import("express").RequestHandler,
 *   paymentLimiter: import("express").RequestHandler,
 *   orderLimiter: import("express").RequestHandler,
 *   loginLimiter: import("express").RequestHandler,
 * }}
 */
export function createRateLimiters(rateLimits) {
  return {
    globalLimiter: createLimiter(rateLimits.global),
    otpLimiter: createLimiter(rateLimits.otp),
    paymentLimiter: createLimiter(rateLimits.payment),
    orderLimiter: createLimiter(rateLimits.order),
    loginLimiter: createLimiter(rateLimits.login),
  };
}

// Default limiters built from the current environment configuration. The
// rate-limit tiers all have safe defaults in `buildConfig`, so this does not
// require any environment variables to be present and is import-safe.
const { rateLimits } = buildConfig(process.env);

const limiters = createRateLimiters(rateLimits);

/** Global public-API limiter (Req 28.1). */
export const globalLimiter = limiters.globalLimiter;

/** OTP generation limiter (Req 28.2). */
export const otpLimiter = limiters.otpLimiter;

/** Payment-order creation limiter (Req 28.3). */
export const paymentLimiter = limiters.paymentLimiter;

/** Order-creation limiter (Req 28.4). */
export const orderLimiter = limiters.orderLimiter;

/** Administrator login limiter (Req 19.3, 25.1). */
export const loginLimiter = limiters.loginLimiter;
