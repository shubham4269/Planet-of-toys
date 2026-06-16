// server/src/modules/catalog/productAssign.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Product } from "../../models/index.js";
import { bulkAssign } from "./productAssign.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("bulkAssign", () => {
  it("adds ids to many products without duplicating (addToSet)", async () => {
    const p1 = await Product.create({ name: "A", slug: "a", price: 1, stock: 1 });
    const p2 = await Product.create({ name: "B", slug: "b", price: 1, stock: 1 });
    const cid = new mongoose.Types.ObjectId();
    const res = await bulkAssign({ productIds: [p1.id, p2.id], add: { categoryIds: [cid] } });
    expect(res.matched).toBe(2);
    await bulkAssign({ productIds: [p1.id], add: { categoryIds: [cid] } }); // idempotent
    const reloaded = await Product.findById(p1.id);
    expect(reloaded.categoryIds.map(String)).toEqual([String(cid)]);
  });

  it("removes ids with pull", async () => {
    const cid = new mongoose.Types.ObjectId();
    const p = await Product.create({ name: "A", slug: "a", price: 1, stock: 1, categoryIds: [cid] });
    await bulkAssign({ productIds: [p.id], remove: { categoryIds: [cid] } });
    const reloaded = await Product.findById(p.id);
    expect(reloaded.categoryIds).toHaveLength(0);
  });

  it("rejects an empty productIds list", async () => {
    await expect(bulkAssign({ productIds: [], add: { categoryIds: [] } }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });
});
