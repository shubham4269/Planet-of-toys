// server/src/modules/catalog/catalog.admin.filterconfig.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogAdminRouter } from "./catalog.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Attribute from "./attribute.model.js";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await CollectionFilterConfig.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => { req.admin = { id: "a" }; next(); };
  app.use("/api/admin/catalog", createCatalogAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/catalog` };
}
const put = (url, body) => fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("admin filter-config routes", () => {
  it("GET synthesizes a default config when none stored", async () => {
    const { server, base } = buildApp();
    try {
      await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
      const id = new mongoose.Types.ObjectId().toString();
      const body = await (await fetch(`${base}/collections/${id}/filter-config`)).json();
      expect(body.config.isDefault).toBe(true);
      expect(body.config.filters.some((f) => f.type === "price")).toBe(true);
    } finally { server.close(); }
  });

  it("PUT saves a config and GET returns it", async () => {
    const { server, base } = buildApp();
    try {
      const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
      const id = new mongoose.Types.ObjectId().toString();
      await put(`${base}/collections/${id}/filter-config`, { filters: [{ type: "attribute", attributeId: attr.id, enabled: true, sortOrder: 0 }] });
      const body = await (await fetch(`${base}/collections/${id}/filter-config`)).json();
      expect(body.config.isDefault).toBe(false);
      expect(body.config.filters).toHaveLength(1);
    } finally { server.close(); }
  });

  it("PUT returns 400 for an attribute entry missing attributeId", async () => {
    const { server, base } = buildApp();
    try {
      const id = new mongoose.Types.ObjectId().toString();
      const r = await put(`${base}/collections/${id}/filter-config`, { filters: [{ type: "attribute", sortOrder: 0 }] });
      expect(r.status).toBe(400);
    } finally { server.close(); }
  });
});
