// Feature: planet-of-toys-ecommerce, Property 15: Order identifier format is well-formed — every generated identifier matches ^POT-[2-9A-HJKMNP-Z]{5}$ (branded prefix + 5-character unambiguous code)
import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { nextOrderId, randomOrderCode } from "./counter.service.js";
import { Counter } from "../models/index.js";

/**
 * Property 15: Order identifier format is well-formed.
 *
 * Every generated identifier is the branded prefix `POT-` followed by exactly
 * five characters drawn from the unambiguous alphabet (no 0/O, 1/I, or L),
 * matching `^POT-[2-9A-HJKMNP-Z]{5}$`.
 *
 * Validates: Requirements 8.1
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

const ID_FORMAT = /^POT-[2-9A-HJKMNP-Z]{5}$/;
const AMBIGUOUS = /[0O1IL]/;

describe("Property 15: order identifier format is well-formed", () => {
  it("every generated identifier matches POT-XXXXX with the unambiguous alphabet", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (count) => {
        const ids = await Promise.all(
          Array.from({ length: count }, () => nextOrderId())
        );
        for (const id of ids) {
          expect(id).toMatch(ID_FORMAT);
          // The code segment (after the "POT-" prefix, which itself contains
          // an O) never uses ambiguous characters.
          expect(id.slice(4)).not.toMatch(AMBIGUOUS);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("raw codes are always well-formed regardless of randomness", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), () => {
        const code = randomOrderCode();
        expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}$/);
      }),
      { numRuns: 500 }
    );
  });
});
