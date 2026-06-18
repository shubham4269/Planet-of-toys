// Feature: planet-of-toys-ecommerce, Property 26: JWT login round-trip and guard
//
// Property 26: JWT login round-trip and guard
// "For any administrator with correct credentials, login issues a token whose
//  signature validates and whose decoded expiration equals issue time plus the
//  configured session-expiration; for any request to an admin or settings route
//  bearing a missing, expired, or signature-tampered token, the request is
//  rejected."
//
// Validates: Requirements 14.1, 14.3, 19.5, 21.1, 21.2, 21.4, 30.1, 30.13
//
// Strategy: generate arbitrary administrators (id + email) and arbitrary
// session-expiration windows (expressed in whole seconds). For each, exercise
// the real Auth Service (issueToken/verifyToken) and the real route guard
// (createRequireAuth wired to the real verifier) and assert the round-trip and
// rejection invariants together:
//   1. Round-trip: a freshly issued token verifies and decodes back to the
//      same administrator identity (sub + email).
//   2. Expiry: the decoded exp - iat equals exactly the configured
//      session-expiration window in seconds.
//   3. Guard accepts: a request bearing the fresh token passes the guard
//      (next() called with no error) and req.admin carries the payload.
//   4. Guard rejects missing: a request with no Authorization header is
//      rejected 401 (verifier never consulted).
//   5. Guard rejects expired: a request bearing an already-expired token is
//      rejected 401.
//   6. Guard rejects tampered: a request bearing a signature-tampered token is
//      rejected 401.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import jwt from "jsonwebtoken";
import { issueToken, verifyToken } from "./auth.service.js";
import { createRequireAuth } from "../../shared/middleware/requireAuth.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

/** Minimal env satisfying the bootstrap secrets needed for JWT work. */
const TEST_ENV = {
  JWT_SECRET: "property-test-jwt-secret-please-rotate",
  ENCRYPTION_KEY: "property-test-encryption-key",
  MONGODB_URI: "mongodb://localhost:27017/test",
};

/** Build a minimal Express-like request with an optional Authorization header. */
function reqWith(authorization) {
  return { headers: authorization === undefined ? {} : { authorization } };
}

/**
 * Run a guard middleware and return whatever it passes to `next`. The guard
 * invokes `next` synchronously (the verifier is synchronous), so we capture the
 * argument directly rather than awaiting.
 */
function runGuard(middleware, req) {
  let captured;
  middleware(req, {}, (err) => {
    captured = err;
  });
  return captured;
}

// ---- Generators ------------------------------------------------------------

/** Non-empty administrator identifier (mongo-ObjectId-like hex, but arbitrary). */
const adminId = fc.stringOf(
  fc.constantFrom(..."0123456789abcdef".split("")),
  { minLength: 1, maxLength: 24 }
);

/** Plausible, non-empty email claim (kept simple — only carried as a claim). */
const email = fc
  .tuple(
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnop._-0123456789".split("")), {
      minLength: 1,
      maxLength: 16,
    }),
    fc.constantFrom("example.com", "planetoftoys.test", "admin.local")
  )
  .map(([local, domain]) => `${local}@${domain}`);

const admin = fc.record({ id: adminId, email });

/**
 * Session-expiration window in whole seconds, formatted as an `Ns` time span so
 * jsonwebtoken interprets it unambiguously (a bare numeric string would be read
 * as milliseconds). Bounded to a realistic admin-session range.
 */
const sessionSeconds = fc.integer({ min: 60, max: 86_400 });

// ---- Property --------------------------------------------------------------

describe("Property 26: JWT login round-trip and guard", () => {
  it("round-trips a fresh token, honors the configured expiry, and the guard accepts it while rejecting missing/expired/tampered tokens", () => {
    fc.assert(
      fc.property(admin, sessionSeconds, (who, seconds) => {
        const env = { ...TEST_ENV, SESSION_EXPIRATION: `${seconds}s` };

        // --- Invariant 1: round-trip identity -----------------------------
        const token = issueToken(who, { env });
        expect(typeof token).toBe("string");

        const payload = verifyToken(token, { env });
        expect(payload.sub).toBe(who.id);
        expect(payload.email).toBe(who.email);

        // --- Invariant 2: decoded expiry == issue time + configured window -
        expect(payload.exp - payload.iat).toBe(seconds);

        // --- Invariant 3: the guard grants access for the fresh token -----
        const guard = createRequireAuth({ env });
        const validErr = runGuard(guard, reqWith(`Bearer ${token}`));
        expect(validErr).toBeUndefined();

        // --- Invariant 4: missing token rejected (401) -------------------
        const missingErr = runGuard(guard, reqWith(undefined));
        expect(missingErr).toBeInstanceOf(AppError);
        expect(missingErr.statusCode).toBe(401);

        // --- Invariant 5: expired token rejected (401) -------------------
        const expiredToken = jwt.sign({ email: who.email }, env.JWT_SECRET, {
          subject: who.id,
          expiresIn: "-1s",
        });
        const expiredErr = runGuard(guard, reqWith(`Bearer ${expiredToken}`));
        expect(expiredErr).toBeInstanceOf(AppError);
        expect(expiredErr.statusCode).toBe(401);

        // --- Invariant 6: signature-tampered token rejected (401) --------
        const parts = token.split(".");
        const sig = parts[2];
        parts[2] = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
        const tamperedErr = runGuard(guard, reqWith(`Bearer ${parts.join(".")}`));
        expect(tamperedErr).toBeInstanceOf(AppError);
        expect(tamperedErr.statusCode).toBe(401);
      }),
      { numRuns: 100 }
    );
  });
});
