// server/src/modules/products/product.merchandising.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Product from "./product.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("Product merchandising fields", () => {
  it("defaults salesCount=0, isFeatured=false, merchandisingRank=0", async () => {
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1 })).toJSON();
    expect(json.salesCount).toBe(0);
    expect(json.isFeatured).toBe(false);
    expect(json.merchandisingRank).toBe(0);
  });

  it("persists provided merchandising values", async () => {
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1, salesCount: 5, isFeatured: true, merchandisingRank: 3 })).toJSON();
    expect(json.salesCount).toBe(5);
    expect(json.isFeatured).toBe(true);
    expect(json.merchandisingRank).toBe(3);
  });
});
