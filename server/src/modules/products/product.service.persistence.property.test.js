// Feature: planet-of-toys-ecommerce, Property 29: Product persistence round-trip
//
// Property 29: Product persistence round-trip
// "For any valid product (including active/stock-state toggles), saving then
//  reloading the product returns equal values for all persisted fields."
//
// Validates: Requirements 16.1, 16.4
//
// Strategy: generate arbitrary VALID product inputs (name, price, compare-at
// price, description, features, specifications, FAQ entries, media references,
// trust badges, stock, active state). For each input we:
//   1. createProduct(input)  -> persist it (Req 16.1),
//   2. reload it fresh from MongoDB by id,
//   and assert every persisted field is byte-for-byte equal between the saved
//   document and the reloaded one (round-trip equality).
// A second property additionally exercises active/stock-state toggles
// (Req 16.4): after setProductState the reloaded document must again match the
// in-memory document for all persisted fields, proving the toggled state is
// durably persisted.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import fc from "fast-check";
import { createProduct, setProductState } from "./product.service.js";
import { Product } from "../models/index.js";

/**
 * Every field the catalog persists and that the round-trip must preserve.
 * `createdAt`/`updatedAt`/`__v` are deliberately excluded (bookkeeping), and
 * `slug` + `discountPercent` are derived but still persisted, so they must
 * round-trip identically.
 */
const PERSISTED_FIELDS = Object.freeze([
  "slug",
  "name",
  "price",
  "compareAtPrice",
  "discountPercent",
  "description",
  "features",
  "specifications",
  "faqs",
  "images",
  "video",
  "trustBadges",
  "stock",
  "active",
]);

/**
 * Reduce a Mongoose product document to a plain object of only the persisted
 * fields, normalizing embedded subdocuments to plain key/value shapes via
 * toJSON. Two documents are round-trip equal iff their normalizations match.
 */
function normalize(doc) {
  const json = doc.toJSON();
  const out = {};
  for (const field of PERSISTED_FIELDS) {
    out[field] = json[field];
  }
  // Embedded arrays come back as plain objects from toJSON; strip any stray
  // keys so comparison only considers the declared subdocument shape.
  out.specifications = (out.specifications ?? []).map(({ key, value }) => ({
    key,
    value,
  }));
  out.faqs = (out.faqs ?? []).map(({ question, answer }) => ({
    question,
    answer,
  }));
  return out;
}

// ---- Generators ------------------------------------------------------------

/** A trimmed, non-empty string (safe for schema fields with `trim: true`). */
const trimmedNonEmpty = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter((s) => s.length > 0);

/** A free-form string that survives storage unchanged (no trim on the field). */
const freeString = fc.string({ maxLength: 40 });

/** Non-negative money/quantity values (schema enforces `min: 0`). */
const nonNegInt = fc.integer({ min: 0, max: 1_000_000 });

const specification = fc.record({
  key: trimmedNonEmpty,
  value: trimmedNonEmpty,
});

const faq = fc.record({
  question: trimmedNonEmpty,
  answer: trimmedNonEmpty,
});

/** A media-reference-like filename token (never empty / whitespace-only). */
const mediaRef = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
    { minLength: 1, maxLength: 12 }
  )
  .map((base) => `${base}.webp`);

/** Arbitrary VALID product input accepted by createProduct. */
const productInput = fc.record(
  {
    name: trimmedNonEmpty,
    price: nonNegInt,
    compareAtPrice: nonNegInt,
    description: freeString,
    features: fc.array(freeString, { maxLength: 5 }),
    specifications: fc.array(specification, { maxLength: 4 }),
    faqs: fc.array(faq, { maxLength: 4 }),
    images: fc.array(mediaRef, { maxLength: 5 }),
    video: fc.option(mediaRef.map((m) => m.replace(".webp", ".mp4")), {
      nil: undefined,
    }),
    trustBadges: fc.array(trimmedNonEmpty, { maxLength: 4 }),
    stock: nonNegInt,
    active: fc.boolean(),
  },
  { requiredKeys: ["name", "price", "stock"] }
);

// ---- Tests -----------------------------------------------------------------

describe("Property 29: Product persistence round-trip", () => {
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

  it("saving then reloading a valid product preserves all persisted fields (Req 16.1)", async () => {
    await fc.assert(
      fc.asyncProperty(productInput, async (input) => {
        const saved = await createProduct(input);
        const reloaded = await Product.findById(saved._id);

        expect(reloaded).not.toBeNull();
        expect(normalize(reloaded)).toEqual(normalize(saved));
      }),
      { numRuns: 100 }
    );
  });

  it("active/stock-state toggles persist across a save/reload round-trip (Req 16.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        productInput,
        fc.boolean(),
        nonNegInt,
        async (input, nextActive, nextStock) => {
          const created = await createProduct(input);
          const toggled = await setProductState(created._id, {
            active: nextActive,
            stock: nextStock,
          });

          const reloaded = await Product.findById(created._id);

          expect(reloaded).not.toBeNull();
          // The toggled state is exactly what was requested...
          expect(reloaded.active).toBe(nextActive);
          expect(reloaded.stock).toBe(nextStock);
          // ...and the full reloaded document round-trips against the in-memory
          // post-toggle document for every persisted field.
          expect(normalize(reloaded)).toEqual(normalize(toggled));
        }
      ),
      { numRuns: 100 }
    );
  });
});
