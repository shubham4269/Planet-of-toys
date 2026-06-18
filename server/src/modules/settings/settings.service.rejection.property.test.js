// Feature: planet-of-toys-ecommerce, Property 47: Invalid credential formats are rejected without persistence
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createSettingsService, SettingsValidationError } from "./settings.service.js";
import { SystemSettings } from "../../models/index.js";

/**
 * Property 47: Invalid credential formats are rejected without persistence.
 *
 * For any credential submitted in an invalid format, the System_Settings module
 * reports a configuration error (a SettingsValidationError) and persists
 * nothing — the SystemSettings document remains absent/unchanged.
 *
 * Validates: Requirements 30.14
 *
 * updateSection persists to SystemSettings, so an in-memory MongoDB is started
 * following the conventions in settings.service.test.js. The encrypt function
 * uses an env-sourced key; no real network calls are ever made because an
 * invalid-format submission is rejected before any persistence or verification.
 */

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
});

/** A service whose live verifiers always succeed (never reached on this path). */
function makeService() {
  return createSettingsService({
    verifiers: {
      razorpay: async () => true,
      shiprocket: async () => true,
      whatsapp: async () => true,
      metaPixel: async () => true,
    },
  });
}

// Mirror of the field validators in settings.service.js, used ONLY as a guard
// to guarantee that generated values are genuinely invalid for their field.
// Copied verbatim from the code under test so there is no divergence: any value
// the guard treats as invalid is exactly a value the service must reject.
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const validators = {
  razorpayKeyId: (v) => isNonEmpty(v) && /^rzp_(test|live)_[A-Za-z0-9]+$/.test(v.trim()),
  razorpayKeySecret: (v) => isNonEmpty(v) && /^[A-Za-z0-9]{16,}$/.test(v.trim()),
  email: (v) => isNonEmpty(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  shiprocketPassword: (v) => isNonEmpty(v) && v.length >= 6,
  phoneNumberId: (v) => isNonEmpty(v) && /^\d{6,}$/.test(v.trim()),
  accessToken: (v) => isNonEmpty(v) && /^[A-Za-z0-9._-]{20,}$/.test(v.trim()),
  verifyToken: (v) => isNonEmpty(v) && v.trim().length >= 8,
  pixelId: (v) => isNonEmpty(v) && /^\d{10,20}$/.test(v.trim()),
};

// Each section's accepted input fields mapped to their validator key.
const SECTION_FIELD_VALIDATORS = {
  razorpay: { keyId: "razorpayKeyId", keySecret: "razorpayKeySecret" },
  shiprocket: { email: "email", password: "shiprocketPassword" },
  whatsapp: {
    phoneNumberId: "phoneNumberId",
    accessToken: "accessToken",
    verifyToken: "verifyToken",
  },
  metaPixel: { pixelId: "pixelId" },
};

const SECTIONS = Object.keys(SECTION_FIELD_VALIDATORS);

// A value generator weighted toward plausibly-malformed credentials: arbitrary
// strings, hand-picked near-miss strings, and non-string types. The filter
// below keeps only the genuinely-invalid ones for the chosen field.
const malformedishValue = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "",
    "   ",
    "\t",
    "not-a-key",
    "rzp_",
    "rzp_test_",
    "RZP_TEST_ABC",
    "key_test_abc",
    "abc",
    "12345",
    "short",
    "@",
    "a@b",
    "@b.c",
    "plainaddress",
    "123abc",
    "0123456789012345678901"
  ),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined)
);

/**
 * Build an arbitrary that yields a `{ section, payload }` where every provided
 * field carries a value that is invalid for that field. At least one field is
 * always present, so updateSection must reject and persist nothing.
 */
function invalidSubmissionArb() {
  return fc.constantFrom(...SECTIONS).chain((section) => {
    const fieldKeys = Object.keys(SECTION_FIELD_VALIDATORS[section]);
    return fc
      .subarray(fieldKeys, { minLength: 1 })
      .chain((keys) =>
        fc.record(Object.fromEntries(keys.map((k) => [k, malformedishValue])))
      )
      .filter((payload) =>
        Object.entries(payload).every(
          ([k, v]) => !validators[SECTION_FIELD_VALIDATORS[section][k]](v)
        )
      )
      .map((payload) => ({ section, payload }));
  });
}

describe("settings service - Property 47: invalid formats rejected without persistence (Req 30.14)", () => {
  it("rejects any invalid-format submission and persists nothing", async () => {
    const service = makeService();

    await fc.assert(
      fc.asyncProperty(invalidSubmissionArb(), async ({ section, payload }) => {
        // Establish a clean precondition: no settings stored.
        await SystemSettings.deleteMany({});

        // The module reports a configuration error...
        await expect(service.updateSection(section, payload)).rejects.toBeInstanceOf(
          SettingsValidationError
        );

        // ...and persists nothing: the document remains absent.
        const raw = await SystemSettings.findOne().lean();
        expect(raw).toBeNull();
      }),
      { numRuns: 150 }
    );
  });
});
