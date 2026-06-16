// server/src/modules/catalog/navigation.service.test.js
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

describe("navigation.service (foundation)", () => {
  it("creates a nav item and lists active sorted", async () => {
    await svc.createNavigationItem({ label: "B", targetType: "collection", targetId: new mongoose.Types.ObjectId(), sortOrder: 2 });
    await svc.createNavigationItem({ label: "A", targetType: "category", targetId: new mongoose.Types.ObjectId(), sortOrder: 1 });
    const list = await svc.listNavigationItems({ includeArchived: false });
    expect(list.map((n) => n.label)).toEqual(["A", "B"]);
  });

  it("validates targetType", async () => {
    await expect(svc.createNavigationItem({ label: "X", targetType: "bogus" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("archives and restores", async () => {
    const n = await svc.createNavigationItem({ label: "Sale", targetType: "internalRoute", url: "/sale" });
    await svc.archiveNavigationItem(n.id);
    expect(await svc.listNavigationItems({ includeArchived: false })).toHaveLength(0);
    await svc.restoreNavigationItem(n.id);
    expect(await svc.listNavigationItems({ includeArchived: false })).toHaveLength(1);
  });
});
