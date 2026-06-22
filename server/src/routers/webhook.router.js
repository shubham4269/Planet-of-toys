import { Router } from "express";
import crypto from "node:crypto";

import { webhookService as defaultWebhookService } from "../services/webhook.service.js";
import { UnmatchedWebhookEvent } from "../models/index.js";
import { getCredential } from "../services/credential.service.js";
import { logger as defaultLogger } from "../config/logger.js";

/**
 * Webhook Router — Shiprocket status webhooks (Req 12, 24) and the WhatsApp
 * Business Cloud API webhook.
 *
 * Mounted at `/api/webhooks`. Exposes:
 *
 *   POST /shiprocket   →  process an authentic Shiprocket status webhook
 *   GET  /whatsapp     →  Meta webhook verification handshake (hub.challenge)
 *   POST /whatsapp     →  inbound WhatsApp events (messages, delivery/read
 *                          receipts, status updates)
 *
 * For Shiprocket, authenticity is verified FIRST, before any processing (Req
 * 24.1, 24.4): requests whose verification fails are rejected with 401, logged
 * server-side (Req 24.3), and recorded as an unmatched event — no order is
 * mutated (Property 37). Only verified requests are handed to the
 * Webhook_Handler service, which maps the status and updates the matching
 * order, or rejects + records when the order is unmatched (Req 12).
 *
 * For WhatsApp, the GET handshake compares the `hub.verify_token` query value,
 * in constant time, against the configured WhatsApp verify token (resolved from
 * System Settings, falling back to `WHATSAPP_VERIFY_TOKEN`); on a match it
 * echoes back `hub.challenge`, otherwise it responds 403. It FAILS CLOSED: with
 * no verify token configured, every verification request is rejected. Inbound
 * POST events are parsed and logged best-effort, then acknowledged with 200 so
 * Meta does not retry; processing never throws to the caller.
 */

/**
 * Constant-time comparison of two strings. Returns false for non-strings or
 * length mismatches without leaking timing information about the secret.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Build a Shiprocket webhook authenticity verifier (Req 24.1).
 *
 * Shiprocket signs webhook deliveries with a merchant-configured token sent in
 * a request header (default `x-api-key`). The verifier compares it, in constant
 * time, against the configured shared secret. The secret is resolved at request
 * time, preferring the value stored (encrypted) in System Settings and falling
 * back to the `SHIPROCKET_WEBHOOK_TOKEN` environment variable (Req 29.2). It
 * FAILS CLOSED: when no secret is configured in either source the verifier
 * rejects every request, so an unconfigured handler never processes
 * unauthenticated webhooks (Req 24.4).
 *
 * `verify` is async because secret resolution may read System Settings.
 *
 * @param {object} [options]
 * @param {string} [options.secret] static shared secret (tests / overrides)
 * @param {() => Promise<string|null>|string|null} [options.resolveSecret]
 *   custom async resolver; defaults to the credential service (settings → env)
 * @param {string} [options.headerName] header carrying the token
 * @returns {(req: import("express").Request) => Promise<boolean>}
 */
export function createShiprocketWebhookVerifier({
  secret,
  resolveSecret,
  headerName = "x-api-key",
} = {}) {
  const getSecret =
    typeof resolveSecret === "function"
      ? resolveSecret
      : secret !== undefined
        ? () => secret
        : () => getCredential("shiprocket", "webhookToken");

  return async function verify(req) {
    let configured;
    try {
      configured = await getSecret();
    } catch {
      // Resolution failure (e.g. DB unavailable) must not authenticate anyone.
      configured = null;
    }
    if (typeof configured !== "string" || configured.trim() === "") {
      // Fail closed: an unconfigured secret means nothing can be authentic.
      return false;
    }
    const provided = req?.headers?.[headerName.toLowerCase()];
    return safeEqual(provided, configured);
  };
}

