// server/src/modules/catalog/filterResolver.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import * as cfg from "./filterConfig.service.js";
import { resolveFilters } from "./filterResolver.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await Attribute.deleteMany({}); await AttributeValue.deleteMany({});
  await Category.deleteMany({}); await Product.deleteMany({});
});

describe("resolveFilters", () => {
  it("resolves attribute + price definitions (default config)", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const attr = await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox" });
    await AttributeValue.create({ attributeId: attr._id, name: "0-12 Months", slug: "0-12-months" });
    await Product.create({ name: "P", slug: "p", price: 300, stock: 1, active: true, collectionIds: [collectionId] });
    await Product.create({ name: "Q", slug: "q", price: 900, stock: 1, active: true, collectionIds: [collectionId] });
    const defs = await resolveFilters(collectionId);
    const age = defs.find((d) => d.type === "attribute");
    expect(age.key).toBe("f_age-group");
    expect(age.displayType).toBe("checkbox");
    expect(age.values.map((v) => v.slug)).toEqual(["0-12-months"]);
    const price = defs.find((d) => d.type === "price");
    expect(price).toMatchObject({ key: "price", type: "price", min: 300, max: 900 });
  });

  it("includes a category definition when configured, with options from the collection's products", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const cat = await Category.create({ name: "Blocks", slug: "blocks" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, active: true, collectionIds: [collectionId], categoryIds: [cat._id] });
    await cfg.saveFilterConfig(collectionId, [{ type: "category", enabled: true, sortOrder: 0 }]);
    const defs = await resolveFilters(collectionId);
    const category = defs.find((d) => d.type === "category");
    expect(category.options.map((o) => o.slug)).toEqual(["blocks"]);
  });

  it("omits disabled entries", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    await cfg.saveFilterConfig(collectionId, [{ type: "price", enabled: false, sortOrder: 0 }]);
    const defs = await resolveFilters(collectionId);
    expect(defs).toHaveLength(0);
  });
});
