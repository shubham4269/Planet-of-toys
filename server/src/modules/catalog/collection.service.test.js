// server/src/modules/catalog/collection.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Collection from "./collection.model.js";
import { Product } from "../../models/index.js";
import * as svc from "./collection.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Collection.deleteMany({}); await Product.deleteMany({}); });

describe("collection.service", () => {
  it("creates with generated slug and validates mode", async () => {
    const c = await svc.createCollection({ name: "New Arrivals" });
    expect(c.slug).toBe("new-arrivals");
    expect(c.mode).toBe("manual");
    await expect(svc.createCollection({ name: "X", mode: "bogus" })).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("lists active sorted, excludes archived by default", async () => {
    await svc.createCollection({ name: "B", sortOrder: 2 });
    await svc.createCollection({ name: "A", sortOrder: 1 });
    const arch = await svc.createCollection({ name: "Z" });
    await svc.archiveCollection(arch.id);
    const list = await svc.listCollections({ includeArchived: false });
    expect(list.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("refuses to archive a collection assigned to a product", async () => {
    const c = await svc.createCollection({ name: "Sale" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, collectionIds: [c.id] });
    await expect(svc.archiveCollection(c.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("returns a public collection by slug or null when archived/inactive", async () => {
    const c = await svc.createCollection({ name: "STEM" });
    expect((await svc.getPublicCollectionBySlug("stem")).name).toBe("STEM");
    await svc.archiveCollection(c.id);
    expect(await svc.getPublicCollectionBySlug("stem")).toBeNull();
  });

  it("returns active assigned products for a collection", async () => {
    const c = await svc.createCollection({ name: "Sale" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, active: true, collectionIds: [c.id] });
    await Product.create({ name: "Q", slug: "q", price: 10, stock: 1, active: false, collectionIds: [c.id] });
    const products = await svc.getCollectionProducts(c.id);
    expect(products.map((p) => p.slug)).toEqual(["p"]);
  });
});
