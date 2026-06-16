// server/src/modules/catalog/browseScope.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { resolveFiltersForScope } from "./filterResolver.service.js";
import { queryProductsForScope } from "./collectionQuery.service.js";
import { defaultFilterConfig } from "./filterConfig.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

describe("browse scope (category)", () => {
  it("resolves filters over a categoryIds scope", async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
    await AttributeValue.create({ attributeId: attr._id, name: "0-12", slug: "0-12" });
    await Product.create({ name: "P", slug: "p", price: 250, stock: 1, active: true, categoryIds: [categoryId] });
    const defs = await resolveFiltersForScope({ field: "categoryIds", id: categoryId }, await defaultFilterConfig());
    expect(defs.find((d) => d.type === "attribute").key).toBe("f_age");
    expect(defs.find((d) => d.type === "price")).toMatchObject({ min: 250, max: 250 });
  });

  it("queries products over a categoryIds scope with sort + paging", async () => {
    const categoryId = new mongoose.Types.ObjectId();
    await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, categoryIds: [categoryId] });
    await Product.create({ name: "B", slug: "b", price: 900, stock: 1, active: true, categoryIds: [categoryId] });
    await Product.create({ name: "Other", slug: "o", price: 5, stock: 1, active: true });
    const res = await queryProductsForScope({ field: "categoryIds", id: categoryId }, { sort: "price-asc" });
    expect(res.total).toBe(2);
    expect(res.products.map((p) => p.slug)).toEqual(["a", "b"]);
  });
});
