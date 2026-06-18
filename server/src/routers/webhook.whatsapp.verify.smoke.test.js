import { describe, it, expect } from "vitest";
import http from "node:http";

import { createApp } from "../app.js";
import { createWebhookRouter } from "./webhook.router.js";

/**
 * Regression test: the WhatsApp verification handshake must succeed through the
 * full app, including the mongo-sanitize + xss sanitizer stack that rewrites
 * dotted query keys (`hub.mode` -> `hub_mode`). Previously the handler only read
 * the dotted keys, so verification always failed with a 403 token mismatch.
 */
function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

describe("WhatsApp webhook verification through the full middleware stack", () => {
  it("echoes hub.challenge when the verify token matches", async () => {
    const app = createApp({
      allowedOrigins: [],
      routers: {
        webhooks: createWebhookRouter({
          resolveWhatsAppVerifyToken: () => "Shubham12246942@",
        }),
      },
    });
    const server = await listen(app);
    const { port } = server.address();
    try {
      const res = await get(
        port,
        "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=Shubham12246942%40&hub.challenge=42"
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe("42");
    } finally {
      server.close();
    }
  });

  it("rejects a mismatched token with 403", async () => {
    const app = createApp({
      allowedOrigins: [],
      routers: {
        webhooks: createWebhookRouter({
          resolveWhatsAppVerifyToken: () => "Shubham12246942@",
        }),
      },
    });
    const server = await listen(app);
    const { port } = server.address();
    try {
      const res = await get(
        port,
        "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=42"
      );
      expect(res.status).toBe(403);
    } finally {
      server.close();
    }
  });
});
