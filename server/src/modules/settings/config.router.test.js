import { describe, it, expect } from "vitest";
import express from "express";

import { createConfigRouter } from "./config.router.js";

/**
 * Public storefront config (GET /api/config): exposes the Meta Pixel ID —
 * public by nature — resolved from System Settings with env fallback, and
 * never anything secret. Resolution failures degrade to a null pixel id.
 */

async function withServer(router, run) {
  const app = express();
  app.use("/api/config", router);
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/config`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
}

describe("GET /api/config", () => {
  it("returns the resolved Meta Pixel id", async () => {
    const router = createConfigRouter({
      resolvePixelId: async () => "1234567890",
    });
    await withServer(router, async (url) => {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ metaPixelId: "1234567890" });
    });
  });

  it("returns null when no pixel id is configured", async () => {
    const router = createConfigRouter({ resolvePixelId: async () => null });
    await withServer(router, async (url) => {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ metaPixelId: null });
    });
  });

  it("degrades to null when credential resolution fails", async () => {
    const router = createConfigRouter({
      resolvePixelId: async () => {
        throw new Error("db unavailable");
      },
    });
    await withServer(router, async (url) => {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ metaPixelId: null });
    });
  });
});
