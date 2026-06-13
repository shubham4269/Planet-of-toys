import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  BCRYPT_COST,
  PasswordError,
  AuthConfigError,
  TokenError,
} from "./auth.service.js";

/** Minimal env that satisfies the bootstrap secrets needed for JWT work. */
const TEST_ENV = {
  JWT_SECRET: "unit-test-jwt-secret-please-rotate",
  ENCRYPTION_KEY: "unit-test-encryption-key",
  MONGODB_URI: "mongodb://localhost:27017/test",
};

describe("auth service - password hashing and verification", () => {
  it("produces a bcrypt hash that is not the plaintext", async () => {
    const password = "S3cur3-P@ssw0rd";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    // bcrypt hashes start with the $2 algorithm prefix and embed the cost.
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).toContain(`$${String(BCRYPT_COST).padStart(2, "0")}$`);
  });

  it("verifies a correct password against its hash", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("the-real-password");
    await expect(verifyPassword("a-wrong-password", hash)).resolves.toBe(false);
  });

  it("produces distinct hashes for the same password (random salt)", async () => {
    const password = "same-password";
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(a).not.toBe(b);
    // Both still verify against the original plaintext.
    await expect(verifyPassword(password, a)).resolves.toBe(true);
    await expect(verifyPassword(password, b)).resolves.toBe(true);
  });

  it("is compatible with hashes produced directly by bcrypt", async () => {
    const password = "interop-check";
    const hash = await bcrypt.hash(password, 10);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("returns false for a missing or malformed stored hash", async () => {
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-bcrypt-hash")).resolves.toBe(
      false
    );
    // Non-string hash inputs are treated as a non-match, never thrown.
    await expect(verifyPassword("anything", undefined)).resolves.toBe(false);
  });

  it("rejects empty or non-string passwords when hashing", async () => {
    await expect(hashPassword("")).rejects.toBeInstanceOf(PasswordError);
    await expect(hashPassword(undefined)).rejects.toBeInstanceOf(PasswordError);
  });
});

describe("auth service - JWT issuance and validation", () => {
  const admin = { id: "507f1f77bcf86cd799439011", email: "admin@example.com" };

  it("issues a signed token carrying the admin id (sub) and email (Req 14.1)", () => {
    const token = issueToken(admin, { env: TEST_ENV });
    expect(typeof token).toBe("string");

    const decoded = jwt.verify(token, TEST_ENV.JWT_SECRET);
    expect(decoded.sub).toBe(admin.id);
    expect(decoded.email).toBe(admin.email);
  });

  it("sets an expiry from the configured SESSION_EXPIRATION (Req 21.1)", () => {
    const token = issueToken(admin, {
      env: { ...TEST_ENV, SESSION_EXPIRATION: "1h" },
    });
    const decoded = jwt.verify(token, TEST_ENV.JWT_SECRET);
    // exp - iat should equal the configured one-hour window (in seconds).
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it("round-trips: a freshly issued token verifies successfully (Req 14.3)", () => {
    const token = issueToken(admin, { env: TEST_ENV });
    const payload = verifyToken(token, { env: TEST_ENV });
    expect(payload.sub).toBe(admin.id);
    expect(payload.email).toBe(admin.email);
  });

  it("accepts the Mongoose-style _id when no id is present", () => {
    const token = issueToken(
      { _id: "abc123", email: "a@b.com" },
      { env: TEST_ENV }
    );
    expect(verifyToken(token, { env: TEST_ENV }).sub).toBe("abc123");
  });

  it("rejects a missing/empty token as 'missing' (Req 14.3, 19.5)", () => {
    expect(() => verifyToken(undefined, { env: TEST_ENV })).toThrowError(
      TokenError
    );
    expect(() => verifyToken("", { env: TEST_ENV })).toThrowError(TokenError);
    try {
      verifyToken("   ", { env: TEST_ENV });
    } catch (err) {
      expect(err.code).toBe("missing");
    }
  });

  it("rejects an expired token as 'expired' (Req 21.2)", () => {
    // Sign a token that is already expired.
    const expired = jwt.sign({ email: admin.email }, TEST_ENV.JWT_SECRET, {
      subject: admin.id,
      expiresIn: "-1s",
    });
    try {
      verifyToken(expired, { env: TEST_ENV });
      throw new Error("expected verifyToken to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect(err.code).toBe("expired");
    }
  });

  it("rejects a tampered/invalid-signature token as 'invalid' (Req 21.4)", () => {
    const token = issueToken(admin, { env: TEST_ENV });
    // Flip the final character of the signature segment.
    const parts = token.split(".");
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith("a") ? "b" : "a");
    const tampered = parts.join(".");
    try {
      verifyToken(tampered, { env: TEST_ENV });
      throw new Error("expected verifyToken to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect(err.code).toBe("invalid");
    }
  });

  it("rejects a token signed with a different secret as 'invalid' (Req 21.4)", () => {
    const foreign = jwt.sign({ email: admin.email }, "some-other-secret", {
      subject: admin.id,
      expiresIn: "1h",
    });
    try {
      verifyToken(foreign, { env: TEST_ENV });
      throw new Error("expected verifyToken to throw");
    } catch (err) {
      expect(err.code).toBe("invalid");
    }
  });

  it("rejects a garbage / malformed token as 'invalid'", () => {
    try {
      verifyToken("not-a-jwt", { env: TEST_ENV });
      throw new Error("expected verifyToken to throw");
    } catch (err) {
      expect(err.code).toBe("invalid");
    }
  });

  it("throws AuthConfigError when JWT_SECRET is not configured", () => {
    const env = { ENCRYPTION_KEY: "x", MONGODB_URI: "x" };
    expect(() => issueToken(admin, { env })).toThrowError(AuthConfigError);
    const token = issueToken(admin, { env: TEST_ENV });
    expect(() => verifyToken(token, { env })).toThrowError(AuthConfigError);
  });

  it("requires an admin object with an identifier", () => {
    expect(() => issueToken(null, { env: TEST_ENV })).toThrowError(
      AuthConfigError
    );
    expect(() =>
      issueToken({ email: "no-id@example.com" }, { env: TEST_ENV })
    ).toThrowError(AuthConfigError);
  });
});
