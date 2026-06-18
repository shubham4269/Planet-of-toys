import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createSettingsRouter } from "./settings.router.js";
import { createSettingsService } from "./settings.service.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import { SystemSettings } from "../../models/index.js";

// The router persists through the real (in-memory) MongoDB and the real
// encrypt function; only the live verifiers are mocked so no network call is
// made. Auth is exercised via an injected guard.

const TEST_KEY = "settings-router-test-encryption-key";

let mongod;
const savedEnv = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(() => {
  savedEnv.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(async () => {
  await SystemSettings.deleteMany({});
  if (savedEnv.ENCRYPTION_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = savedEnv.ENCRYPTION_KEY;
  vi.restoreAllMocks();
});

/**
 * Build an express app mounting the settings router at the design's base path.
 * `authorized` toggles whether the injected guard allows the request through.
 */
function buildApp({ authorized = true, recordAudit } = {}) {
  const settingsService = createSettingsService({
    verifiers: {
      razorpay: async () => true,
      shiprocket: async () => true,
      whatsapp: async () => true,
      metaPixel: async () => true,
    },
  });

  const requireAuth = (req, res, next) => {
    if (!authorized) {
      return res.status(401).json({ error: { message: "Authentication is required.", status: 401 } });
    }
    req.admin = { id: "admin-1" };
    next();
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/settings",
    createSettingsRouter({ requireAuth, settingsService, recordAudit })
  );
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}/api/admin/settings` };
}

describe("settings router - auth guard (Req 30.1, 30.13)", () => {
  it("denies unauthenticated access to every route", async () => {
    const { server, baseUrl } = buildApp({ authorized: false });
    try {
      const get = await fetch(baseUrl);
      expect(get.status).toBe(401);

      const put = await fetch(`${baseUrl}/razorpay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: "rzp_test_AbC123def456" }),
      });
      expect(put.status).toBe(401);

      const verify = await fetch(`${baseUrl}/razorpay/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(verify.status).toBe(401);
    } finally {
      server.close();
    }
  });
});

describe("settings router - GET / PUT / verify (Req 30.8, 30.14, 30.20)", () => {
  it("returns masked settings and round-trips an update", async () => {
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const { server, baseUrl } = buildApp({ recordAudit });
    try {
      // Initially empty.
      let res = await fetch(baseUrl);
      expect(res.status).toBe(200);
      let body = await res.json();
      expect(body.settings.razorpay.keyId.configured).toBe(false);

      // Update Razorpay.
      res = await fetch(`${baseUrl}/razorpay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyId: "rzp_test_AbC123def456",
          keySecret: "abcdefghij1234567890",
        }),
      });
      expect(res.status).toBe(200);
      body = await res.json();
      expect(body.settings.razorpay.keySecret).toEqual({ configured: true });
      // No secret in the response body.
      const text = JSON.stringify(body);
      expect(text).not.toContain("abcdefghij1234567890");

      // An audit entry was recorded.
      expect(recordAudit).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  });

  it("rejects an invalid format with 400 and persists nothing", async () => {
    const { server, baseUrl } = buildApp();
    try {
      const res = await fetch(`${baseUrl}/metaPixel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId: "not-numeric" }),
      });
      expect(res.status).toBe(400);
      expect(await SystemSettings.findOne().lean()).toBeNull();
    } finally {
      server.close();
    }
  });

  it("verifies credentials live without leaking secrets", async () => {
    const { server, baseUrl } = buildApp();
    try {
      const res = await fetch(`${baseUrl}/shiprocket/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ops@planetoftoys.test", password: "super-secret-pw" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        section: "shiprocket",
        verified: true,
        message: expect.any(String),
      });
      expect(JSON.stringify(body)).not.toContain("super-secret-pw");
    } finally {
      server.close();
    }
  });
});
