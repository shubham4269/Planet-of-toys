import { describe, it, beforeAll, afterAll, afterEach } from "vitest";
import fc from "fast-check";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { encrypt, getCredential } from "./credential.service.js";
import { SystemSettings } from "../../models/index.js";

// Feature: planet-of-toys-ecommerce, Property 43: Integration credential resolution follows precedence
//
// For any integration and any combination of credential sources, `getCredential`
// returns the (decrypted) encrypted System_Settings value when present and falls
// back to the environment-variable value otherwise. When neither source provides
// a value, it returns null.
//
// Validates: Requirements 29.2

const NUM_RUNS = 100;
const TEST_KEY = "property-test-encryption-key-please-rotate";

/**
 * The full set of resolvable credentials, mirroring the service's internal
 * CREDENTIAL_MAP: each entry records the System_Settings section/field, whether
 * that field is stored encrypted, and the environment-variable fallback name.
 */
const CREDENTIALS = [
  { section: "razorpay", key: "keyId", storedField: "keyId", encrypted: false, envVar: "RAZORPAY_KEY_ID" },
  { section: "razorpay", key: "keySecret", storedField: "keySecretEnc", encrypted: true, envVar: "RAZORPAY_KEY_SECRET" },
  { section: "shiprocket", key: "email", storedField: "email", encrypted: false, envVar: "SHIPROCKET_EMAIL" },
  { section: "shiprocket", key: "password", storedField: "passwordEnc", encrypted: true, envVar: "SHIPROCKET_PASSWORD" },
  { section: "whatsapp", key: "phoneNumberId", storedField: "phoneNumberId", encrypted: false, envVar: "WHATSAPP_PHONE_NUMBER_ID" },
  { section: "whatsapp", key: "accessToken", storedField: "accessTokenEnc", encrypted: true, envVar: "WHATSAPP_ACCESS_TOKEN" },
  { section: "whatsapp", key: "verifyToken", storedField: "verifyTokenEnc", encrypted: true, envVar: "WHATSAPP_VERIFY_TOKEN" },
  { section: "metaPixel", key: "pixelId", storedField: "pixelId", encrypted: false, envVar: "META_PIXEL_ID" },
];

/** Non-blank value: a value that the service treats as "present". */
const presentValue = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim() !== "");

/** Blank value: whitespace-only, which the service treats as "absent". */
const blankValue = fc.constantFrom("", " ", "   ", "\t", " \n ");

/**
 * A single test scenario: which credential to resolve, the state of its stored
 * System_Settings value (absent / blank / present) and the state of its
 * environment-variable fallback (absent / blank / present), plus concrete
 * values for the present/blank cases.
 */
const scenarioArb = fc.record({
  credential: fc.constantFrom(...CREDENTIALS),
  storedState: fc.constantFrom("absent", "blank", "present"),
  envState: fc.constantFrom("absent", "blank", "present"),
  storedPlain: presentValue,
  storedBlank: blankValue,
  envPresent: presentValue,
  envBlank: blankValue,
});

describe("Property 43: Integration credential resolution follows precedence", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await SystemSettings.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("returns the stored value when present, else the env fallback, else null", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const {
          credential,
          storedState,
          envState,
          storedPlain,
          storedBlank,
          envPresent,
          envBlank,
        } = scenario;

        // Isolate each run: getCredential reads the single SystemSettings doc.
        await SystemSettings.deleteMany({});

        // Build the env passed explicitly to getCredential (no process.env
        // mutation). ENCRYPTION_KEY is always present so encrypt/decrypt work.
        const env = { ENCRYPTION_KEY: TEST_KEY };
        let expectedEnvValue;
        if (envState === "present") {
          env[credential.envVar] = envPresent;
          expectedEnvValue = envPresent;
        } else if (envState === "blank") {
          env[credential.envVar] = envBlank;
          expectedEnvValue = null; // blank counts as absent
        } else {
          expectedEnvValue = null;
        }

        // Seed the stored System_Settings value when the scenario calls for it.
        let expectedStoredValue;
        if (storedState === "present") {
          const fieldValue = credential.encrypted
            ? encrypt(storedPlain, env)
            : storedPlain;
          await SystemSettings.create({
            [credential.section]: { [credential.storedField]: fieldValue },
          });
          expectedStoredValue = storedPlain;
        } else if (storedState === "blank") {
          await SystemSettings.create({
            [credential.section]: { [credential.storedField]: storedBlank },
          });
          expectedStoredValue = null; // blank counts as absent
        } else {
          expectedStoredValue = null;
        }

        // Precedence: a present stored value wins; otherwise env fallback;
        // otherwise null.
        const expected =
          expectedStoredValue !== null
            ? expectedStoredValue
            : expectedEnvValue;

        const actual = await getCredential(credential.section, credential.key, {
          env,
        });

        return actual === expected;
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
