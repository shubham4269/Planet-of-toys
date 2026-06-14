// Feature: planet-of-toys-ecommerce, Property 44: bcrypt password storage round-trip
//
// Property 44: bcrypt password storage round-trip
// "For any administrator password, the stored value is a bcrypt hash distinct
//  from the plaintext, bcrypt.compare(correctPassword, hash) returns true, and
//  bcrypt.compare(anyDifferentPassword, hash) returns false."
//
// Validates: Requirements 14.4, 22.1, 22.2, 22.3
//
// Strategy: generate arbitrary, non-empty printable-ASCII passwords (kept under
// bcrypt's 72-byte significant-input limit so that distinct plaintexts cannot
// collide via truncation). For each password we hash it via the Auth_Service
// and assert three independent invariants on the stored hash:
//   1. The stored hash is not the plaintext and carries the bcrypt envelope
//      ($2a/$2b/$2y + cost + salt) — passwords are stored only as salted bcrypt
//      hashes (Req 14.4, 22.1, 22.2).
//   2. verifyPassword(correctPassword, hash) is true (Req 22.3 round-trip).
//   3. verifyPassword(anyDifferentPassword, hash) is false (Req 22.3 — a
//      different plaintext must not verify).
//
// A reduced bcrypt cost is used purely to keep the property's many iterations
// fast; the algorithm and round-trip semantics under test are identical.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { hashPassword, verifyPassword } from "./auth.service.js";

/** Reduced cost factor: still real bcrypt, fast enough for 100+ iterations. */
const TEST_COST = 4;

/**
 * Printable, non-empty ASCII passwords. Bounded to 64 bytes (< bcrypt's 72-byte
 * limit) so two distinct generated passwords never become equivalent through
 * bcrypt input truncation.
 */
const password = fc.string({
  minLength: 1,
  maxLength: 64,
  unit: fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()-_=+[]{};:,.<>?/".split(
      ""
    )
  ),
});

describe("Property 44: bcrypt password storage round-trip", () => {
  it("stores a salted bcrypt hash that verifies the correct password and rejects a different one", async () => {
    await fc.assert(
      fc.asyncProperty(password, password, async (correct, other) => {
        // Only consider genuinely different second passwords.
        fc.pre(correct !== other);

        const hash = await hashPassword(correct, TEST_COST);

        // Invariant 1: stored value is a salted bcrypt hash, never the plaintext.
        expect(hash).not.toBe(correct);
        expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);

        // Invariant 2: the correct password verifies against its stored hash.
        await expect(verifyPassword(correct, hash)).resolves.toBe(true);

        // Invariant 3: any different password does not verify.
        await expect(verifyPassword(other, hash)).resolves.toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
