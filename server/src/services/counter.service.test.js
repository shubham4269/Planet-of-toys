import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { nextOrderId, randomOrderCode } from "./counter.service.js";
import { Counter } from "../models/index.js";

/**
 * Order ids are short branded codes (`POT-XXXXX`) drawn from an unambiguous
 * alphabet and made unique by atomically reserving each code in the Counter
 * collection (Req 8.2, 8.3).
 */

// 5 characters from the alphabet without 0/O, 1/I, L.
const ID_FORMAT = /^POT-[2-9A-HJKMNP-Z]{5}$/;

describe("counter service - nextOrderId", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Counter.deleteMany({});
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  it("formats the identifier as POT-XXXXX from the unambiguous alphabet", async () => {
    const id = await nextOrderId();
    expect(id).toMatch(ID_FORMAT);
  });

  it("never uses ambiguous characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(randomOrderCode()).not.toMatch(/[0O1IL]/);
    }
  });

  it("reserves each generated code so it can never be issued twice", async () => {
    const id = await nextOrderId();
    const code = id.replace(/^POT-/, "");
    const reservation = await Counter.findById(`order-id-${code}`).lean();
    expect(reservation).not.toBeNull();
  });

  it("assigns distinct identifiers to concurrent generations", async () => {
    const ids = await Promise.all(
      Array.from({ length: 50 }, () => nextOrderId())
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("retries with a fresh code when a collision occurs", async () => {
    const duplicate = Object.assign(new Error("E11000 duplicate key"), {
      code: 11000,
    });
    const createSpy = vi
      .spyOn(Counter, "create")
      .mockRejectedValueOnce(duplicate);

    const id = await nextOrderId();

    expect(id).toMatch(ID_FORMAT);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("propagates non-duplicate persistence failures", async () => {
    vi.spyOn(Counter, "create").mockRejectedValue(new Error("db down"));
    await expect(nextOrderId()).rejects.toThrow("db down");
  });
});
