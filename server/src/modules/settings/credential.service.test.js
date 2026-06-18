import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  encrypt,
  decrypt,
  getCredential,
  CredentialCryptoError,
} from "./credential.service.js";
import { SystemSettings } from "../../models/index.js";

const TEST_KEY = "unit-test-encryption-key-please-rotate";

describe("credential service - encrypt/decrypt (AES-256-GCM)", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = savedEnv;
  });

  it("round-trips a plaintext credential", () => {
    const secret = "rzp_live_sup3rSecret";
    const envelope = encrypt(secret);
    expect(decrypt(envelope)).toBe(secret);
  });

  it("produces ciphertext distinct from the plaintext", () => {
    const secret = "shiprocket-password-123";
    const envelope = encrypt(secret);
    expect(envelope).not.toContain(secret);
    expect(envelope.startsWith("v1:")).toBe(true);
  });

  it("produces a different envelope each time (random IV)", () => {
    const secret = "same-input";
    const a = encrypt(secret);
    const b = encrypt(secret);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(secret);
    expect(decrypt(b)).toBe(secret);
  });

  it("handles empty strings and unicode", () => {
    expect(decrypt(encrypt(""))).toBe("");
    const unicode = "clé-🔐-秘密";
    expect(decrypt(encrypt(unicode))).toBe(unicode);
  });

  it("detects tampering via the GCM auth tag", () => {
    const envelope = encrypt("tamper-me");
    const [v, iv, tag, ct] = envelope.split(":");
    // Flip a byte in the ciphertext segment.
    const corruptCt = Buffer.from(ct, "base64");
    corruptCt[0] ^= 0xff;
    const tampered = [v, iv, tag, corruptCt.toString("base64")].join(":");
    expect(() => decrypt(tampered)).toThrow(CredentialCryptoError);
  });

  it("fails to decrypt with a different key", () => {
    const envelope = encrypt("secret-value");
    process.env.ENCRYPTION_KEY = "a-completely-different-key";
    expect(() => decrypt(envelope)).toThrow(CredentialCryptoError);
  });

  it("rejects malformed envelopes", () => {
    expect(() => decrypt("not-an-envelope")).toThrow(CredentialCryptoError);
    expect(() => decrypt("v2:a:b:c")).toThrow(CredentialCryptoError);
  });

  it("throws when ENCRYPTION_KEY is absent", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(CredentialCryptoError);
  });
});

describe("credential service - getCredential precedence (Req 29.2)", () => {
  let mongod;
  const savedEnv = {};

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  beforeEach(() => {
    for (const k of [
      "ENCRYPTION_KEY",
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "SHIPROCKET_EMAIL",
      "WHATSAPP_ACCESS_TOKEN",
    ]) {
      savedEnv[k] = process.env[k];
    }
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(async () => {
    await SystemSettings.deleteMany({});
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("returns the decrypted System_Settings value when present", async () => {
    await SystemSettings.create({
      razorpay: { keyId: "rzp_id_stored", keySecretEnc: encrypt("stored-secret") },
    });
    process.env.RAZORPAY_KEY_SECRET = "env-secret";

    expect(await getCredential("razorpay", "keySecret")).toBe("stored-secret");
  });

  it("falls back to the environment variable when no stored value", async () => {
    process.env.RAZORPAY_KEY_SECRET = "env-secret";
    expect(await getCredential("razorpay", "keySecret")).toBe("env-secret");
  });

  it("returns plaintext stored value for non-encrypted fields", async () => {
    await SystemSettings.create({ razorpay: { keyId: "rzp_id_stored" } });
    process.env.RAZORPAY_KEY_ID = "env-id";
    expect(await getCredential("razorpay", "keyId")).toBe("rzp_id_stored");
  });

  it("falls back to env for non-encrypted fields when not stored", async () => {
    process.env.RAZORPAY_KEY_ID = "env-id";
    expect(await getCredential("razorpay", "keyId")).toBe("env-id");
  });

  it("treats blank stored values as absent and uses env fallback", async () => {
    await SystemSettings.create({ shiprocket: { email: "   " } });
    process.env.SHIPROCKET_EMAIL = "ops@example.com";
    expect(await getCredential("shiprocket", "email")).toBe("ops@example.com");
  });

  it("returns null when neither source provides a value", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    expect(await getCredential("whatsapp", "accessToken")).toBeNull();
  });

  it("rejects unknown sections and keys", async () => {
    await expect(getCredential("unknown", "x")).rejects.toThrow(
      CredentialCryptoError
    );
    await expect(getCredential("razorpay", "nope")).rejects.toThrow(
      CredentialCryptoError
    );
  });
});
