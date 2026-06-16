// server/src/modules/catalog/catalog.slug.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); });

describe("slugify", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("Éducational Toys! 0-12")).toBe("educational-toys-0-12");
  });
  it("falls back to 'item' for empty input", () => {
    expect(slugify("!!!")).toBe("item");
  });
});

describe("uniqueSlug", () => {
  it("appends -2, -3 on collision within the model", async () => {
    await Category.create({ name: "Toys", slug: "toys" });
    expect(await uniqueSlug(Category, "toys")).toBe("toys-2");
    await Category.create({ name: "Toys2", slug: "toys-2" });
    expect(await uniqueSlug(Category, "toys")).toBe("toys-3");
  });
  it("ignores the excluded id (so updates keep their slug)", async () => {
    const c = await Category.create({ name: "Toys", slug: "toys" });
    expect(await uniqueSlug(Category, "toys", c._id)).toBe("toys");
  });
});
