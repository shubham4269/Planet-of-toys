import { connectDatabase } from "./config/database.js";
import { createApp } from "./app.js";
import { loadConfigOrExit } from "./config/env.js";
import { createAuthRouter } from "./routers/auth.router.js";
import { createPaymentRouter } from "./routers/payment.router.js";
import { createPublicProductRouter } from "./routers/product.router.js";
import { createMediaRouters } from "./routers/media.router.js";
import { createSettingsRouter } from "./routers/settings.router.js";
import { createShippingRouter } from "./routers/shipping.router.js";
import { createOrdersRouter } from "./routers/order.router.js";
import { createOtpRouter } from "./routers/otp.router.js";
import { createWebhookRouter } from "./routers/webhook.router.js";
import { createConfigRouter } from "./routers/config.router.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { createRateLimiters } from "./middleware/rateLimiters.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  loginAuditRecorder,
  requestAuditRecorder,
} from "./services/audit.service.js";
import { retryPendingShipments } from "./services/shipping.service.js";

/**
 * Server entry point and composition root (task 20.1).
 *
 * On boot we validate the presence of all required environment variables and
 * fail fast (process exit) when any are missing (Req 29.4, 29.5). Bootstrap
 * secrets are sourced only from the environment (Req 29.1). We then connect to
 * MongoDB and wire the full conversion path:
 *
 *   - HTTP security middleware + a global public-API rate limiter, with tighter
 *     per-endpoint limiters on OTP, payment, and order creation (Req 19.3, 28).
 *   - All feature routers mounted at their canonical paths, with admin and
 *     settings routes behind the JWT auth guard (Req 19.5, 30.1, 30.13).
 *   - Auditable administrator actions recorded server-side (Req 26).
 *   - A central error handler that returns only generic messages and logs full
 *     detail server-side (Req 27), mounted after every route.
 *   - A background sweep that retries Shiprocket fulfilment for orders still in
 *     Shipment_Status = PENDING (Req 11.7).
 */
const config = loadConfigOrExit();

// Connect to MongoDB before accepting requests.
try {
  await connectDatabase(config.secrets.mongoUri);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Failed to connect to MongoDB:", err.message);
  process.exit(1);
}

// Tiered rate limiters built from the environment configuration (Req 28).
const limiters = createRateLimiters(config.rateLimits);

// Per-request audit recorders (Req 26). The login handler consumes a factory
// returning `{ record }`; the settings module consumes a per-request recorder
// it invokes with a fully-formed entry.
const loginAudit = loginAuditRecorder();
const settingsAudit = requestAuditRecorder();

// Build media routers (upload + serve share a single media service).
const { uploadRouter: mediaUploadRouter, serveRouter: mediaServeRouter } =
  createMediaRouters({
    uploads: config.uploads,
    requireAuth,
  });

const app = createApp({
  allowedOrigins: config.cors.allowedOrigins,
  // Global limiter on every request; tighter limiters per sensitive mount.
  globalLimiter: limiters.globalLimiter,
  routeLimiters: {
    otp: limiters.otpLimiter,
    payment: limiters.paymentLimiter,
    orders: limiters.orderLimiter,
  },
  routers: {
    // Auth + admin surface: login, dashboard, orders, products (Req 14–17, 25).
    admin: createAuthRouter({ requireAuth, recordAudit: loginAudit }),
    // Payment: POST /api/payment/razorpay-order (Req 5.1, 5.5).
    payment: createPaymentRouter(),
    // Products: GET /api/products/:slug (Req 1).
    products: createPublicProductRouter(),
    // Orders: POST /api/orders — COD OTP verified at the boundary (Req 5, 6, 9).
    orders: createOrdersRouter(),
    // OTP: POST /api/otp/request — generate + WhatsApp-deliver a code (Req 6.1).
    otp: createOtpRouter(),
    // Webhooks at /api/webhooks (Req 12, 24):
    //  - POST /shiprocket : Shiprocket status updates. The default verifier
    //    resolves its shared secret at request time from System Settings,
    //    falling back to SHIPROCKET_WEBHOOK_TOKEN, and FAILS CLOSED when
    //    neither is configured (Req 24.1, 24.4, 29.2).
    //  - GET  /whatsapp   : Meta webhook verification handshake, validated
    //    against the configured WhatsApp verify token (settings → env).
    //  - POST /whatsapp   : inbound WhatsApp messages and status receipts;
    //    logged best-effort and acknowledged with 200.
    webhooks: createWebhookRouter(),
    // Media: static serving at /api/media (Req 18).
    media: mediaServeRouter,
    // Settings: /api/admin/settings, guarded + audited (Req 19.5, 30).
    settings: createSettingsRouter({ requireAuth, recordAudit: settingsAudit }),
    // Shipping: GET /api/shipping/serviceability (Req 4.3).
    shipping: createShippingRouter(),
    // Public storefront config: GET /api/config -> { metaPixelId } so the
    // admin-set pixel id takes effect without a client rebuild (Req 3.4).
    config: createConfigRouter(),
  },
});

// Authenticated media upload at /api/admin/media (Req 18, 23). Mounted before
// the not-found/error handlers below so it remains reachable.
app.use("/api/admin/media", mediaUploadRouter);

// Unmatched routes -> 404, then the central error handler returns only generic
// messages while logging full detail server-side (Req 27). These must be the
// last middleware, after every router.
app.use(notFoundHandler);
app.use(errorHandler);

// Background retry sweep: periodically re-attempt Shiprocket fulfilment for any
// order still in Shipment_Status = PENDING (Req 11.7). The timer is unref'd so
// it never keeps the process alive on its own.
const RETRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const retrySweep = setInterval(() => {
  retryPendingShipments().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Pending-shipment retry sweep failed:", err?.message ?? err);
  });
}, RETRY_SWEEP_INTERVAL_MS);
retrySweep.unref?.();

app.listen(config.server.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Planet of Toys API listening on port ${config.server.port}`);
});