/**
 * Build a Razorpay webhook authenticity verifier.
 *
 * Razorpay signs each webhook delivery with HMAC-SHA256 over the RAW request
 * body, keyed by the merchant-configured webhook secret, and sends the hex
 * digest in the `x-razorpay-signature` header. The secret is resolved at
 * request time, preferring the value stored (encrypted) in System Settings and
 * falling back to the `RAZORPAY_WEBHOOK_SECRET` environment variable
 * (Req 29.2). It FAILS CLOSED: with no secret configured, every request is
 * rejected.
 *
 * @param {object} [options]
 * @param {string} [options.secret] static shared secret (tests / overrides)
 * @param {() => Promise<string|null>|string|null} [options.resolveSecret]
 *   custom async resolver; defaults to the credential service (settings → env)
 * @returns {(req: import("express").Request) => Promise<boolean>}
 */
export function createRazorpayWebhookVerifier({ secret, resolveSecret } = {}) {
  const getSecret =
    typeof resolveSecret === "function"
      ? resolveSecret
      : secret !== undefined
        ? () => secret
        : () => getCredential("razorpay", "webhookSecret");

  return async function verify(req) {
    let configured;
    try {
      configured = await getSecret();
    } catch {
      configured = null;
    }
    if (typeof configured !== "string" || configured.trim() === "") {
      // Fail closed: an unconfigured secret means nothing can be authentic.
      return false;
    }
    const provided = req?.headers?.["x-razorpay-signature"];
    if (typeof provided !== "string" || provided === "") return false;

    // Sign the exact wire payload; req.rawBody is captured by the JSON parser
    // in app.js. Fall back to re-serializing the parsed body only as a last
    // resort (e.g. in tests that construct requests without a raw buffer).
    const payload =
      req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
    const expected = crypto
      .createHmac("sha256", configured)
      .update(payload)
      .digest("hex");
    return safeEqual(provided, expected);
  };
}

/**
 * Build a resolver for the WhatsApp webhook verify token (Req 29.2). Prefers
 * the value stored (encrypted) in System Settings and falls back to the
 * `WHATSAPP_VERIFY_TOKEN` environment variable. Resolution failures (e.g. DB
 * unavailable) resolve to `null` so verification fails closed.
 *
 * @returns {() => Promise<string|null>}
 */
function defaultWhatsAppVerifyTokenResolver() {
  return async () => {
    try {
      return await getCredential("whatsapp", "verifyToken");
    } catch {
      return null;
    }
  };
}

/**
 * Parse a WhatsApp Cloud API webhook payload and log every inbound message and
 * status update best-effort. The payload shape is:
 *
 *   { object: "whatsapp_business_account",
 *     entry: [ { id, changes: [ { field, value: {
 *       messages?: [...], statuses?: [...], contacts?: [...] } } ] } ] }
 *
 * This never throws — malformed payloads are tolerated and simply yield no
 * log lines beyond a debug-level note.
 *
 * @param {any} body the parsed JSON webhook body
 * @param {{ info: Function, warn: Function }} logger
 */
function logWhatsAppEvent(body, logger) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        logger.info("WhatsApp inbound message received.", {
          messageId: msg?.id,
          from: msg?.from,
          type: msg?.type,
          timestamp: msg?.timestamp,
        });
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        logger.info("WhatsApp message status update received.", {
          messageId: st?.id,
          recipient: st?.recipient_id,
          status: st?.status,
          timestamp: st?.timestamp,
        });
      }
    }
  }
}

/**
 * Create the webhook router.
 *
 * @param {object} [options]
 * @param {(req: import("express").Request) => boolean} [options.verifyAuthenticity]
 * @param {{ processShiprocketEvent: Function }} [options.webhookService]
 * @param {typeof UnmatchedWebhookEvent} [options.unmatchedModel]
 * @param {() => Promise<string|null>|string|null} [options.resolveWhatsAppVerifyToken]
 *   resolver for the WhatsApp webhook verify token (settings → env)
 * @param {(body: any, ctx: { logger: object }) => void|Promise<void>} [options.onWhatsAppEvent]
 *   handler for an inbound WhatsApp event; defaults to best-effort logging
 * @param {{ info: Function, warn: Function, error: Function }} [options.logger]
 * @returns {import("express").Router}
 */
