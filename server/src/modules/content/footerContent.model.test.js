import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import FooterContent from "./footerContent.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await FooterContent.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await FooterContent.deleteMany({}); });

describe("FooterContent model", () => {
  it("applies defaults", async () => {
    const doc = await FooterContent.create({ singleton: "footer" });
    expect(doc.enabled).toBe(true);
    expect(doc.newsletter.placeholder).toBe("Enter your email");
    expect(doc.columns).toEqual([]);
  });

  it("maps _id->id on doc and nested subdocs and strips singleton/__v", async () => {
    const doc = await FooterContent.create({
      singleton: "footer",
      columns: [{ title: "Shop", links: [{ label: "Sale", url: "/sale" }] }],
      social: [{ platform: "facebook", url: "https://fb.com/x" }],
    });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.singleton).toBeUndefined();
    expect(json.columns[0].id).toBeDefined();
    expect(json.columns[0]._id).toBeUndefined();
    expect(json.columns[0].links[0].id).toBeDefined();
    expect(json.columns[0].links[0]._id).toBeUndefined();
    expect(json.social[0].id).toBeDefined();
  });

  it("enforces a single document", async () => {
    await FooterContent.create({ singleton: "footer" });
    await expect(FooterContent.create({ singleton: "footer" })).rejects.toThrow();
  });
});
