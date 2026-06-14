import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createNewsletterService, NewsletterValidationError } from "./newsletter.service.js";
import NewsletterSubscriber from "./subscriber.model.js";

let mongod; const service = createNewsletterService();
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await NewsletterSubscriber.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NewsletterSubscriber.deleteMany({}); });

describe("newsletter service", () => {
  it("rejects an invalid email", async () => {
    await expect(service.subscribe({ email: "nope" })).rejects.toBeInstanceOf(NewsletterValidationError);
  });
  it("normalizes and stores; dedup is idempotent", async () => {
    const a = await service.subscribe({ email: "  USER@Example.com ", ipAddress: "1.1.1.1", userAgent: "ua" });
    expect(a.email).toBe("user@example.com");
    expect(a.already).toBe(false);
    const b = await service.subscribe({ email: "user@example.com" });
    expect(b.already).toBe(true);
    expect(await NewsletterSubscriber.countDocuments()).toBe(1);
  });
  it("re-subscribes a previously unsubscribed email", async () => {
    const a = await service.subscribe({ email: "x@y.com" });
    await service.unsubscribe(a.id);
    const c = await service.subscribe({ email: "x@y.com" });
    expect(c.already).toBe(false);
    const doc = await NewsletterSubscriber.findById(a.id);
    expect(doc.status).toBe("subscribed");
  });
  it("lists with search + pagination and exports CSV", async () => {
    await service.subscribe({ email: "alpha@x.com" });
    await service.subscribe({ email: "beta@x.com" });
    const list = await service.listSubscribers({ search: "alpha", page: 1, limit: 10 });
    expect(list.total).toBe(1);
    expect(list.subscribers[0].email).toBe("alpha@x.com");
    const csv = await service.exportCsv({});
    expect(csv).toContain("email,status,source");
    expect(csv).toContain("beta@x.com");
  });
});
