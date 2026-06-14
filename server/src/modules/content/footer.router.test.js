import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentAdminRouter } from "./content.admin.router.js";
import { createContentPublicRouter } from "./content.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import FooterContent from "./footerContent.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await FooterContent.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Authentication is required." } });
    req.admin = { id: "admin-1" }; next();
  };
  app.use("/api/admin/content", createContentAdminRouter({ requireAuth }));
  app.use("/api/content", createContentPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return { server, adminUrl: `${base}/api/admin/content/footer`, publicUrl: `${base}/api/content/footer` };
}
const putJson = (url, body) => fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("footer routers", () => {
  it("rejects unauthenticated admin footer reads", async () => {
    const { server, adminUrl } = buildApp({ authorized: false });
    try { expect((await fetch(adminUrl)).status).toBe(401); } finally { server.close(); }
  });
  it("admin can read then update; public reflects enabled state", async () => {
    const { server, adminUrl, publicUrl } = buildApp();
    try {
      expect((await fetch(adminUrl)).status).toBe(200);
      const upd = await putJson(adminUrl, { enabled: true, columns: [{ title: "Shop", links: [{ label: "Sale", url: "/sale" }] }] });
      expect(upd.status).toBe(200);
      const pub = await (await fetch(publicUrl)).json();
      expect(pub.footer.enabled).toBe(true);
      expect(pub.footer.columns[0].links[0].url).toBe("/sale");
    } finally { server.close(); }
  });
});
