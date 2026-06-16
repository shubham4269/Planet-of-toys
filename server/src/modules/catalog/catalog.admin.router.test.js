// server/src/modules/catalog/catalog.admin.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogAdminRouter } from "./catalog.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Category from "./category.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Auth required", status: 401 } });
    req.admin = { id: "admin-1" }; next();
  };
  app.use("/api/admin/catalog", createCatalogAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/catalog` };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("catalog admin router", () => {
  it("rejects unauthenticated requests", async () => {
    const { server, base } = buildApp({ authorized: false });
    try { const r = await fetch(`${base}/categories`); expect(r.status).toBe(401); }
    finally { server.close(); }
  });

  it("creates and lists a category", async () => {
    const { server, base } = buildApp();
    try {
      const created = await (await post(`${base}/categories`, { name: "Toys" })).json();
      expect(created.category.slug).toBe("toys");
      const list = await (await fetch(`${base}/categories`)).json();
      expect(list.categories).toHaveLength(1);
    } finally { server.close(); }
  });

  it("creates an attribute and a value inline", async () => {
    const { server, base } = buildApp();
    try {
      const attr = (await (await post(`${base}/attributes`, { name: "Age Group", displayType: "checkbox" })).json()).attribute;
      const r = await post(`${base}/attributes/${attr.id}/values`, { name: "0-12 Months" });
      expect(r.status).toBe(201);
      const list = await (await fetch(`${base}/attributes`)).json();
      expect(list.attributes[0].values).toHaveLength(1);
    } finally { server.close(); }
  });

  it("returns 400 with a client-safe message when archiving a category with children", async () => {
    const { server, base } = buildApp();
    try {
      const parent = (await (await post(`${base}/categories`, { name: "Toys" })).json()).category;
      await post(`${base}/categories`, { name: "Blocks", parentId: parent.id });
      const r = await post(`${base}/categories/${parent.id}/archive`, {});
      expect(r.status).toBe(400);
      const body = await r.json();
      expect(body.error.message).toMatch(/child categories/i);
    } finally { server.close(); }
  });
});
