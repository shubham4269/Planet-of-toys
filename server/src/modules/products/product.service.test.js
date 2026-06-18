import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  generateSlug,
  toPublicProjection,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductState,
  associateMedia,
  listProducts,
  getActiveProductBySlug,
} from "./product.service.js";
import { Product } from "../../models/index.js";

describe("product service", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Product.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  describe("generateSlug", () => {
    it("produces a URL-safe slug from a name", () => {
      expect(generateSlug("Super Fun Toy Car!")).toBe("super-fun-toy-car");
    });

    it("strips diacritics and collapses separators", () => {
      expect(generateSlug("  Crème  Brûlée — Deluxe  ")).toBe(
        "creme-brulee-deluxe"
      );
    });

    it("falls back to 'product' when the name has no slug-able characters", () => {
      expect(generateSlug("!!! ???")).toBe("product");
    });

    it("appends a numeric suffix to avoid collisions", () => {
      const existing = ["toy-car", "toy-car-2"];
      expect(generateSlug("Toy Car", existing)).toBe("toy-car-3");
    });

    it("accepts a Set of existing slugs", () => {
      expect(generateSlug("Toy Car", new Set(["toy-car"]))).toBe("toy-car-2");
    });
  });

  describe("createProduct", () => {
    it("persists fields and generates a unique slug", async () => {
      const product = await createProduct({
        name: "Wooden Blocks",
        price: 499,
        compareAtPrice: 999,
        stock: 10,
        features: ["Eco-friendly"],
      });

      expect(product.slug).toBe("wooden-blocks");
      expect(product.name).toBe("Wooden Blocks");
      expect(product.price).toBe(499);
      expect(product.features).toEqual(["Eco-friendly"]);
    });

    it("computes the discount percentage from price and compareAtPrice", async () => {
      const product = await createProduct({
        name: "Discounted Kite",
        price: 75,
        compareAtPrice: 100,
        stock: 5,
      });
      // round((100 - 75) / 100 * 100) = 25
      expect(product.discountPercent).toBe(25);
    });

    it("generates a distinct slug for a duplicate name", async () => {
      await createProduct({ name: "Robot", price: 100, stock: 1 });
      const second = await createProduct({ name: "Robot", price: 100, stock: 1 });
      expect(second.slug).toBe("robot-2");
    });

    it("rejects creation without a name", async () => {
      await expect(createProduct({ price: 100, stock: 1 })).rejects.toThrow(
        /name is required/i
      );
    });

    it("does not let callers set the slug or discount directly", async () => {
      const product = await createProduct({
        name: "Trickster",
        price: 50,
        compareAtPrice: 100,
        slug: "custom-slug",
        discountPercent: 99,
        stock: 1,
      });
      expect(product.slug).toBe("trickster");
      expect(product.discountPercent).toBe(50);
    });
  });

  describe("updateProduct", () => {
    it("updates fields and recomputes discount", async () => {
      const created = await createProduct({
        name: "Puzzle",
        price: 200,
        compareAtPrice: 400,
        stock: 3,
      });
      const updated = await updateProduct(created._id, {
        price: 100,
      });
      expect(updated.price).toBe(100);
      // round((400 - 100) / 400 * 100) = 75
      expect(updated.discountPercent).toBe(75);
    });

    it("regenerates a unique slug when the name changes", async () => {
      const created = await createProduct({ name: "Old Name", price: 10, stock: 1 });
      const updated = await updateProduct(created._id, { name: "New Name" });
      expect(updated.slug).toBe("new-name");
    });

    it("keeps the slug when the name is unchanged", async () => {
      const created = await createProduct({ name: "Stable", price: 10, stock: 1 });
      const updated = await updateProduct(created._id, { price: 12 });
      expect(updated.slug).toBe("stable");
    });

    it("throws when the product does not exist", async () => {
      const missingId = new mongoose.Types.ObjectId();
      await expect(updateProduct(missingId, { price: 1 })).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe("deleteProduct", () => {
    it("removes the product from the catalog", async () => {
      const created = await createProduct({ name: "Doomed", price: 10, stock: 1 });
      await deleteProduct(created._id);
      const found = await Product.findById(created._id);
      expect(found).toBeNull();
    });

    it("throws when deleting a non-existent product", async () => {
      const missingId = new mongoose.Types.ObjectId();
      await expect(deleteProduct(missingId)).rejects.toThrow(/not found/i);
    });
  });

  describe("setProductState", () => {
    it("toggles the active state", async () => {
      const created = await createProduct({ name: "Toggle Me", price: 10, stock: 1 });
      const updated = await setProductState(created._id, { active: false });
      expect(updated.active).toBe(false);
    });

    it("updates the stock quantity", async () => {
      const created = await createProduct({ name: "Restock", price: 10, stock: 1 });
      const updated = await setProductState(created._id, { stock: 0 });
      expect(updated.stock).toBe(0);
    });

    it("only changes the provided fields", async () => {
      const created = await createProduct({
        name: "Partial",
        price: 10,
        stock: 7,
        active: true,
      });
      const updated = await setProductState(created._id, { active: false });
      expect(updated.active).toBe(false);
      expect(updated.stock).toBe(7);
    });
  });

  describe("associateMedia", () => {
    it("appends image references to the gallery", async () => {
      const created = await createProduct({
        name: "Gallery",
        price: 10,
        stock: 1,
        images: ["a.webp"],
      });
      const updated = await associateMedia(created._id, {
        images: ["b.webp", "c.webp"],
      });
      expect(updated.images).toEqual(["a.webp", "b.webp", "c.webp"]);
    });

    it("replaces the gallery when replace is true", async () => {
      const created = await createProduct({
        name: "Replace Gallery",
        price: 10,
        stock: 1,
        images: ["a.webp"],
      });
      const updated = await associateMedia(
        created._id,
        { images: ["x.webp"] },
        { replace: true }
      );
      expect(updated.images).toEqual(["x.webp"]);
    });

    it("associates a video reference", async () => {
      const created = await createProduct({ name: "Video", price: 10, stock: 1 });
      const updated = await associateMedia(created._id, { video: "demo.mp4" });
      expect(updated.video).toBe("demo.mp4");
    });
  });

  describe("listProducts", () => {
    it("returns products newest first", async () => {
      await createProduct({ name: "First", price: 10, stock: 1 });
      await createProduct({ name: "Second", price: 10, stock: 1 });
      const products = await listProducts();
      expect(products).toHaveLength(2);
      expect(products[0].name).toBe("Second");
    });
  });

  describe("getActiveProductBySlug", () => {
    it("returns the public projection for an active product", async () => {
      await createProduct({
        name: "Visible",
        price: 50,
        compareAtPrice: 100,
        stock: 4,
      });
      const projection = await getActiveProductBySlug("visible");
      expect(projection).not.toBeNull();
      expect(projection.name).toBe("Visible");
      expect(projection.discountPercent).toBe(50);
    });

    it("excludes internal fields from the projection", async () => {
      await createProduct({ name: "Hidden Fields", price: 50, stock: 4 });
      const projection = await getActiveProductBySlug("hidden-fields");
      expect(projection).not.toHaveProperty("active");
      expect(projection).not.toHaveProperty("createdAt");
      expect(projection).not.toHaveProperty("updatedAt");
      expect(projection).not.toHaveProperty("__v");
      expect(projection).not.toHaveProperty("_id");
    });

    it("returns null for an inactive product", async () => {
      const created = await createProduct({ name: "Inactive", price: 10, stock: 1 });
      await setProductState(created._id, { active: false });
      const projection = await getActiveProductBySlug("inactive");
      expect(projection).toBeNull();
    });

    it("returns null for an unknown slug", async () => {
      const projection = await getActiveProductBySlug("does-not-exist");
      expect(projection).toBeNull();
    });

    it("returns null for an empty slug", async () => {
      expect(await getActiveProductBySlug("")).toBeNull();
      expect(await getActiveProductBySlug(null)).toBeNull();
    });
  });

  describe("toPublicProjection", () => {
    it("returns null for a falsy product", () => {
      expect(toPublicProjection(null)).toBeNull();
    });

    it("maps _id to id for plain objects", () => {
      const projection = toPublicProjection({
        _id: "abc123",
        slug: "x",
        name: "X",
        price: 1,
      });
      expect(projection.id).toBe("abc123");
      expect(projection).not.toHaveProperty("_id");
    });
  });
});
