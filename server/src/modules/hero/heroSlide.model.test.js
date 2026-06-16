// server/src/modules/hero/heroSlide.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import HeroSlide from "./heroSlide.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await HeroSlide.deleteMany({}); });

describe("HeroSlide model", () => {
  it("applies defaults and maps _id to id", async () => {
    const json = (await HeroSlide.create({ type: "campaign", displayMode: "full_banner", title: "Summer Sale" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.status).toBe("draft");
    expect(json.active).toBe(true);
    expect(json.deletedAt).toBeNull();
    expect(json.ctaType).toBe("none");
    expect(json.priority).toBe(0);
    expect(json.sortOrder).toBe(0);
    expect(json.impressions).toBe(0);
    expect(json.clicks).toBe(0);
    expect(json.gridProductIds).toEqual([]);
  });

  it("rejects invalid type / displayMode / status", async () => {
    await expect(HeroSlide.create({ type: "bogus", displayMode: "full_banner" })).rejects.toThrow();
    await expect(HeroSlide.create({ type: "campaign", displayMode: "bogus" })).rejects.toThrow();
    await expect(HeroSlide.create({ type: "campaign", displayMode: "full_banner", status: "bogus" })).rejects.toThrow();
  });
});
