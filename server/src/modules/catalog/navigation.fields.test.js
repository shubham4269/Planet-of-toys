// server/src/modules/catalog/navigation.fields.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NavigationItem from "./navigationItem.model.js";
import * as svc from "./navigation.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); });

describe("NavigationItem new fields + integrity", () => {
  it("defaults menuKey=header and the mega/featured flags", async () => {
    const json = (await NavigationItem.create({ label: "X", targetType: "collection" })).toJSON();
    expect(json.menuKey).toBe("header");
    expect(json.isMegaMenu).toBe(false);
    expect(json.featured).toBe(false);
    expect(json.image).toBeNull();
  });

  it("create persists the new fields", async () => {
    const id = new mongoose.Types.ObjectId();
    const item = await svc.createNavigationItem({ label: "Shop", targetType: "collection", targetId: id, isMegaMenu: true, menuKey: "header" });
    expect(item.isMegaMenu).toBe(true);
    expect(String(item.targetId)).toBe(String(id));
  });

  it("rejects a category/collection target that carries a raw url", async () => {
    await expect(svc.createNavigationItem({ label: "Bad", targetType: "collection", targetId: new mongoose.Types.ObjectId(), url: "/collections/x" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("requires targetId for category/collection targets", async () => {
    await expect(svc.createNavigationItem({ label: "Bad", targetType: "category" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("requires a url for internalRoute/externalUrl targets", async () => {
    await expect(svc.createNavigationItem({ label: "Sale", targetType: "internalRoute" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });
});
