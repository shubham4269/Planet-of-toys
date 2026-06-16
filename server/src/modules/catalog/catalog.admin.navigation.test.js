// server/src/modules/catalog/catalog.admin.navigation.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogAdminRouter } from "./catalog.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import NavigationItem from "./navigationItem.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => { req.admin = { id: "a" }; next(); };
  app.use("/api/admin/catalog", createCatalogAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/catalog` };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("admin navigation routes", () => {
  it("creates, lists, and archives a navigation item", async () => {
    const { server, base } = buildApp();
    try {
      const created = await (await post(`${base}/navigation`, { label: "Sale", targetType: "internalRoute", url: "/sale" })).json();
      expect(created.item.label).toBe("Sale");
      const list = await (await fetch(`${base}/navigation`)).json();
      expect(list.items).toHaveLength(1);
      const arch = await post(`${base}/navigation/${created.item.id}/archive`, {});
      expect(arch.status).toBe(200);
      const after = await (await fetch(`${base}/navigation`)).json();
      expect(after.items).toHaveLength(0);
    } finally { server.close(); }
  });

  it("rejects a collection item with a raw url (400)", async () => {
    const { server, base } = buildApp();
    try {
      const r = await post(`${base}/navigation`, { label: "Bad", targetType: "collection", targetId: new mongoose.Types.ObjectId().toString(), url: "/collections/x" });
      expect(r.status).toBe(400);
    } finally { server.close(); }
  });
});
