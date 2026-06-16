// server/src/modules/hero/hero.admin.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createHeroAdminRouter } from "./hero.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import HeroSlide from "./heroSlide.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await HeroSlide.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Auth required", status: 401 } });
    req.admin = { id: "a" }; next();
  };
  app.use("/api/admin/hero", createHeroAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/hero` };
}
const send = (url, method, body) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe("hero admin router", () => {
  it("rejects unauthenticated requests", async () => {
    const { server, base } = buildApp({ authorized: false });
    try { expect((await fetch(base)).status).toBe(401); } finally { server.close(); }
  });

  it("creates, soft-deletes, restores, and lists with includeDeleted", async () => {
    const { server, base } = buildApp();
    try {
      const created = (await (await send(base, "POST", { type: "campaign", displayMode: "full_banner", title: "X" })).json()).slide;
      expect(created.title).toBe("X");
      await send(`${base}/${created.id}/soft-delete`, "POST");
      expect((await (await fetch(base)).json()).slides).toHaveLength(0);
      expect((await (await fetch(`${base}?includeDeleted=true`)).json()).slides).toHaveLength(1);
      await send(`${base}/${created.id}/restore`, "POST");
      expect((await (await fetch(base)).json()).slides).toHaveLength(1);
    } finally { server.close(); }
  });

  it("400s an invalid displayMode", async () => {
    const { server, base } = buildApp();
    try {
      const r = await send(base, "POST", { type: "campaign", displayMode: "bogus" });
      expect(r.status).toBe(400);
    } finally { server.close(); }
  });
});
