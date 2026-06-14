// server/src/modules/content/content.router.test.js
// Mirrors the existing server router-test style: spin up the app with
// `app.listen(0)` and exercise it over real HTTP with `fetch` (no supertest).
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentAdminRouter } from "./content.admin.router.js";
import { createContentPublicRouter } from "./content.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import PromoBanner from "./promoBanner.model.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await PromoBanner.deleteMany({});
});

/** Build + start the app; returns { server, adminUrl, publicUrl }. */
function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) {
      return res
        .status(401)
        .json({ error: { message: "Authentication is required.", status: 401 } });
    }
    req.admin = { id: "admin-1" };
    next();
  };
  app.use("/api/admin/content", createContentAdminRouter({ requireAuth }));
  app.use("/api/content", createContentPublicRouter());
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    server,
    adminUrl: `${base}/api/admin/content/promo-banner`,
    publicUrl: `${base}/api/content/promo-banner`,
  };
}

/** PUT JSON helper. */
function putJson(url, body) {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("content routers", () => {
  it("rejects unauthenticated admin requests", async () => {
    const { server, adminUrl } = buildApp({ authorized: false });
    try {
      const res = await fetch(adminUrl);
      expect(res.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("admin can read then update the banner", async () => {
    const { server, adminUrl } = buildApp();
    try {
      const read = await fetch(adminUrl);
      expect(read.status).toBe(200);
      expect((await read.json()).banner.enabled).toBe(false);

      const update = await putJson(adminUrl, {
        enabled: true,
        announcements: [{ text: "Free shipping" }],
      });
      expect(update.status).toBe(200);
      const body = await update.json();
      expect(body.banner.enabled).toBe(true);
      expect(body.banner.announcements).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("admin update returns 400 on invalid input", async () => {
    const { server, adminUrl } = buildApp();
    try {
      const res = await putJson(adminUrl, { bgColor: "notacolor" });
      expect(res.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("public endpoint exposes only enabled banner without admin-only fields", async () => {
    const { server, adminUrl, publicUrl } = buildApp();
    try {
      await putJson(adminUrl, {
        enabled: true,
        announcements: [
          { text: "Live", enabled: true },
          { text: "Off", enabled: false },
        ],
      });
      const res = await fetch(publicUrl);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.banner.enabled).toBe(true);
      expect(body.banner.announcements).toHaveLength(1);
      expect(body.banner.announcements[0].text).toBe("Live");
      expect(body.banner.announcements[0].enabled).toBeUndefined();
    } finally {
      server.close();
    }
  });
});
