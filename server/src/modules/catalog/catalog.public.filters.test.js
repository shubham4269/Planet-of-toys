// server/src/modules/catalog/catalog.public.filters.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogPublicRouter } from "./catalog.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await Collection.deleteMany({}); await Attribute.deleteMany({});
  await AttributeValue.deleteMany({}); await Product.deleteMany({});
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", createCatalogPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/catalog` };
}

describe("public filters + products", () => {
  it("returns dynamic filters (default config) for a collection", async () => {
    const { server, base } = buildApp();
    try {
      const col = await Collection.create({ name: "STEM", slug: "stem" });
      const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
      await AttributeValue.create({ attributeId: attr._id, name: "0-12", slug: "0-12" });
      await Product.create({ name: "P", slug: "p", price: 200, stock: 1, active: true, collectionIds: [col._id] });
      const body = await (await fetch(`${base}/collections/stem/filters`)).json();
      const keys = body.filters.map((f) => f.key);
      expect(keys).toContain("f_age");
      expect(keys).toContain("price");
    } finally { server.close(); }
  });

  it("404s filters for an unknown collection", async () => {
    const { server, base } = buildApp();
    try { expect((await fetch(`${base}/collections/nope/filters`)).status).toBe(404); }
    finally { server.close(); }
  });

  it("returns a filtered, paginated product page", async () => {
    const { server, base } = buildApp();
    try {
      const col = await Collection.create({ name: "STEM", slug: "stem" });
      await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, collectionIds: [col._id] });
      await Product.create({ name: "B", slug: "b", price: 800, stock: 1, active: true, collectionIds: [col._id] });
      const body = await (await fetch(`${base}/collections/stem/products?price=0-200&sort=price-asc`)).json();
      expect(body.total).toBe(1);
      expect(body.products[0].slug).toBe("a");
      expect(body).toHaveProperty("pageCount");
    } finally { server.close(); }
  });

  it("404s products for an unknown collection", async () => {
    const { server, base } = buildApp();
    try { expect((await fetch(`${base}/collections/nope/products`)).status).toBe(404); }
    finally { server.close(); }
  });
});
