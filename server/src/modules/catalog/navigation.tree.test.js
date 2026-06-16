// server/src/modules/catalog/navigation.tree.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NavigationItem from "./navigationItem.model.js";
import Category from "./category.model.js";
import Collection from "./collection.model.js";
import * as svc from "./navigation.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); await Category.deleteMany({}); await Collection.deleteMany({}); });

describe("getPublicNavigation", () => {
  it("builds an active tree with server-resolved hrefs and nested children", async () => {
    const cat = await Category.create({ name: "Educational", slug: "educational" });
    const col = await Collection.create({ name: "New Arrivals", slug: "new-arrivals" });
    const parent = await svc.createNavigationItem({ label: "Shop by Age", targetType: "category", targetId: cat._id, isMegaMenu: true, menuKey: "header", sortOrder: 0 });
    await svc.createNavigationItem({ label: "New Arrivals", targetType: "collection", targetId: col._id, parentId: parent.id, featured: true, image: "na.webp", menuKey: "header", sortOrder: 0 });
    await svc.createNavigationItem({ label: "Sale", targetType: "internalRoute", url: "/sale", menuKey: "header", sortOrder: 1 });

    const tree = await svc.getPublicNavigation({ menuKey: "header" });
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ label: "Shop by Age", href: "/category/educational", isMegaMenu: true });
    expect(tree[0].children[0]).toMatchObject({ label: "New Arrivals", href: "/collections/new-arrivals", featured: true, image: "na.webp" });
    expect(tree[1]).toMatchObject({ label: "Sale", href: "/sale" });
  });

  it("excludes archived items and filters by menuKey", async () => {
    await svc.createNavigationItem({ label: "Footer Link", targetType: "internalRoute", url: "/x", menuKey: "footer" });
    const hidden = await svc.createNavigationItem({ label: "Gone", targetType: "internalRoute", url: "/y", menuKey: "header" });
    await svc.archiveNavigationItem(hidden.id);
    expect(await svc.getPublicNavigation({ menuKey: "header" })).toHaveLength(0);
  });

  it("reorders items", async () => {
    const a = await svc.createNavigationItem({ label: "A", targetType: "internalRoute", url: "/a", sortOrder: 0 });
    const b = await svc.createNavigationItem({ label: "B", targetType: "internalRoute", url: "/b", sortOrder: 1 });
    await svc.reorderNavigationItems([{ id: b.id, parentId: null, sortOrder: 0 }, { id: a.id, parentId: null, sortOrder: 1 }]);
    const tree = await svc.getPublicNavigation({ menuKey: "header" });
    expect(tree.map((n) => n.label)).toEqual(["B", "A"]);
  });
});
