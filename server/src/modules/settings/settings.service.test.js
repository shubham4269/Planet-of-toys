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
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  createSettingsService,
  SettingsValidationError,
  maskValue,
} from "./settings.service.js";
import { decrypt } from "./credential.service.js";
import { SystemSettings } from "../../models/index.js";

// getMaskedSettings/updateSection persist to SystemSettings, so an in-memory
// MongoDB is started. The encrypt function uses an env-sourced key, and the
// live verifiers are always mocked so no real network call is ever made.

const TEST_KEY = "settings-service-test-encryption-key";

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
  for (const k of [
    "ENCRYPTION_KEY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "SHIPROCKET_EMAIL",
    "SHIPROCKET_PASSWORD",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "META_PIXEL_ID",
  ]) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(async () => {
  await SystemSettings.deleteMany({});
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/** A service whose live verifiers always succeed unless overridden. */
function makeService(overrides = {}) {
  return createSettingsService({
    verifiers: {
      razorpay: async () => true,
      shiprocket: async () => true,
      whatsapp: async () => true,
      metaPixel: async () => true,
      ...overrides.verifiers,
    },
    ...overrides,
  });
}

describe("settings service - maskValue", () => {
  it("returns null for empty/blank values", () => {
    expect(maskValue("")).toBeNull();
    expect(maskValue("   ")).toBeNull();
    expect(maskValue(undefined)).toBeNull();
  });

  it("never reveals the full plaintext and exposes at most a suffix", () => {
    const secret = "rzp_live_AbCdEf123456";
    const masked = maskValue(secret);
    expect(masked).not.toBe(secret);
    expect(masked).not.toContain("rzp_live_AbCdEf");
    expect(masked.endsWith("3456")).toBe(true);
  });
});

describe("settings service - getMaskedSettings (Req 30.8, 30.9, 30.20)", () => {
  it("returns every section with no secret values", async () => {
    const service = makeService();
    await service.updateSection("razorpay", {
      keyId: "rzp_test_AbC123def456",
      keySecret: "abcdefghij1234567890",
    });

    const settings = await service.getMaskedSettings();

    // Secret field exposes only `configured`, never a value.
    expect(settings.razorpay.keySecret).toEqual({ configured: true });
    expect("masked" in settings.razorpay.keySecret).toBe(false);

    // Non-secret field is masked but configured.
    expect(settings.razorpay.keyId.configured).toBe(true);
    expect(settings.razorpay.keyId.masked).not.toContain("rzp_test_AbC123");

    // No part of the serialized response contains the secret.
    expect(JSON.stringify(settings)).not.toContain("abcdefghij1234567890");
  });

  it("reports unconfigured sections with configured=false", async () => {
    const service = makeService();
    const settings = await service.getMaskedSettings();
    expect(settings.shiprocket.email.configured).toBe(false);
    expect(settings.shiprocket.password).toEqual({ configured: false });
    expect(settings.metaPixel.pixelId.configured).toBe(false);
  });
});

describe("settings service - updateSection encrypt + persist (Req 30.7)", () => {
  it("encrypts secret fields at rest and stores non-secret fields as-is", async () => {
    const service = makeService();
    await service.updateSection("shiprocket", {
      email: "ops@planetoftoys.test",
      password: "super-secret-pw",
    });

    const raw = await SystemSettings.findOne().lean();
    // Plaintext password is never stored.
    expect(raw.shiprocket.passwordEnc).toBeTruthy();
    expect(raw.shiprocket.passwordEnc).not.toContain("super-secret-pw");
    expect(decrypt(raw.shiprocket.passwordEnc)).toBe("super-secret-pw");
    // Non-secret email stored as-is.
    expect(raw.shiprocket.email).toBe("ops@planetoftoys.test");
  });

  it("supports partial updates without clobbering other fields", async () => {
    const service = makeService();
    await service.updateSection("whatsapp", {
      phoneNumberId: "123456789012345",
      accessToken: "EAAabcdefghijklmnop12345",
      verifyToken: "verify-token-1",
    });
    await service.updateSection("whatsapp", { phoneNumberId: "999888777666555" });

    const raw = await SystemSettings.findOne().lean();
    expect(raw.whatsapp.phoneNumberId).toBe("999888777666555");
    // The previously-set token is preserved.
    expect(decrypt(raw.whatsapp.accessTokenEnc)).toBe("EAAabcdefghijklmnop12345");
  });

  it("records an audit entry with field names but no values (Req 30.12)", async () => {
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const service = makeService();

    await service.updateSection(
      "metaPixel",
      { pixelId: "1234567890123456" },
      { adminId: "admin-1", recordAudit }
    );

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const entry = recordAudit.mock.calls[0][0];
    expect(entry.action).toBe("settings.update");
    expect(entry.adminId).toBe("admin-1");
    expect(entry.metadata.section).toBe("metaPixel");
    expect(entry.metadata.fields).toEqual(["pixelId"]);
    // The audit entry carries no credential value.
    expect(JSON.stringify(entry)).not.toContain("1234567890123456");
  });
});

describe("settings service - invalid formats rejected without persistence (Req 30.14)", () => {
  it("throws and persists nothing for an invalid key id", async () => {
    const service = makeService();
    await expect(
      service.updateSection("razorpay", { keyId: "not-a-key", keySecret: "abcdefghij1234567890" })
    ).rejects.toBeInstanceOf(SettingsValidationError);

    const raw = await SystemSettings.findOne().lean();
    expect(raw).toBeNull();
  });

  it("rejects an unknown field", async () => {
    const service = makeService();
    await expect(
      service.updateSection("razorpay", { bogus: "x" })
    ).rejects.toBeInstanceOf(SettingsValidationError);
  });

  it("rejects an unknown section with a 404 status", async () => {
    const service = makeService();
    await expect(service.updateSection("paypal", { foo: "bar" })).rejects.toMatchObject({
      name: "SettingsValidationError",
      statusCode: 404,
    });
  });

  it("does not partially persist when one field of many is invalid", async () => {
    const service = makeService();
    await expect(
      service.updateSection("shiprocket", {
        email: "ops@planetoftoys.test",
        password: "short", // too short -> invalid
      })
    ).rejects.toBeInstanceOf(SettingsValidationError);
    expect(await SystemSettings.findOne().lean()).toBeNull();
  });
});

describe("settings service - verifySection (Req 30.16, 30.19, 30.20)", () => {
  it("returns a positive result with no secrets when the live test passes", async () => {
    const razorpay = vi.fn().mockResolvedValue(true);
    const service = makeService({ verifiers: { razorpay } });

    const result = await service.verifySection("razorpay", {
      keyId: "rzp_test_AbC123def456",
      keySecret: "abcdefghij1234567890",
    });

    expect(result).toEqual({
      section: "razorpay",
      verified: true,
      message: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain("abcdefghij1234567890");
    expect(razorpay).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: "rzp_test_AbC123def456" })
    );
  });

  it("returns verified=false when the live test fails", async () => {
    const service = makeService({ verifiers: { shiprocket: async () => false } });
    const result = await service.verifySection("shiprocket", {
      email: "ops@planetoftoys.test",
      password: "super-secret-pw",
    });
    expect(result.verified).toBe(false);
  });

  it("rejects an invalid format before attempting any connection", async () => {
    const whatsapp = vi.fn();
    const service = makeService({ verifiers: { whatsapp } });
    await expect(
      service.verifySection("whatsapp", { phoneNumberId: "abc", accessToken: "EAAabcdefghijklmnop12345" })
    ).rejects.toBeInstanceOf(SettingsValidationError);
    expect(whatsapp).not.toHaveBeenCalled();
  });

  it("reports incomplete credentials without throwing", async () => {
    const service = makeService();
    const result = await service.verifySection("razorpay", {});
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/incomplete/i);
  });

  it("swallows verifier errors and returns a generic failure", async () => {
    const service = makeService({
      verifiers: {
        razorpay: async () => {
          throw new Error("boom: api key rzp_live_SECRET leaked");
        },
      },
    });
    const result = await service.verifySection("razorpay", {
      keyId: "rzp_test_AbC123def456",
      keySecret: "abcdefghij1234567890",
    });
    expect(result.verified).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
