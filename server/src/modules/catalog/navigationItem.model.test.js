// server/src/modules/catalog/navigationItem.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NavigationItem from "./navigationItem.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); });

describe("NavigationItem model", () => {
  it("applies defaults and maps id", async () => {
    const json = (await NavigationItem.create({ label: "New Arrivals", targetType: "collection" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.menu).toBe("header");
    expect(json.url).toBe("");
    expect(json.openInNewTab).toBe(false);
    expect(json.isActive).toBe(true);
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid targetType", async () => {
    await expect(NavigationItem.create({ label: "X", targetType: "bogus" })).rejects.toThrow();
  });
});
