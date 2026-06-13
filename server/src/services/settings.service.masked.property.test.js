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
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createSettingsService, maskValue } from "./settings.service.js";
import { SystemSettings } from "../models/index.js";

// Feature: planet-of-toys-ecommerce, Property 46: Stored credentials are displayed masked
//
// For any stored credential, the value returned for display is masked such that
// the full plaintext is never present (revealing at most a configured
// non-sensitive suffix). Secret fields (key secret, password, access/verify
// tokens) expose only a `configured` boolean and never any value.
//
// Validates: Requirements 30.9
//
// The real AES-256-GCM encrypt path is exercised (secret fields are encrypted
// at rest via the credential service using an env-sourced key) and the settings
// document is persisted to an in-memory MongoDB, matching settings.service.test.js
// conventions. No live verifiers/network calls are involved in masking.

const NUM_RUNS = 100;
const TEST_KEY = "settings-service-masked-property-encryption-key";

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
});

// --- Generators for valid, persistable credential values --------------------
// Values must satisfy the section field validators so updateSection accepts and
// stores them; this lets us assert masking over genuinely-stored credentials.

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_CHARS = `${ALNUM}._-`;
const DIGITS = "0123456789";

const charsFrom = (set, min, max) =>
  fc
    .array(fc.constantFrom(...set.split("")), { minLength: min, maxLength: max })
    .map((a) => a.join(""));

const alnum = (min, max) => charsFrom(ALNUM, min, max);
const token = (min, max) => charsFrom(TOKEN_CHARS, min, max);
const digits = (min, max) => charsFrom(DIGITS, min, max);

/**
 * Each arbitrary yields `{ section, payload, fields }` where `fields` maps each
 * provided key to `{ secret, value }` so the test knows what to assert.
 */
const sectionArb = fc.oneof(
  // Razorpay: keyId (non-secret), keySecret (secret).
  fc
    .record({
      mode: fc.constantFrom("test", "live"),
      idBody: alnum(1, 20),
      keySecret: alnum(16, 30),
    })
    .map(({ mode, idBody, keySecret }) => {
      const keyId = `rzp_${mode}_${idBody}`;
      return {
        section: "razorpay",
        payload: { keyId, keySecret },
        fields: {
          keyId: { secret: false, value: keyId },
          keySecret: { secret: true, value: keySecret },
        },
      };
    }),
  // Shiprocket: email (non-secret), password (secret).
  fc
    .record({
      local: alnum(1, 10),
      domain: alnum(1, 8),
      tld: alnum(2, 4),
      password: alnum(6, 24),
    })
    .map(({ local, domain, tld, password }) => {
      const email = `${local}@${domain}.${tld}`;
      return {
        section: "shiprocket",
        payload: { email, password },
        fields: {
          email: { secret: false, value: email },
          password: { secret: true, value: password },
        },
      };
    }),
  // WhatsApp: phoneNumberId (non-secret), accessToken + verifyToken (secret).
  fc
    .record({
      phoneNumberId: digits(6, 15),
      accessToken: token(20, 40),
      verifyToken: alnum(8, 20),
    })
    .map(({ phoneNumberId, accessToken, verifyToken }) => ({
      section: "whatsapp",
      payload: { phoneNumberId, accessToken, verifyToken },
      fields: {
        phoneNumberId: { secret: false, value: phoneNumberId },
        accessToken: { secret: true, value: accessToken },
        verifyToken: { secret: true, value: verifyToken },
      },
    })),
  // Meta Pixel: pixelId (non-secret).
  digits(10, 20).map((pixelId) => ({
    section: "metaPixel",
    payload: { pixelId },
    fields: { pixelId: { secret: false, value: pixelId } },
  }))
);

/** A settings service with always-passing verifiers (irrelevant to masking). */
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

describe("Property 46: Stored credentials are displayed masked", () => {
  it("getMaskedSettings never reveals stored plaintext; secret fields expose only `configured`", async () => {
    const service = makeService();

    await fc.assert(
      fc.asyncProperty(sectionArb, async ({ section, payload, fields }) => {
        // Isolate each run so only the current credential is under test.
        await SystemSettings.deleteMany({});

        await service.updateSection(section, payload);
        const masked = await service.getMaskedSettings();
        const serialized = JSON.stringify(masked);

        for (const [key, { secret, value }] of Object.entries(fields)) {
          const out = masked[section][key];

          // The field is reported as configured after a successful store.
          expect(out.configured).toBe(true);

          if (secret) {
            // Secret fields expose ONLY `configured`: no value of any kind.
            expect(out).toEqual({ configured: true });
            expect("masked" in out).toBe(false);
          } else {
            // Non-secret fields are masked: never the full plaintext, and the
            // revealed portion is at most the configured trailing suffix.
            expect(out.masked).not.toBe(value);
            expect(out.masked).toBe(maskValue(value));
            expect(out.masked.endsWith(value.slice(-4))).toBe(true);
            // The masked string must not contain the full plaintext.
            expect(out.masked.includes(value)).toBe(false);
          }

          // The full plaintext of EVERY field (secret or not) must be absent
          // from the entire serialized response (Req 30.9, Property 46).
          expect(serialized.includes(value)).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
