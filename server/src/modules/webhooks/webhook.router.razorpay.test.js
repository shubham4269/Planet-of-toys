import { describe, it, expect, vi } from "vitest";
import express from "express";
import crypto from "node:crypto";

import { createWebhookRouter, createRazorpayWebhookVerifier } from "./webhook.router.js";

/**
 * Razorpay webhook endpoint (POST /api/webhooks/razorpay).
 *
 * Deliveries are signed with HMAC-SHA256 over the raw body, keyed by the
 * merchant webhook secret, in the x-razorpay-signature header. The verifier
 * fails closed when unconfigured and rejects mismatched signatures with 401;
 * authentic events are acknowledged with 200.
 */

const SECRET = "whsec_test_secret";

function sign(body, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/** Mount the webhook router as app.js does (JSON parser capturing rawBody). */
function buildApp({ secret = SECRET, unmatchedModel, webhookService } = {}) {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(
    "/api/webhooks",
    createWebhookRouter({
      verifyRazorpayAuthenticity: createRazorpayWebhookVerifier({
        resolveSecret: () => secret,
      }),
      webhookService: webhookService ?? {
        processRazorpayEvent: vi
          .fn()
          .mockResolvedValue({ status: "ignored", event: "payment.failed" }),
      },
      unmatchedModel: unmatchedModel ?? { create: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
  );
  return app;
}

async function withServer(app, run) {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/webhooks/razorpay`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
}

const EVENT = JSON.stringify({
  event: "payment.failed",
  payload: {
    payment: {
      entity: {
        id: "pay_1",
        order_id: "order_rzp_1",
        status: "failed",
        error_reason: "payment_declined",
      },
    },
  },
});

describe("POST /api/webhooks/razorpay", () => {
  it("hands an authentic, correctly signed delivery to the reconciliation service", async () => {
    const webhookService = {
      processRazorpayEvent: vi.fn().mockResolvedValue({
        status: "updated",
        event: "payment.failed",
        paymentStatus: "FAILED",
      }),
    };
    await withServer(buildApp({ webhookService }), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": sign(EVENT),
        },
        body: EVENT,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        status: "updated",
        paymentStatus: "FAILED",
      });
      expect(webhookService.processRazorpayEvent).toHaveBeenCalledWith(
        JSON.parse(EVENT)
      );
    });
  });

  it("answers 404 for an unmatched captured payment so Razorpay retries", async () => {
    const webhookService = {
      processRazorpayEvent: vi.fn().mockResolvedValue({
        status: "unmatched",
        event: "payment.captured",
      }),
    };
    await withServer(buildApp({ webhookService }), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": sign(EVENT),
        },
        body: EVENT,
      });
      expect(res.status).toBe(404);
    });
  });

  it("rejects a mismatched signature with 401 and records the event", async () => {
    const unmatchedModel = { create: vi.fn() };
    await withServer(buildApp({ unmatchedModel }), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": sign(EVENT, "wrong-secret"),
        },
        body: EVENT,
      });
      expect(res.status).toBe(401);
      expect(unmatchedModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "Razorpay webhook signature verification failed.",
        })
      );
    });
  });

  it("rejects an unsigned delivery with 401", async () => {
    await withServer(buildApp(), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: EVENT,
      });
      expect(res.status).toBe(401);
    });
  });

  it("fails closed with 401 when no webhook secret is configured", async () => {
    await withServer(buildApp({ secret: null }), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": sign(EVENT),
        },
        body: EVENT,
      });
      expect(res.status).toBe(401);
    });
  });
});
