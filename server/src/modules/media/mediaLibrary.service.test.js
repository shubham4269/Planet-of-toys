// server/src/modules/media/mediaLibrary.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Product from "../products/product.model.js";
import Category from "../catalog/category.model.js";
import Collection from "../catalog/collection.model.js";
import NavigationItem from "../catalog/navigationItem.model.js";
import HeroSlide from "../hero/heroSlide.model.js";
import {
  toBasename,
  classifyKind,
  humanSize,
  MediaLibraryError,
  createMediaLibraryService,
} from "./mediaLibrary.service.js";

describe("mediaLibrary pure helpers", () => {
  it("toBasename normalizes urls, slashes, backslashes, and trims", () => {
    expect(toBasename("/api/media/abc.webp")).toBe("abc.webp");
    expect(toBasename("https://cdn.example.com/x/y/z.mp4")).toBe("z.mp4");
    expect(toBasename("folder\\nested\\v.mov")).toBe("v.mov");
    expect(toBasename("  plain.png  ")).toBe("plain.png");
    expect(toBasename("")).toBe(null);
    expect(toBasename(null)).toBe(null);
    expect(toBasename(123)).toBe(null);
  });

  it("classifyKind maps extensions to image/video/other", () => {
    expect(classifyKind("a.webp")).toBe("image");
    expect(classifyKind("a.JPG")).toBe("image");
    expect(classifyKind("a.png")).toBe("image");
    expect(classifyKind("a.mp4")).toBe("video");
    expect(classifyKind("a.WEBM")).toBe("video");
    expect(classifyKind("a.mov")).toBe("video");
    expect(classifyKind("a.txt")).toBe("other");
  });

  it("humanSize renders bytes/KB/MB", () => {
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(900)).toBe("900 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("MediaLibraryError carries status and usedBy", () => {
    const err = new MediaLibraryError("nope", 409, [{ type: "Product", id: "1", label: "Toy" }]);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.usedBy).toEqual([{ type: "Product", id: "1", label: "Toy" }]);
  });
});

describe("collectReferencedMedia / isReferenced", () => {
  let mongod;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
  afterEach(async () => {
    await Promise.all([
      Product.deleteMany({}), Category.deleteMany({}), Collection.deleteMany({}),
      NavigationItem.deleteMany({}), HeroSlide.deleteMany({}),
    ]);
  });

  const svc = () => createMediaLibraryService({ getMediaDir: () => "/tmp/unused" });

  it("collects basenames from every media-bearing field across models", async () => {
    await Product.create({
      name: "Toy", slug: "toy", price: 100,
      images: ["/api/media/p1.webp", "p2.webp"], video: "pv.mp4",
      variants: [{ color: "Red", images: ["var1.webp"] }],
    });
    await Category.create({ name: "Cat", slug: "cat", image: "c.webp", heroImage: "ch.webp" });
    await Collection.create({ name: "Col", slug: "col", heroImage: "colh.webp" });
    await NavigationItem.create({ label: "Nav", targetType: "category", menuKey: "header", image: "nav.webp" });
    await HeroSlide.create({
      type: "campaign", displayMode: "full_banner", title: "H",
      desktopMedia: "hd.webp", mobileMedia: "hm.webp", video: "hv.mp4", posterImage: "hp.webp",
    });

    const refs = await svc().collectReferencedMedia();
    for (const name of ["p1.webp","p2.webp","pv.mp4","var1.webp","c.webp","ch.webp","colh.webp","nav.webp","hd.webp","hm.webp","hv.mp4","hp.webp"]) {
      expect(refs.has(name)).toBe(true);
    }
  });

  it("isReferenced consults the set", async () => {
    const refs = new Set(["x.webp"]);
    expect(svc().isReferenced("x.webp", refs)).toBe(true);
    expect(svc().isReferenced("/api/media/x.webp", refs)).toBe(true);
    expect(svc().isReferenced("y.webp", refs)).toBe(false);
  });

  it("referencingEntities lists which docs use a filename", async () => {
    const p = await Product.create({ name: "Toy", slug: "toy", price: 1, images: ["shared.webp"] });
    const c = await Category.create({ name: "Cat", slug: "cat", image: "shared.webp" });
    const used = await svc().referencingEntities("shared.webp");
    const ids = used.map((u) => u.id).sort();
    expect(ids).toEqual([String(c.id), String(p.id)].sort());
    expect(used.find((u) => u.id === String(p.id)).type).toBe("Product");
  });
});

