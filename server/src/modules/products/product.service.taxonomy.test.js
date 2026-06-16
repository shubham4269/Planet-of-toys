// server/src/modules/products/product.service.taxonomy.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Product } from "../../models/index.js";
import * as svc from "./product.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("product.service taxonomy fields", () => {
  it("accepts taxonomy ids on create and returns them in the public projection", async () => {
    const cid = new mongoose.Types.ObjectId();
    const created = await svc.createProduct({ name: "Blocks", price: 100, stock: 5, categoryIds: [cid] });
    expect(created.categoryIds.map(String)).toEqual([String(cid)]);
    const pub = await svc.getActiveProductBySlug(created.slug);
    expect(pub.categoryIds.map(String)).toEqual([String(cid)]);
  });

  it("updates collection and attribute-value references", async () => {
    const created = await svc.createProduct({ name: "Blocks", price: 100, stock: 5 });
    const vid = new mongoose.Types.ObjectId();
    const updated = await svc.updateProduct(created.id, { attributeValueIds: [vid] });
    expect(updated.attributeValueIds.map(String)).toEqual([String(vid)]);
  });
});
