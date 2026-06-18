// Feature: planet-of-toys-ecommerce, Property 16: Order identifiers are unique
import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { nextOrderId } from "./counter.service.js";
import Counter from "./counter.model.js";

/**
 * Property 16: Order identifiers are unique.
 *
 * For any sequence of order creations (including concurrent creations), all
 * generated order identifiers are distinct. Each random code is reserved with
 * an atomic insert against the Counter collection's unique `_id` index, so a
 * code can be claimed by exactly one caller; collisions are redrawn.
 *
 * Validates: Requirements 8.2, 8.3
 */

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await Counter.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("Property 16: order identifiers are unique", () => {
  it("assigns distinct identifiers across concurrent generation", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 40 }), async (count) => {
        const ids = await Promise.all(
          Array.from({ length: count }, () => nextOrderId())
        );
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 50 }
    );
  });

  it("assigns distinct identifiers across sequential batches (reservations persist)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 10 }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (batchSizes) => {
          const all = [];
          for (const size of batchSizes) {
            const ids = await Promise.all(
              Array.from({ length: size }, () => nextOrderId())
            );
            all.push(...ids);
          }
          expect(new Set(all).size).toBe(all.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});
