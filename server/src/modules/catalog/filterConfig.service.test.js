// server/src/modules/catalog/filterConfig.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";
import * as svc from "./filterConfig.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await CollectionFilterConfig.deleteMany({}); });

describe("filterConfig.service", () => {
  it("synthesizes a default (all filterable attributes + price) when none stored", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const a = await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox", sortOrder: 0 });
    await Attribute.create({ name: "Hidden", slug: "hidden", displayType: "checkbox", isFilterable: false });
    const cfg = await svc.getFilterConfig(collectionId);
    expect(cfg.isDefault).toBe(true);
    expect(cfg.filters.map((f) => f.type)).toEqual(["attribute", "price"]);
    expect(String(cfg.filters[0].attributeId)).toBe(String(a.id));
  });

  it("saves then returns the stored config (not default)", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const a = await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox" });
    await svc.saveFilterConfig(collectionId, [
      { type: "attribute", attributeId: a.id, enabled: true, sortOrder: 0 },
      { type: "category", enabled: false, sortOrder: 1 },
    ]);
    const cfg = await svc.getFilterConfig(collectionId);
    expect(cfg.isDefault).toBe(false);
    expect(cfg.filters).toHaveLength(2);
    expect(cfg.filters[1].type).toBe("category");
  });

  it("rejects an attribute entry with no attributeId", async () => {
    await expect(svc.saveFilterConfig(new mongoose.Types.ObjectId(), [{ type: "attribute", sortOrder: 0 }]))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });
});
