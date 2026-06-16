// server/src/modules/catalog/category.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import * as svc from "./category.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); await Product.deleteMany({}); });

describe("category.service", () => {
  it("creates with a generated unique slug", async () => {
    const a = await svc.createCategory({ name: "Educational Toys" });
    expect(a.slug).toBe("educational-toys");
    const b = await svc.createCategory({ name: "Educational Toys" });
    expect(b.slug).toBe("educational-toys-2");
  });

  it("builds an active tree (children nested, archived excluded)", async () => {
    const parent = await svc.createCategory({ name: "Toys" });
    await svc.createCategory({ name: "Blocks", parentId: parent.id });
    const archived = await svc.createCategory({ name: "Old" });
    await svc.archiveCategory(archived.id);
    const tree = await svc.listCategoryTree({ includeArchived: false });
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Toys");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("Blocks");
  });

  it("refuses to archive a category that has children", async () => {
    const parent = await svc.createCategory({ name: "Toys" });
    await svc.createCategory({ name: "Blocks", parentId: parent.id });
    await expect(svc.archiveCategory(parent.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("refuses to archive a category assigned to a product", async () => {
    const c = await svc.createCategory({ name: "Toys" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, categoryIds: [c.id] });
    await expect(svc.archiveCategory(c.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("archives then restores a leaf category", async () => {
    const c = await svc.createCategory({ name: "Toys" });
    await svc.archiveCategory(c.id);
    expect((await svc.listCategoryTree({ includeArchived: false }))).toHaveLength(0);
    await svc.restoreCategory(c.id);
    expect((await svc.listCategoryTree({ includeArchived: false }))).toHaveLength(1);
  });

  it("reorders and reparents", async () => {
    const a = await svc.createCategory({ name: "A" });
    const b = await svc.createCategory({ name: "B" });
    await svc.reorderCategories([
      { id: b.id, parentId: null, sortOrder: 0 },
      { id: a.id, parentId: b.id, sortOrder: 0 },
    ]);
    const tree = await svc.listCategoryTree({ includeArchived: false });
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("B");
    expect(tree[0].children[0].name).toBe("A");
  });
});
