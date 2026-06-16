// server/src/modules/catalog/attribute.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); });

describe("Attribute model", () => {
  it("defaults displayType usable and flags set", async () => {
    const json = (await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json.isFilterable).toBe(true);
    expect(json.isActive).toBe(true);
    expect(json.sortOrder).toBe(0);
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid displayType", async () => {
    await expect(Attribute.create({ name: "X", slug: "x", displayType: "bogus" })).rejects.toThrow();
  });
});
