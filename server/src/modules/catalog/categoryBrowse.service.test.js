// server/src/modules/catalog/categoryBrowse.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { resolveCategoryFilters, queryCategoryProducts } from "./categoryBrowse.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

describe("category browse", () => {
  it("returns default filters (attributes + price) for a category", async () => {
    const cat = await Category.create({ name: "Blocks", slug: "blocks" });
    await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
    await Product.create({ name: "P", slug: "p", price: 300, stock: 1, active: true, categoryIds: [cat._id] });
    const defs = await resolveCategoryFilters("blocks");
    expect(defs.map((d) => d.type)).toEqual(["attribute", "price"]);
  });

  it("queries a category's active products", async () => {
    const cat = await Category.create({ name: "Blocks", slug: "blocks" });
    await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, categoryIds: [cat._id] });
    await Product.create({ name: "B", slug: "b", price: 200, stock: 1, active: false, categoryIds: [cat._id] });
    const res = await queryCategoryProducts("blocks", { sort: "price-asc" });
    expect(res.products.map((p) => p.slug)).toEqual(["a"]);
  });

  it("returns null for an unknown/archived category", async () => {
    expect(await resolveCategoryFilters("nope")).toBeNull();
    expect(await queryCategoryProducts("nope", {})).toBeNull();
  });
});
