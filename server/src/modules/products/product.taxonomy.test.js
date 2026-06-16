// server/src/modules/products/product.taxonomy.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Product from "./product.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("Product taxonomy references", () => {
  it("defaults the three reference arrays to empty", async () => {
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1 })).toJSON();
    expect(json.categoryIds).toEqual([]);
    expect(json.collectionIds).toEqual([]);
    expect(json.attributeValueIds).toEqual([]);
  });

  it("persists provided reference ids", async () => {
    const cid = new mongoose.Types.ObjectId();
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1, categoryIds: [cid] })).toJSON();
    expect(String(json.categoryIds[0])).toBe(String(cid));
  });
});
