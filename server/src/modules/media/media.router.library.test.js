// server/src/modules/media/media.router.library.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createMediaUploadRouter } from "./media.router.js";
import { createMediaService } from "./media.service.js";
import { createMediaLibraryService } from "./mediaLibrary.service.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Product from "../products/product.model.js";

let mongod, dir;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); if (dir) await fs.rm(dir, { recursive: true, force: true }); });

async function buildApp({ authorized = true, files = {} } = {}) {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "medialib-router-"));
  for (const [name, bytes] of Object.entries(files)) await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes, 1));
  const mediaService = createMediaService({ uploads: { allowedMediaTypes: ["image/png"], maxUploadSizeMb: 5 }, mediaDir: dir });
  const mediaLibraryService = createMediaLibraryService({ getMediaDir: mediaService.getMediaDir });
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Auth required", status: 401 } });
    req.admin = { id: "a" }; next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/admin/media", createMediaUploadRouter({ mediaService, mediaLibraryService, requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/media` };
}

describe("media library router", () => {
  it("GET / requires auth", async () => {
    const { server, base } = await buildApp({ authorized: false });
    try { expect((await fetch(base)).status).toBe(401); } finally { server.close(); }
  });

  it("GET / returns items + summary", async () => {
    const { server, base } = await buildApp({ files: { "a.png": 1000, "b.mp4": 2000 } });
    try {
      const data = await (await fetch(base)).json();
      expect(data.items.map((i) => i.filename).sort()).toEqual(["a.png", "b.mp4"]);
      expect(data.summary.totalFiles).toBe(2);
    } finally { server.close(); }
  });

  it("DELETE unused -> 200; removes file", async () => {
    const { server, base } = await buildApp({ files: { "x.png": 10 } });
    try {
      const r = await fetch(`${base}/x.png`, { method: "DELETE" });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ deleted: true });
    } finally { server.close(); }
  });

  it("DELETE in-use -> 409 with usedBy", async () => {
    const { server, base } = await buildApp({ files: { "live.png": 10 } });
    await Product.create({ name: "Live", slug: "live", price: 1, images: ["live.png"] });
    try {
      const r = await fetch(`${base}/live.png`, { method: "DELETE" });
      expect(r.status).toBe(409);
      const body = await r.json();
      expect(body.usedBy[0].type).toBe("Product");
    } finally { server.close(); }
  });
});
