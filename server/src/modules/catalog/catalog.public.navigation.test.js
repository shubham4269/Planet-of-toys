// server/src/modules/catalog/catalog.public.navigation.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogPublicRouter } from "./catalog.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import NavigationItem from "./navigationItem.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import * as nav from "./navigation.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); await Category.deleteMany({}); await Product.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", createCatalogPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/catalog` };
}

describe("public navigation + category browse", () => {
  it("returns the resolved navigation tree for a menuKey", async () => {
    const { server, base } = buildApp();
    try {
      const cat = await Category.create({ name: "Edu", slug: "edu" });
      await nav.createNavigationItem({ label: "Learn", targetType: "category", targetId: cat._id, menuKey: "header" });
      const body = await (await fetch(`${base}/navigation?menuKey=header`)).json();
      expect(body.items[0]).toMatchObject({ label: "Learn", href: "/category/edu" });
    } finally { server.close(); }
  });

  it("returns category filters + a product page", async () => {
    const { server, base } = buildApp();
    try {
      const cat = await Category.create({ name: "Blocks", slug: "blocks" });
      await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, categoryIds: [cat._id] });
      const filters = await (await fetch(`${base}/categories/blocks/filters`)).json();
      expect(filters.filters.some((f) => f.key === "price")).toBe(true);
      const products = await (await fetch(`${base}/categories/blocks/products?sort=price-asc`)).json();
      expect(products.products[0].slug).toBe("a");
    } finally { server.close(); }
  });

  it("404s category browse for an unknown slug", async () => {
    const { server, base } = buildApp();
    try {
      expect((await fetch(`${base}/categories/nope/filters`)).status).toBe(404);
      expect((await fetch(`${base}/categories/nope/products`)).status).toBe(404);
    } finally { server.close(); }
  });
});
