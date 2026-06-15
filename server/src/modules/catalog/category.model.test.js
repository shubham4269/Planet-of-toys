// server/src/modules/catalog/category.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); });

describe("Category model", () => {
  it("applies defaults and maps _id to id in toJSON", async () => {
    const doc = await Category.create({ name: "Educational Toys", slug: "educational-toys" });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.parentId).toBeNull();
    expect(json.isActive).toBe(true);
    expect(json.sortOrder).toBe(0);
    expect(json.deletedAt).toBeNull();
    expect(json.image).toBeNull();
    expect(json.heroImage).toBeNull();
  });

  it("enforces a unique slug", async () => {
    await Category.syncIndexes();
    await Category.create({ name: "A", slug: "dup" });
    await expect(Category.create({ name: "B", slug: "dup" })).rejects.toThrow();
  });
});
