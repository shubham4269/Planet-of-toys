// server/src/modules/catalog/collectionFilterConfig.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await CollectionFilterConfig.deleteMany({}); });

describe("CollectionFilterConfig model", () => {
  it("stores filters and maps ids; defaults enabled true", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const attributeId = new mongoose.Types.ObjectId();
    const doc = await CollectionFilterConfig.create({
      collectionId,
      filters: [{ type: "attribute", attributeId, sortOrder: 0 }, { type: "price", sortOrder: 1 }],
    });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.filters[0].enabled).toBe(true);
    expect(json.filters[0].type).toBe("attribute");
    expect(String(json.filters[0].attributeId)).toBe(String(attributeId));
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid filter type", async () => {
    await expect(CollectionFilterConfig.create({
      collectionId: new mongoose.Types.ObjectId(),
      filters: [{ type: "bogus" }],
    })).rejects.toThrow();
  });

  it("enforces one config per collection", async () => {
    await CollectionFilterConfig.syncIndexes();
    const collectionId = new mongoose.Types.ObjectId();
    await CollectionFilterConfig.create({ collectionId, filters: [] });
    await expect(CollectionFilterConfig.create({ collectionId, filters: [] })).rejects.toThrow();
  });
});
