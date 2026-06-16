// server/src/modules/catalog/attributeValue.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import AttributeValue from "./attributeValue.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await AttributeValue.deleteMany({}); });

describe("AttributeValue model", () => {
  it("requires attributeId and applies defaults", async () => {
    const attributeId = new mongoose.Types.ObjectId();
    const json = (await AttributeValue.create({ attributeId, name: "0-12 Months", slug: "0-12-months" })).toJSON();
    expect(json.id).toBeDefined();
    expect(String(json.attributeId)).toBe(String(attributeId));
    expect(json.swatchHex).toBeNull();
    expect(json.isActive).toBe(true);
    expect(json.deletedAt).toBeNull();
  });

  it("enforces unique (attributeId, slug) but allows same slug under different attributes", async () => {
    await AttributeValue.syncIndexes();
    const a1 = new mongoose.Types.ObjectId();
    const a2 = new mongoose.Types.ObjectId();
    await AttributeValue.create({ attributeId: a1, name: "Red", slug: "red" });
    await expect(AttributeValue.create({ attributeId: a1, name: "Red", slug: "red" })).rejects.toThrow();
    await expect(AttributeValue.create({ attributeId: a2, name: "Red", slug: "red" })).resolves.toBeTruthy();
  });
});
