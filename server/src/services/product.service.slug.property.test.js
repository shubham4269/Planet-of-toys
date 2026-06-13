// Feature: planet-of-toys-ecommerce, Property 30: Generated slugs are URL-safe and unique
import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { generateSlug, createProduct } from "./product.service.js";
import { Product } from "../models/index.js";

/**
 * Property 30: Generated slugs are URL-safe and unique.
 *
 * For any set of product names, each generated slug is URL-safe and all
 * generated slugs are distinct.
 *
 * "URL-safe" here means the slug consists only of lowercase ASCII alphanumeric
 * segments separated by single hyphens, with no leading/trailing hyphen and no
 * empty segments (so it can be embedded in a path without escaping). Uniqueness
 * is guaranteed by the service appending numeric suffixes (`-2`, `-3`, ...) when
 * a base slug collides with one already in use.
 *
 * Validates: Requirements 16.2
 */

// A slug is URL-safe when it is one or more lowercase alphanumeric segments
// joined by single hyphens, e.g. "toy-car", "robot-2", "product".
const URL_SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await Product.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// A small pool of names chosen to force slug collisions (identical or
// diacritic-equivalent base slugs) so the uniqueness suffixing is exercised.
const collisionProneName = fc.constantFrom(
  "Toy Car",
  "Toy Car!",
  "  toy   car  ",
  "Robot",
  "Crème Brûlée",
  "Creme Brulee",
  "!!! ???", // slugifies to the fallback "product"
  "   @@@   "
);

// Arbitrary free-form names; filtered to be non-empty after trimming so they
// satisfy the createProduct precondition (a name is required).
const freeFormName = fc.string().filter((s) => s.trim().length > 0);

const productName = fc.oneof(collisionProneName, freeFormName);

// A set of product names (1..8) with duplicates very likely, to stress both
// URL-safety and cross-name uniqueness.
const productNames = fc.array(productName, { minLength: 1, maxLength: 8 });

describe("Property 30: generated slugs are URL-safe and unique", () => {
  it("generateSlug yields URL-safe, distinct slugs for any set of names (pure)", () => {
    fc.assert(
      fc.property(productNames, (names) => {
        const used = new Set();
        for (const name of names) {
          const slug = generateSlug(name, used);
          // URL-safe shape.
          expect(slug).toMatch(URL_SAFE_SLUG);
          // Distinct from every slug generated so far.
          expect(used.has(slug)).toBe(false);
          used.add(slug);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("createProduct persists URL-safe, mutually-distinct slugs for any set of names", async () => {
    await fc.assert(
      fc.asyncProperty(productNames, async (names) => {
        // Fresh catalog per run so uniqueness is measured within this set.
        await Product.deleteMany({});

        const slugs = [];
        for (const name of names) {
          const product = await createProduct({
            name,
            price: 100,
            stock: 1,
          });
          slugs.push(product.slug);
        }

        // Every persisted slug is URL-safe.
        for (const slug of slugs) {
          expect(slug).toMatch(URL_SAFE_SLUG);
        }

        // All persisted slugs are distinct across the set of names.
        expect(new Set(slugs).size).toBe(slugs.length);
      }),
      { numRuns: 100 }
    );
  });
});
