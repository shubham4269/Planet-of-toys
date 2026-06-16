// server/src/modules/hero/hero.public.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createHeroPublicRouter } from "./hero.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import HeroSlide from "./heroSlide.model.js";
import * as svc from "./hero.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await HeroSlide.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/hero", createHeroPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/hero` };
}

describe("hero public router", () => {
  it("returns only published+active slides", async () => {
    const { server, base } = buildApp();
    try {
      await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Live", status: "published" });
      await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Draft", status: "draft" });
      const body = await (await fetch(base)).json();
      expect(body.slides.map((s) => s.title)).toEqual(["Live"]);
    } finally { server.close(); }
  });
});
