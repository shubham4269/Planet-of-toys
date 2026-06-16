// server/src/modules/catalog/catalog.public.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogPublicRouter } from "./catalog.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import * as collectionSvc from "./collection.service.js";
import * as attributeSvc from "./attribute.service.js";
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Collection.deleteMany({}); await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", createCatalogPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/catalog` };
}

describe("catalog public router", () => {
  it("returns a collection with its active products by slug", async () => {
    const { server, base } = buildApp();
    try {
      const c = await collectionSvc.createCollection({ name: "Sale" });
      await Product.create({ name: "P", slug: "p", price: 10, stock: 1, active: true, collectionIds: [c.id] });
      const body = await (await fetch(`${base}/collections/sale`)).json();
      expect(body.collection.name).toBe("Sale");
      expect(body.products).toHaveLength(1);
    } finally { server.close(); }
  });

  it("404s for an archived collection slug", async () => {
    const { server, base } = buildApp();
    try {
      const c = await collectionSvc.createCollection({ name: "Old" });
      await collectionSvc.archiveCollection(c.id);
      const r = await fetch(`${base}/collections/old`);
      expect(r.status).toBe(404);
    } finally { server.close(); }
  });

  it("exposes only filterable active attributes", async () => {
    const { server, base } = buildApp();
    try {
      const a = await attributeSvc.createAttribute({ name: "Age Group", displayType: "checkbox" });
      await attributeSvc.addValue(a.id, { name: "0-12 Months" });
      await attributeSvc.createAttribute({ name: "Hidden", displayType: "checkbox", isFilterable: false });
      const body = await (await fetch(`${base}/attributes`)).json();
      expect(body.attributes).toHaveLength(1);
      expect(body.attributes[0].values).toHaveLength(1);
    } finally { server.close(); }
  });
});
