import { describe, it, expect, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from "./database.js";

describe("database connection", () => {
  let mongod;

  afterEach(async () => {
    await disconnectDatabase();
    if (mongod) {
      await mongod.stop();
      mongod = undefined;
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it("connects to MongoDB and reports connected state", async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
    expect(isDatabaseConnected()).toBe(true);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it("reuses the existing connection on repeated connect calls", async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
    // Second call should be a no-op that returns the same connected instance.
    await connectDatabase(mongod.getUri());
    expect(isDatabaseConnected()).toBe(true);
  });

  it("disconnects cleanly and reports disconnected state", async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
    await disconnectDatabase();
    expect(isDatabaseConnected()).toBe(false);
  });

  it("disconnect is safe to call when not connected", async () => {
    await expect(disconnectDatabase()).resolves.toBeUndefined();
  });

  it("throws when no connection string is configured", async () => {
    const prev = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    await expect(connectDatabase()).rejects.toThrow(/MONGODB_URI/);
    if (prev !== undefined) {
      process.env.MONGODB_URI = prev;
    }
  });
});
