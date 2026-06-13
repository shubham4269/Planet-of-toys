import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import { createAuthRouter } from "./auth.router.js";
import { createLoginBruteForce } from "../middleware/loginBruteForce.js";
import { createLimiter } from "../middleware/rateLimiters.js";
import { GENERIC_AUTH_FAILURE_MESSAGE } from "../controllers/auth.controller.js";
import { hashPassword, verifyToken } from "../services/auth.service.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { Admin } from "../models/index.js";

// The router runs against the real (in-memory) MongoDB, the real Admin model,
// and the real bcrypt/JWT auth service. Only the source key for brute-force
// tracking is driven through a test header so distinct "sources" can be
// simulated deterministically without relying on the loopback IP.

const TEST_ENV = {
  JWT_SECRET: "auth-router-test-jwt-secret-please-rotate",
  ENCRYPTION_KEY: "auth-router-test-encryption-key",
  MONGODB_URI: "mongodb://localhost:27017/test",
  SESSION_EXPIRATION: "2h",
};

const REGISTERED_EMAIL = "admin@planetoftoys.test";
const REGISTERED_PASSWORD = "S3cur3-P@ssw0rd!";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Admin.create({
    email: REGISTERED_EMAIL,
    passwordHash: await hashPassword(REGISTERED_PASSWORD),
  });
});

afterEach(async () => {
  await Admin.deleteMany({});
});

/**
 * Build an express app mounting the auth router at `/api/admin`. A custom
 * brute-force tracker keyed by the `x-test-source` header is injected so each
 * test can simulate independent sources; a custom login limiter can be
 * supplied to exercise rate limiting.
 */
