import { describe, it, expect } from "vitest";
import fc from "fast-check";
import express from "express";
import { createApp, ROUTER_MOUNTS } from "./app.js";

describe("server scaffold", () => {
  it("creates an Express app instance", () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });

  it("exposes a request handler", () => {
    const app = createApp();
    // Express apps are themselves request-handler functions.
    expect(typeof app).toBe("function");
  });

  // Smoke check that fast-check is installed and operational for later PBT tasks.
  it("fast-check is wired up", () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return n + 0 === n;
      }),
      { numRuns: 100 }
    );
  });
});

describe("router mount points", () => {
  it("declares canonical base paths for every planned router", () => {
    expect(ROUTER_MOUNTS).toMatchObject({
      products: "/api/products",
      orders: "/api/orders",
      payment: "/api/payment",
      admin: "/api/admin",
      settings: "/api/admin/settings",
      webhooks: "/api/webhooks",
      media: "/api/media",
    });
  });

  it("mounts a provided router at its declared base path", async () => {
    const products = express.Router();
    products.get("/ping", (req, res) => res.json({ ok: true }));

    const app = createApp({ routers: { products } });

    // Use the app's own router to resolve the mounted handler via a request.
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/products/ping`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    } finally {
      server.close();
    }
  });

  it("skips routers that are not provided", () => {
    // Creating the app without routers must not throw.
    expect(() => createApp()).not.toThrow();
    expect(() => createApp({ routers: {} })).not.toThrow();
  });
});
