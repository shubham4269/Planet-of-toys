// server/src/modules/hero/hero.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import HeroSlide from "./heroSlide.model.js";
import { Product, Collection, Category } from "../../models/index.js";
import * as svc from "./hero.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await HeroSlide.deleteMany({}); await Product.deleteMany({});
  await Collection.deleteMany({}); await Category.deleteMany({});
});

describe("hero.service", () => {
  it("creates a slide and validates enums", async () => {
    const s = await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Sale" });
    expect(s.id).toBeDefined();
    await expect(svc.createSlide({ type: "campaign", displayMode: "nope" })).rejects.toBeInstanceOf(svc.HeroValidationError);
  });

  it("public slides exclude draft, inactive, soft-deleted, and out-of-window", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 86400000);
    const future = new Date(now.getTime() + 86400000);
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Published", status: "published" });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Draft", status: "draft" });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Inactive", status: "published", active: false });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Expired", status: "published", startDate: past, endDate: past });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Future", status: "published", startDate: future });
    const slides = await svc.getPublicSlides(now);
    expect(slides.map((s) => s.title)).toEqual(["Published"]);
  });

  it("orders by priority desc then sortOrder asc", async () => {
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Low", status: "published", priority: 20 });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "High", status: "published", priority: 100 });
    const slides = await svc.getPublicSlides();
    expect(slides.map((s) => s.title)).toEqual(["High", "Low"]);
  });

  it("resolves ctaHref from the linked entity", async () => {
    const col = await Collection.create({ name: "STEM", slug: "stem" });
    await svc.createSlide({ type: "collection", displayMode: "full_banner", title: "C", status: "published", ctaType: "collection", collectionId: col._id });
    const [slide] = await svc.getPublicSlides();
    expect(slide.ctaHref).toBe("/collections/stem");
  });

  it("collection_grid uses manual gridProductIds when set, else derives from the collection", async () => {
    const col = await Collection.create({ name: "STEM", slug: "stem" });
    const p1 = await Product.create({ name: "A", slug: "a", price: 10, stock: 1, active: true, collectionIds: [col._id] });
    const p2 = await Product.create({ name: "B", slug: "b", price: 20, stock: 1, active: true, collectionIds: [col._id] });
    await svc.createSlide({ type: "collection", displayMode: "collection_grid", title: "Manual", status: "published", collectionId: col._id, gridProductIds: [p2._id] });
    await svc.createSlide({ type: "collection", displayMode: "collection_grid", title: "Derived", status: "published", collectionId: col._id, priority: -1 });
    const slides = await svc.getPublicSlides();
    const manual = slides.find((s) => s.title === "Manual");
    const derived = slides.find((s) => s.title === "Derived");
    expect(manual.gridItems.map((g) => g.slug)).toEqual(["b"]);
    expect(derived.gridItems.map((g) => g.slug).sort()).toEqual(["a", "b"]);
    expect(p1).toBeTruthy();
  });

  it("soft-deletes, restores, and toggles active", async () => {
    const s = await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "X", status: "published" });
    await svc.softDelete(s.id);
    expect(await svc.listSlides({ includeDeleted: false })).toHaveLength(0);
    expect(await svc.listSlides({ includeDeleted: true })).toHaveLength(1);
    await svc.restore(s.id);
    expect(await svc.listSlides({ includeDeleted: false })).toHaveLength(1);
    await svc.setActive(s.id, false);
    expect((await svc.getSlideById(s.id)).active).toBe(false);
  });
});