export function createWebhookRouter({
  verifyAuthenticity = createShiprocketWebhookVerifier(),
  verifyRazorpayAuthenticity = createRazorpayWebhookVerifier(),
  webhookService = defaultWebhookService,
  unmatchedModel = UnmatchedWebhookEvent,
  resolveWhatsAppVerifyToken = defaultWhatsAppVerifyTokenResolver(),
  onWhatsAppEvent,
  logger = defaultLogger,
} = {}) {
  const router = Router();

  // Razorpay payment webhooks (payment.captured, payment.failed). Authenticity
  // is verified FIRST against the HMAC signature; unverified deliveries are
  // rejected with 401 and recorded, mirroring the Shiprocket handler. Verified
  // events are reconciled against orders by the Webhook_Handler service: a
  // captured payment whose order is missing answers 404 so Razorpay retries
  // (the synchronous verify call usually lands moments later), everything else
  // is acknowledged so deliveries are not retried.
  router.post("/razorpay", async (req, res, next) => {
    try {
      if (!(await verifyRazorpayAuthenticity(req))) {
        logger.warn("Rejected webhook: authenticity verification failed.", {
          path: req.originalUrl ?? req.url,
        });
        try {
          await unmatchedModel.create({
            payload: req.body ?? {},
            reason: "Razorpay webhook signature verification failed.",
          });
        } catch {
          // Recording is best-effort; the log above is the authoritative record.
        }
        return res.status(401).json({ error: "Unauthorized." });
      }

      const result = await webhookService.processRazorpayEvent(req.body ?? {});

      if (result.status === "unmatched") {
        return res.status(404).json({ status: "unmatched" });
      }
      if (result.status === "ignored") {
        return res.status(202).json({ status: "ignored" });
      }
      return res.status(200).json({
        status: "updated",
        paymentStatus: result.paymentStatus,
      });
    } catch (error) {
      return next(error);
    }
  });

  // Shiprocket status webhook. NOTE: Shiprocket's dashboard rejects any webhook
  // URL containing the keywords "shiprocket", "kartrocket", "sr", or "kr"
  // ("Address is not allowed"), so this handler is also exposed on the neutral
  // "/courier" path — point the Shiprocket dashboard at /api/webhooks/courier.
  // The original "/shiprocket" path is retained for backward compatibility.
  router.post(["/shiprocket", "/courier"], async (req, res, next) => {
    try {
      // 1) Verify authenticity FIRST (Req 24.1). Only authentic webhooks are
      //    processed (Req 24.4).
      if (!(await verifyAuthenticity(req))) {
        // Record the failed verification attempt server-side (Req 24.3) and
        // reject without mutating any order (Property 37). Name the route and
        // the likely cause so a Shiprocket "Test Webhook" 401 is unmistakable
        // in the logs (the x-api-key header did not match the configured token).
        logger.warn(
          "Rejected Shiprocket webhook (401): x-api-key did not match the configured webhook token.",
          { path: req.originalUrl ?? req.url }
        );
        try {
          await unmatchedModel.create({
            payload: req.body ?? {},
            reason: "Webhook authenticity verification failed.",
          });
        } catch {
          // Recording is best-effort; the log above is the authoritative record.
        }
        return res.status(401).json({ error: "Unauthorized." });
      }

      // 2) Process the authentic event (Req 12).
      const result = await webhookService.processShiprocketEvent(req.body ?? {});

      if (result.status === "test") {
        // Authenticated request that carries no order reference — a provider
        // connectivity / "Test Webhook" ping. Acknowledge with 200 so the
        // Shiprocket dashboard test succeeds; nothing is mutated or recorded.
        logger.info?.(
          "Shiprocket webhook ping acknowledged (authenticated, no order reference — likely the dashboard Test Webhook).",
          { path: req.originalUrl ?? req.url }
        );
        return res.status(200).json({ status: "ok" });
      }
      if (result.status === "unmatched") {
        // Token was VALID, but the payload references no existing order — this
        // is what Shiprocket's dashboard Save/Test validation produces (a
        // sample payload with a dummy order id). The event is still RECORDED by
        // the service (Req 12.4) and NO order is mutated; we acknowledge with
        // 200 instead of 404 so Shiprocket accepts the endpoint on save. A
        // genuinely unmatched Shiprocket status event never becomes matched
        // later, so a 404-driven retry would be pointless noise.
        logger.warn(
          "Shiprocket webhook authenticated but no matching order — recorded, acknowledged with 200 (test/sample payload or an order we don't have).",
          { path: req.originalUrl ?? req.url }
        );
        return res.status(200).json({ status: "unmatched" });
      }
      if (result.status === "ignored") {
        // Matched order but unrecognized status — acknowledged, no mutation.
        logger.warn(
          "Shiprocket webhook matched an order but the status was unrecognized — acknowledged without changes.",
          { path: req.originalUrl ?? req.url }
        );
        return res.status(202).json({ status: "ignored" });
      }
      return res.status(200).json({
        status: "updated",
        orderStatus: result.orderStatus,
      });
    } catch (error) {
      return next(error);
    }
  });

  // WhatsApp Business Cloud API webhook verification handshake. Meta sends a
  // GET with hub.mode=subscribe, hub.verify_token, and hub.challenge when the
  // webhook URL is (re)configured. We echo the challenge back only when the
  // provided token matches our configured verify token (constant-time compare);
  // otherwise we fail closed with 403.
  router.get("/whatsapp", async (req, res) => {
    // Meta sends the handshake params as `hub.mode`, `hub.verify_token`, and
    // `hub.challenge`. The security stack (mongo-sanitize + xss sanitizer)
    // rewrites any query key containing a dot to an underscore to block
    // operator injection, so by the time the request lands here the keys may be
    // `hub_mode` / `hub_verify_token` / `hub_challenge`. Read both spellings so
    // verification works whether or not sanitization renamed them.
    const mode = req.query["hub.mode"] ?? req.query.hub_mode;
    const token = req.query["hub.verify_token"] ?? req.query.hub_verify_token;
    const challenge = req.query["hub.challenge"] ?? req.query.hub_challenge;

    let configured;
    try {
      configured =
        typeof resolveWhatsAppVerifyToken === "function"
          ? await resolveWhatsAppVerifyToken()
          : resolveWhatsAppVerifyToken;
    } catch {
      configured = null;
    }

    if (typeof configured !== "string" || configured.trim() === "") {
      // Fail closed: no verify token configured means nothing can verify.
      logger.warn("Rejected WhatsApp webhook verification: not configured.");
      return res.sendStatus(403);
    }

    if (mode === "subscribe" && safeEqual(token, configured)) {
      // Meta requires the raw challenge string echoed back as text/plain.
      return res.status(200).type("text/plain").send(String(challenge ?? ""));
    }

    logger.warn("Rejected WhatsApp webhook verification: token mismatch.", {
      mode,
    });
    return res.sendStatus(403);
  });

  // WhatsApp inbound events (customer messages, delivery/read receipts, message
  // status updates). Processing is best-effort and never throws; we always
  // acknowledge with 200 so Meta does not retry deliveries.
  router.post("/whatsapp", async (req, res) => {
    try {
      const body = req.body ?? {};
      if (typeof onWhatsAppEvent === "function") {
        await onWhatsAppEvent(body, { logger });
      } else {
        logWhatsAppEvent(body, logger);
      }
    } catch (error) {
      logger.error("WhatsApp webhook processing failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Always acknowledge to prevent Meta from retrying the delivery.
    return res.sendStatus(200);
  });

  return router;
}

export default createWebhookRouter;
