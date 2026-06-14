// Feature: planet-of-toys-ecommerce, Property 4: For any slug that does not correspond to an existing active product, the landing-page resolver returns a not-found result and never returns product data.
import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createProduct, setProductState, getActiveProductBySlug } from "./product.service.js";
import { Product } from "../models/index.js";

/**
 * Property 4: Only active products resolve.
 *
 * For any slug that does not correspond to an existing active product, the
 * landing-page resolver (`getActiveProductBySlug`) returns a not-found result
 * (`null`) and never returns product data. The "does not correspond to an
 * active product" input space covers two disjoint cases:
 *   - the slug belongs to a product that is currently inactive, and
 *   - the slug matches no product in the catalog at all (unknown slug).
 *
 * Validates: Requirements 1.6
 */

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

// Product names that always yield a non-empty, slug-able name. Drawn from
// letters, digits, spaces and a few punctuation marks so the generated catalog
// exercises realistic slug derivation without producing whitespace-only names.
const nameArb = fc
  .string({ minLength: 1, maxLength: 24, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789  -!".split("")) })
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// One product spec, with an explicit active flag so the catalog mixes active
// and inactive entries.
const productSpecArb = fc.record({
  name: nameArb,
  active: fc.boolean(),
  price: fc.integer({ min: 0, max: 100000 }),
  stock: fc.integer({ min: 0, max: 1000 }),
});

// A scenario: a small catalog, an arbitrary "unknown" slug candidate, and a
// switch selecting whether to query the unknown slug or an inactive product's
// slug (when one exists).
const scenarioArb = fc.record({
  products: fc.array(productSpecArb, { minLength: 1, maxLength: 5 }),
  unknownSlug: fc.string({ minLength: 1, maxLength: 20 }),
  preferUnknown: fc.boolean(),
});

describe("Property 4: only active products resolve", () => {
  it("returns not-found for any slug that does not correspond to an active product", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ products, unknownSlug, preferUnknown }) => {
        // Reset catalog for an isolated scenario.
        await Product.deleteMany({});

        // Persist the catalog; createProduct derives a unique slug per product.
        const created = [];
        for (const spec of products) {
          const doc = await createProduct({
            name: spec.name,
            price: spec.price,
            stock: spec.stock,
            active: spec.active,
          });
          if (!spec.active) {
            // Ensure inactive state is persisted via the dedicated transition.
            await setProductState(doc._id, { active: false });
          }
          created.push({ slug: doc.slug, active: spec.active });
        }

        const activeSlugs = new Set(created.filter((p) => p.active).map((p) => p.slug));
        const inactiveSlugs = created.filter((p) => !p.active).map((p) => p.slug);

        // Choose a query slug that does NOT correspond to an active product.
        let querySlug;
        if (!preferUnknown && inactiveSlugs.length > 0) {
          querySlug = inactiveSlugs[0];
        } else {
          querySlug = unknownSlug;
        }

        // Precondition: the queried slug must not resolve to an active product.
        // (Inactive slugs are unique and never in activeSlugs; this guards the
        // unknown-slug branch against an accidental collision with an active slug.)
        fc.pre(!activeSlugs.has(querySlug));

        const result = await getActiveProductBySlug(querySlug);

        // Not-found result: strictly null, carrying no product data.
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
