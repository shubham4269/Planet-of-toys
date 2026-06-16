// server/src/modules/catalog/collection.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Collection from "./collection.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Collection.deleteMany({}); });

describe("Collection model", () => {
  it("applies defaults incl. mode=manual and merchandising flags", async () => {
    const json = (await Collection.create({ name: "STEM Toys", slug: "stem-toys" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.mode).toBe("manual");
    expect(json.featuredOnHome).toBe(false);
    expect(json.showInNavigation).toBe(false);
    expect(json.navigationLabel).toBe("");
    expect(json.navigationOrder).toBe(0);
    expect(json.isActive).toBe(true);
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid mode", async () => {
    await expect(Collection.create({ name: "X", slug: "x", mode: "bogus" })).rejects.toThrow();
  });
});
