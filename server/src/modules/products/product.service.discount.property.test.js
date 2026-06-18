// Feature: planet-of-toys-ecommerce, Property 1: Discount percentage is correctly computed and bounded
//
// Property 1: Discount percentage is correctly computed and bounded
// "For any product where 0 <= price <= compareAtPrice and compareAtPrice > 0,
//  the computed discountPercent equals round((compareAtPrice - price) /
//  compareAtPrice * 100) and lies within the range [0, 100]."
//
// Validates: Requirements 1.1
//
// Strategy: generate products over the property's valid input space
// (compareAtPrice >= 1 and 0 <= price <= compareAtPrice). Two complementary
// checks are run at 100+ iterations:
//   1. Pure computation: the exported computeDiscountPercent helper returns the
//      exact rounded formula and stays bounded within [0, 100].
//   2. Persistence: createProduct(input) -> reload from MongoDB yields a stored
//      discountPercent equal to the formula and within [0, 100], proving the
//      derived value the storefront reads (Req 1.1) is computed and bounded
//      end-to-end. An in-memory MongoDB backs the persistence check per the
//      repository's property-test conventions.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import fc from "fast-check";
import { createProduct } from "./product.service.js";
import Product, { computeDiscountPercent } from "./product.model.js";

const NUM_RUNS = 100;

/**
 * Reference implementation of the spec formula, kept independent of the code
 * under test so the property checks behavior rather than restating it.
 * round((compareAtPrice - price) / compareAtPrice * 100), valid only when
 * compareAtPrice > 0.
 */
function expectedDiscount(price, compareAtPrice) {
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

// ---- Generators ------------------------------------------------------------

/**
 * A product point in the property's valid input space:
 *   compareAtPrice >= 1  (compareAtPrice > 0)
 *   0 <= price <= compareAtPrice
 * Generated as integers in a realistic money range (paise/rupee whole units).
 */
const validPricing = fc
  .integer({ min: 1, max: 1_000_000 })
  .chain((compareAtPrice) =>
    fc
      .integer({ min: 0, max: compareAtPrice })
      .map((price) => ({ price, compareAtPrice }))
  );

// ---- Tests -----------------------------------------------------------------

describe("Property 1: Discount percentage is correctly computed and bounded", () => {
  it("computeDiscountPercent matches the rounded formula and stays within [0, 100]", () => {
    fc.assert(
      fc.property(validPricing, ({ price, compareAtPrice }) => {
        const actual = computeDiscountPercent(price, compareAtPrice);

        // Correctly computed: equals round((compareAt - price)/compareAt * 100).
        expect(actual).toBe(expectedDiscount(price, compareAtPrice));

        // Bounded: lies within [0, 100].
        expect(actual).toBeGreaterThanOrEqual(0);
        expect(actual).toBeLessThanOrEqual(100);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  describe("persisted products carry the correctly computed, bounded discount", () => {
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

    it("createProduct persists a discountPercent equal to the formula and within [0, 100]", async () => {
      await fc.assert(
        fc.asyncProperty(
          validPricing,
          fc
            .string({ minLength: 1, maxLength: 24 })
            .map((s) => s.replace(/\s+/g, " ").trim())
            .filter((s) => s.length > 0),
          async ({ price, compareAtPrice }, name) => {
            const saved = await createProduct({
              name,
              price,
              compareAtPrice,
              stock: 1,
            });
            const reloaded = await Product.findById(saved._id);

            expect(reloaded).not.toBeNull();

            const expected = expectedDiscount(price, compareAtPrice);
            expect(reloaded.discountPercent).toBe(expected);
            expect(reloaded.discountPercent).toBeGreaterThanOrEqual(0);
            expect(reloaded.discountPercent).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
