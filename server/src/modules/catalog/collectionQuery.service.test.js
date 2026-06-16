// server/src/modules/catalog/collectionQuery.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { queryCollectionProducts, SORT_SPECS } from "./collectionQuery.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await Collection.deleteMany({}); await Attribute.deleteMany({});
  await AttributeValue.deleteMany({}); await Product.deleteMany({});
});

async function seed() {
  const col = await Collection.create({ name: "STEM", slug: "stem" });
  const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
  const v1 = await AttributeValue.create({ attributeId: attr._id, name: "0-12", slug: "0-12" });
  const v2 = await AttributeValue.create({ attributeId: attr._id, name: "1-2", slug: "1-2" });
  await Product.create({ name: "Cheap", slug: "cheap", price: 100, stock: 1, active: true, collectionIds: [col._id], attributeValueIds: [v1._id] });
  await Product.create({ name: "Mid", slug: "mid", price: 500, stock: 1, active: true, collectionIds: [col._id], attributeValueIds: [v2._id] });
  await Product.create({ name: "Pricey", slug: "pricey", price: 900, stock: 1, active: true, collectionIds: [col._id], attributeValueIds: [v1._id] });
  await Product.create({ name: "Other", slug: "other", price: 50, stock: 1, active: true }); // not in collection
  return { col };
}

describe("queryCollectionProducts", () => {
  it("returns null for an unknown/archived collection slug", async () => {
    expect(await queryCollectionProducts("nope", {})).toBeNull();
  });

  it("returns the collection's active products, default featured sort", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", {});
    expect(res.total).toBe(3);
    expect(res.products.map((p) => p.slug).sort()).toEqual(["cheap", "mid", "pricey"]);
  });

  it("filters by attribute value slug (OR within attribute)", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", { "f_age": "0-12" });
    expect(res.products.map((p) => p.slug).sort()).toEqual(["cheap", "pricey"]);
  });

  it("filters by price range and sorts price-asc", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", { price: "100-500", sort: "price-asc" });
    expect(res.products.map((p) => p.slug)).toEqual(["cheap", "mid"]);
  });

  it("paginates with totals", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", { sort: "price-asc", page: "2", limit: "2" });
    expect(res).toMatchObject({ page: 2, limit: 2, total: 3, pageCount: 2 });
    expect(res.products.map((p) => p.slug)).toEqual(["pricey"]);
  });

  it("exposes a SORT_SPECS map", () => {
    expect(Object.keys(SORT_SPECS)).toEqual(
      expect.arrayContaining(["featured", "newest", "price-asc", "price-desc", "name", "best-selling"])
    );
  });
});