describe("listMedia / summarize", () => {
  let mongod, dir;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
  afterEach(async () => { await Product.deleteMany({}); if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  async function seedDir(files) {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "medialib-"));
    for (const [name, bytes] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes, 1));
    }
    await fs.writeFile(path.join(dir, ".gitkeep"), "");
    return createMediaLibraryService({ getMediaDir: () => dir });
  }

  it("lists files with size, kind, modifiedAt, inUse; skips dotfiles", async () => {
    const svc = await seedDir({ "a.webp": 2048, "b.mp4": 1024, "c.png": 500 });
    await Product.create({ name: "T", slug: "t", price: 1, images: ["a.webp"] });
    const { items } = await svc.listMedia({});
    const names = items.map((i) => i.filename).sort();
    expect(names).toEqual(["a.webp", "b.mp4", "c.png"]);
    const a = items.find((i) => i.filename === "a.webp");
    expect(a.size).toBe(2048);
    expect(a.sizeLabel).toBe("2 KB");
    expect(a.kind).toBe("image");
    expect(a.inUse).toBe(true);
    expect(a.url).toBe("/api/media/a.webp");
    expect(typeof a.modifiedAt).toBe("string");
    expect(items.find((i) => i.filename === "b.mp4").inUse).toBe(false);
  });

  it("filters by q (substring), type, and unused", async () => {
    const svc = await seedDir({ "alpha.webp": 10, "beta.webp": 10, "clip.mp4": 10 });
    await Product.create({ name: "T", slug: "t", price: 1, images: ["alpha.webp"] });
    expect((await svc.listMedia({ q: "lph" })).items.map((i) => i.filename)).toEqual(["alpha.webp"]);
    expect((await svc.listMedia({ type: "video" })).items.map((i) => i.filename)).toEqual(["clip.mp4"]);
    expect((await svc.listMedia({ type: "image" })).items.map((i) => i.filename).sort()).toEqual(["alpha.webp", "beta.webp"]);
    const unused = (await svc.listMedia({ filter: "unused" })).items.map((i) => i.filename).sort();
    expect(unused).toEqual(["beta.webp", "clip.mp4"]);
  });

  it("summary totals are computed over the full set, independent of filters", async () => {
    const svc = await seedDir({ "a.webp": 1000, "b.mp4": 2000, "c.png": 3000 });
    await Product.create({ name: "T", slug: "t", price: 1, images: ["a.webp"] });
    const { summary } = await svc.listMedia({ q: "zzz" }); // filter matches nothing
    expect(summary.totalFiles).toBe(3);
    expect(summary.totalBytes).toBe(6000);
    expect(summary.imageCount).toBe(2);
    expect(summary.videoCount).toBe(1);
    expect(summary.unusedFiles).toBe(2);
    expect(summary.unusedBytes).toBe(5000);
  });
});

describe("deleteMedia", () => {
  let mongod, dir;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
  afterEach(async () => { await Product.deleteMany({}); if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  async function seedDir(files) {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "medialib-del-"));
    for (const [name, bytes] of Object.entries(files)) await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes, 1));
    return createMediaLibraryService({ getMediaDir: () => dir });
  }

  it("unlinks an unused file", async () => {
    const svc = await seedDir({ "gone.webp": 10 });
    const res = await svc.deleteMedia("gone.webp");
    expect(res).toEqual({ deleted: true });
    await expect(fs.stat(path.join(dir, "gone.webp"))).rejects.toBeTruthy();
  });

  it("throws 409 with usedBy for a referenced file and does NOT unlink", async () => {
    const svc = await seedDir({ "live.webp": 10 });
    await Product.create({ name: "Live Toy", slug: "lt", price: 1, images: ["live.webp"] });
    await expect(svc.deleteMedia("live.webp")).rejects.toMatchObject({
      status: 409,
      usedBy: [{ type: "Product" }],
    });
    await expect(fs.stat(path.join(dir, "live.webp"))).resolves.toBeTruthy(); // still there
  });

  it("rejects path traversal / nested paths with 400", async () => {
    const svc = await seedDir({ "ok.webp": 10 });
    for (const bad of ["../secret", "a/b.webp", "..\\win", "/etc/passwd"]) {
      await expect(svc.deleteMedia(bad)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("returns 404 when the file does not exist", async () => {
    const svc = await seedDir({ "exists.webp": 10 });
    await expect(svc.deleteMedia("missing.webp")).rejects.toMatchObject({ status: 404 });
  });
});
