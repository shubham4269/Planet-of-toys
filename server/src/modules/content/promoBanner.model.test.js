import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import PromoBanner from "./promoBanner.model.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PromoBanner.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await PromoBanner.deleteMany({});
});

describe("PromoBanner model", () => {
  it("applies banner-level defaults", async () => {
    const doc = await PromoBanner.create({ singleton: "promoBanner" });
    expect(doc.enabled).toBe(false);
    expect(doc.bgColor).toBe("#E11B22");
    expect(doc.textColor).toBe("#FFFFFF");
    expect(doc.rotationIntervalMs).toBe(5000);
    expect(doc.announcements).toEqual([]);
  });

  it("applies announcement defaults and serializes id/announcement ids", async () => {
    const doc = await PromoBanner.create({
      singleton: "promoBanner",
      announcements: [{ text: "Free shipping" }],
    });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.singleton).toBeUndefined();
    expect(json.announcements[0].id).toBeDefined();
    expect(json.announcements[0]._id).toBeUndefined();
    expect(json.announcements[0].showOnMobile).toBe(true);
    expect(json.announcements[0].showOnDesktop).toBe(true);
    expect(json.announcements[0].enabled).toBe(true);
  });

  it("enforces a single document via the unique singleton key", async () => {
    await PromoBanner.create({ singleton: "promoBanner" });
    await expect(PromoBanner.create({ singleton: "promoBanner" })).rejects.toThrow();
  });
});
