import express from "express";
import { applySecurityMiddleware } from "./shared/middleware/security.js";
import { ROUTER_MOUNTS } from "./shared/constants/routerMounts.js";

// Re-exported for backward compatibility: callers and tests historically import
// ROUTER_MOUNTS from the app factory. The canonical definition now lives in
// shared/constants so modules can reference their mount path without importing
// the whole application factory.
export { ROUTER_MOUNTS };

/**
 * Express application factory.
 *
 * Layered architecture: routers -> controllers -> services -> models.
 * Secrets live only in config and services; controllers shape sanitized
 * responses so that no credential ever reaches the frontend (Req 19.2).
 *
 * This factory wires the application skeleton and the router mount points for
 * every planned feature area. Security middleware (helmet, CORS, sanitize,
 * rate limiters) and the central error handler are layered on in later tasks
 * (2.2, 2.4, 2.6, 20.1); the concrete routers are attached as each feature is
 * implemented. Mounting points are defined here so that wiring is consistent
 * and predictable across tasks.
 *
 * Optional routers can be supplied via `options.routers` to attach feature
 * routers without modifying this factory. Each key maps to the mount path
 * declared in `ROUTER_MOUNTS`.
 *
 * HTTP security and input-sanitization middleware (helmet, CORS restricted to
 * the configured allowed origins, express-mongo-sanitize, and XSS/HTML input
 * sanitization) is applied before any route so every request is hardened and
 * sanitized (Req 19.3, 19.4). The CORS allow-list is sourced from
 * `options.allowedOrigins` and defaults to an empty list when not supplied.
 *
 * @param {object} [options]
 * @param {Record<string, import("express").Router>} [options.routers]
 *   Map of feature name -> Express Router to mount at its declared base path.
 * @param {string[]} [options.allowedOrigins]
 *   CORS allow-list, typically `config.cors.allowedOrigins`.
 * @returns {import("express").Express} The configured Express application.
 */

/**
 * @param {object} [options]
 * @param {Record<string, import("express").Router>} [options.routers]
 * @param {string[]} [options.allowedOrigins]
 * @param {import("express").RequestHandler} [options.globalLimiter]
 *   Global public-API rate limiter applied to every request after the security
 *   stack (Req 19.3, 28.1).
 * @param {Record<string, import("express").RequestHandler>} [options.routeLimiters]
 *   Per-mount rate limiters keyed by the same names as `ROUTER_MOUNTS`, applied
 *   immediately before the matching router (Req 28.2–28.4).
 * @returns {import("express").Express}
 */
export function createApp(options = {}) {
  const {
    routers = {},
    allowedOrigins = [],
    globalLimiter,
    routeLimiters = {},
  } = options;

  const app = express();

  // Parse JSON bodies first so the sanitizers below can clean req.body, then
  // apply HTTP security headers, CORS allow-listing, and input sanitization so
  // every inbound request is hardened and sanitized (Req 19.3, 19.4).
  // The raw body bytes are retained on req.rawBody because webhook signature
  // schemes (e.g. Razorpay's HMAC) are computed over the exact wire payload,
  // not a re-serialization of the parsed object.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  applySecurityMiddleware(app, { allowedOrigins });

  // Global public-API rate limiter, applied to every request after the
  // security stack (Req 19.3, 28.1). Endpoint-specific limiters are layered on
  // per mount below.
  if (typeof globalLimiter === "function") {
    app.use(globalLimiter);
  }

  // Liveness probe — wired end to end so the skeleton is verifiable.
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Router mount points (auth/admin, products, orders, payment, settings,
  // webhooks, media). Routers are provided by feature tasks and attached here
  // at their canonical base paths. A matching per-mount rate limiter (if any)
  // is applied immediately before its router so excess requests are rejected
  // before reaching the handler (Req 28.2–28.4). Unprovided routers are simply
  // skipped until their implementing task lands.
  for (const [name, basePath] of Object.entries(ROUTER_MOUNTS)) {
    const router = routers[name];
    if (!router) continue;
    const limiter = routeLimiters[name];
    if (typeof limiter === "function") {
      app.use(basePath, limiter);
    }
    app.use(basePath, router);
  }

  return app;
}

export default createApp;
