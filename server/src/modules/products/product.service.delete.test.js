import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  createProduct,
  deleteProduct,
  associateMedia,
} from "./product.service.js";
import { Product } from "../../models/index.js";

/**
 * Unit tests for product deletion (Req 16.5) and media-to-product
 * association (Req 16.3).
 *
 * These focus narrowly on the catalog-removal and media-linking behaviours so
 * they complement, rather than duplicate, the broader suite in
 * product.service.test.js. An in-memory MongoDB instance backs the tests per
 * the project convention.
 */
describe("product service: delete & media association", () => {
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

  describe("deleteProduct (Req 16.5)", () => {
    it("removes the product from the catalog so it can no longer be read", async () => {
      const created = await createProduct({ name: "Retiring Toy", price: 10, stock: 1 });

      const removed = await deleteProduct(created._id);

      // Returns the removed document...
      expect(String(removed._id)).toBe(String(created._id));
      // ...and the product is gone from the catalog.
      const found = await Product.findById(created._id);
      expect(found).toBeNull();
      expect(await Product.countDocuments()).toBe(0);
    });

    it("only deletes the targeted product and leaves the rest of the catalog intact", async () => {
      const keep = await createProduct({ name: "Keep Me", price: 10, stock: 1 });
      const drop = await createProduct({ name: "Drop Me", price: 10, stock: 1 });

      await deleteProduct(drop._id);

      expect(await Product.countDocuments()).toBe(1);
      const survivor = await Product.findById(keep._id);
      expect(survivor).not.toBeNull();
      expect(survivor.name).toBe("Keep Me");
    });

    it("throws a not-found error when the product does not exist", async () => {
      const missingId = new mongoose.Types.ObjectId();
      await expect(deleteProduct(missingId)).rejects.toThrow(/not found/i);
    });
  });

  describe("associateMedia (Req 16.3)", () => {
    it("associates uploaded image and video references with the product and persists them", async () => {
      const created = await createProduct({ name: "Media Toy", price: 10, stock: 1 });

      const updated = await associateMedia(created._id, {
        images: ["one.webp", "two.webp"],
        video: "demo.mp4",
      });

      expect(updated.images).toEqual(["one.webp", "two.webp"]);
      expect(updated.video).toBe("demo.mp4");

      // The association is durably stored, not just held in memory.
      const reloaded = await Product.findById(created._id);
      expect(reloaded.images).toEqual(["one.webp", "two.webp"]);
      expect(reloaded.video).toBe("demo.mp4");
    });

    it("appends new images to the existing gallery by default", async () => {
      const created = await createProduct({
        name: "Gallery Toy",
        price: 10,
        stock: 1,
        images: ["existing.webp"],
      });

      const updated = await associateMedia(created._id, { images: ["new.webp"] });

      expect(updated.images).toEqual(["existing.webp", "new.webp"]);
    });

    it("replaces the gallery when replace is requested", async () => {
      const created = await createProduct({
        name: "Replace Toy",
        price: 10,
        stock: 1,
        images: ["old.webp"],
      });

      const updated = await associateMedia(
        created._id,
        { images: ["fresh.webp"] },
        { replace: true }
      );

      expect(updated.images).toEqual(["fresh.webp"]);
    });

    it("leaves existing media untouched when no media is provided", async () => {
      const created = await createProduct({
        name: "Untouched Toy",
        price: 10,
        stock: 1,
        images: ["keep.webp"],
        video: "keep.mp4",
      });

      const updated = await associateMedia(created._id, {});

      expect(updated.images).toEqual(["keep.webp"]);
      expect(updated.video).toBe("keep.mp4");
    });

    it("throws a not-found error when associating media with a missing product", async () => {
      const missingId = new mongoose.Types.ObjectId();
      await expect(
        associateMedia(missingId, { images: ["x.webp"] })
      ).rejects.toThrow(/not found/i);
    });
  });
});
