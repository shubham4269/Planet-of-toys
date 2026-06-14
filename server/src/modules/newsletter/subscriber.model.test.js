import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NewsletterSubscriber from "./subscriber.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await NewsletterSubscriber.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NewsletterSubscriber.deleteMany({}); });

describe("NewsletterSubscriber model", () => {
  it("defaults status/source and exposes id (no _id/__v)", async () => {
    const doc = await NewsletterSubscriber.create({ email: "a@b.com" });
    const json = doc.toJSON();
    expect(json.status).toBe("subscribed");
    expect(json.source).toBe("footer");
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
  });
  it("enforces unique email", async () => {
    await NewsletterSubscriber.create({ email: "dup@b.com" });
    await expect(NewsletterSubscriber.create({ email: "dup@b.com" })).rejects.toThrow();
  });
});
