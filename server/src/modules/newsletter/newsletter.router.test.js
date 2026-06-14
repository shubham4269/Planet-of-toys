import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createNewsletterPublicRouter } from "./newsletter.public.router.js";
import { createNewsletterAdminRouter } from "./newsletter.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import NewsletterSubscriber from "./subscriber.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await NewsletterSubscriber.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NewsletterSubscriber.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Authentication is required." } });
    req.admin = { id: "admin-1" }; next();
  };
  app.use("/api/newsletter", createNewsletterPublicRouter());
  app.use("/api/admin/newsletter", createNewsletterAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}
const postJson = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("newsletter routers", () => {
  it("public subscribe: 400 invalid, 200 valid", async () => {
    const { server, base } = buildApp();
    try {
      expect((await postJson(`${base}/api/newsletter/subscribe`, { email: "bad" })).status).toBe(400);
      const ok = await postJson(`${base}/api/newsletter/subscribe`, { email: "ok@x.com" });
      expect(ok.status).toBe(200);
      expect((await ok.json()).ok).toBe(true);
    } finally { server.close(); }
  });
  it("admin list requires auth and returns subscribers; export is CSV", async () => {
    const { server, base } = buildApp();
    try {
      await postJson(`${base}/api/newsletter/subscribe`, { email: "ok@x.com" });
      expect((await fetch(`${base}/api/admin/newsletter/subscribers`)).status).toBe(200);
      const list = await (await fetch(`${base}/api/admin/newsletter/subscribers`)).json();
      expect(list.total).toBe(1);
      const csvRes = await fetch(`${base}/api/admin/newsletter/subscribers/export`);
      expect(csvRes.headers.get("content-type")).toContain("text/csv");
      expect(await csvRes.text()).toContain("ok@x.com");
    } finally { server.close(); }
  });
  it("admin list is rejected without auth", async () => {
    const { server, base } = buildApp({ authorized: false });
    try { expect((await fetch(`${base}/api/admin/newsletter/subscribers`)).status).toBe(401); } finally { server.close(); }
  });
});