function buildApp({ bruteForce, loginLimiter } = {}) {
  const tracker =
    bruteForce ??
    createLoginBruteForce({
      keyGenerator: (req) => req.headers["x-test-source"] ?? "default",
    });

  // Default to a fresh, permissive limiter so the shared module-level login
  // limiter (keyed by the loopback IP) never bleeds state across tests; the
  // rate-limit test supplies its own restrictive limiter.
  const limiter = loginLimiter ?? createLimiter({ windowMs: 60_000, max: 1000 });

  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin",
    createAuthRouter({ bruteForce: tracker, loginLimiter: limiter, env: TEST_ENV })
  );
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}/api/admin/login`, tracker };
}

function post(baseUrl, body, source = "src-a") {
  return fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-source": source },
    body: JSON.stringify(body),
  });
}

describe("auth router - successful login (Req 14.1)", () => {
  it("issues a verifiable JWT for valid credentials", async () => {
    const { server, baseUrl } = buildApp();
    try {
      const res = await post(baseUrl, {
        email: REGISTERED_EMAIL,
        password: REGISTERED_PASSWORD,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.token).toBe("string");

      const decoded = verifyToken(body.token, { env: TEST_ENV });
      expect(decoded.email).toBe(REGISTERED_EMAIL);
      expect(decoded.sub).toBeDefined();

      // No password hash or secret leaks into the response.
      expect(JSON.stringify(body)).not.toContain("passwordHash");
      expect(JSON.stringify(body)).not.toContain(REGISTERED_PASSWORD);
    } finally {
      server.close();
    }
  });

  it("accepts the email case-insensitively", async () => {
    const { server, baseUrl } = buildApp();
    try {
      const res = await post(baseUrl, {
        email: REGISTERED_EMAIL.toUpperCase(),
        password: REGISTERED_PASSWORD,
      });
      expect(res.status).toBe(200);
    } finally {
      server.close();
    }
  });
});

describe("auth router - generic authentication failure (Req 14.2, 25.3, 25.4)", () => {
  it("returns an identical generic 401 for a wrong password and an unregistered email", async () => {
    const { server, baseUrl } = buildApp();
    try {
      const wrongPassword = await post(baseUrl, {
        email: REGISTERED_EMAIL,
        password: "not-the-password",
      });
      const unknownEmail = await post(baseUrl, {
        email: "nobody@planetoftoys.test",
        password: REGISTERED_PASSWORD,
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);

      const wrongBody = await wrongPassword.json();
      const unknownBody = await unknownEmail.json();

      // Same status AND same body shape/content — indistinguishable (Req 25.4).
      expect(wrongBody).toEqual(unknownBody);
      expect(wrongBody.error.message).toBe(GENERIC_AUTH_FAILURE_MESSAGE);
      // The message must not single out one field as the cause; it refers to
      // the credentials generically without saying which was incorrect.
      expect(wrongBody.error.message.toLowerCase()).not.toMatch(
        /email (not|is|was|does)|no such (user|account|email)|unknown email|wrong password|incorrect password|password is/
      );
    } finally {
      server.close();
    }
  });

  it("returns the same generic 401 for missing credentials", async () => {
    const { server, baseUrl } = buildApp();
    try {
      const noBody = await post(baseUrl, {});
      expect(noBody.status).toBe(401);
      const body = await noBody.json();
      expect(body.error.message).toBe(GENERIC_AUTH_FAILURE_MESSAGE);
    } finally {
      server.close();
    }
  });
});

describe("auth router - brute-force source blocking (Req 25.2)", () => {
  it("blocks a source after failures exceed the threshold, leaving other sources unaffected", async () => {
    const bruteForce = createLoginBruteForce({
      threshold: 2,
      windowMs: 60_000,
      keyGenerator: (req) => req.headers["x-test-source"] ?? "default",
    });
    const { server, baseUrl } = buildApp({ bruteForce });
    try {
      const bad = { email: REGISTERED_EMAIL, password: "wrong" };

      // Three failures from src-a: each processed and rejected as generic 401.
      for (let i = 0; i < 3; i += 1) {
        const r = await post(baseUrl, bad, "src-a");
        expect(r.status).toBe(401);
      }

      // The next attempt from src-a exceeds the threshold and is blocked (429),
      // even with otherwise-valid credentials.
      const blocked = await post(
        baseUrl,
        { email: REGISTERED_EMAIL, password: REGISTERED_PASSWORD },
        "src-a"
      );
      expect(blocked.status).toBe(429);
      const blockedBody = await blocked.json();
      expect(JSON.stringify(blockedBody)).not.toContain("password");

      // A different source is unaffected and can still authenticate.
      const other = await post(
        baseUrl,
        { email: REGISTERED_EMAIL, password: REGISTERED_PASSWORD },
        "src-b"
      );
      expect(other.status).toBe(200);
    } finally {
      server.close();
    }
  });

  it("clears the failure counter on a successful login", async () => {
    const bruteForce = createLoginBruteForce({
      threshold: 2,
      windowMs: 60_000,
      keyGenerator: (req) => req.headers["x-test-source"] ?? "default",
    });
    const { server, baseUrl } = buildApp({ bruteForce });
    try {
      // Two failures (count reaches the threshold but does not exceed it).
      await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" }, "src-c");
      await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" }, "src-c");

      // A successful login resets the counter for that source.
      const ok = await post(
        baseUrl,
        { email: REGISTERED_EMAIL, password: REGISTERED_PASSWORD },
        "src-c"
      );
      expect(ok.status).toBe(200);

      // Subsequent failures start a fresh window — not immediately blocked.
      const again = await post(
        baseUrl,
        { email: REGISTERED_EMAIL, password: "wrong" },
        "src-c"
      );
      expect(again.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("allows attempts again once the block window elapses", async () => {
    let clock = 1_000;
    const bruteForce = createLoginBruteForce({
      threshold: 1,
      windowMs: 10_000,
      now: () => clock,
      keyGenerator: (req) => req.headers["x-test-source"] ?? "default",
    });
    const { server, baseUrl } = buildApp({ bruteForce });
    try {
      // Two failures push the count above the threshold of 1 -> blocked.
      await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" }, "src-d");
      await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" }, "src-d");

      const blocked = await post(
        baseUrl,
        { email: REGISTERED_EMAIL, password: REGISTERED_PASSWORD },
        "src-d"
      );
      expect(blocked.status).toBe(429);

      // Advance past the window — the source may try again.
      clock += 10_001;
      const allowed = await post(
        baseUrl,
        { email: REGISTERED_EMAIL, password: REGISTERED_PASSWORD },
        "src-d"
      );
      expect(allowed.status).toBe(200);
    } finally {
      server.close();
    }
  });
});

describe("auth router - login rate limiting (Req 25.1)", () => {
  it("applies a rate limiter to the login route", async () => {
    const loginLimiter = createLimiter({ windowMs: 60_000, max: 2 });
    const { server, baseUrl } = buildApp({ loginLimiter });
    try {
      // The limiter exposes standard RateLimit-* headers when engaged.
      const first = await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" });
      expect(first.headers.get("ratelimit-limit")).toBe("2");

      // Exceeding the per-window maximum yields the generic 429 rate-limit body.
      await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" });
      const limited = await post(baseUrl, { email: REGISTERED_EMAIL, password: "wrong" });
      expect(limited.status).toBe(429);
    } finally {
      server.close();
    }
  });
});
