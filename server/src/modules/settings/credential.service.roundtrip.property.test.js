import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { encrypt, decrypt } from "./credential.service.js";

// Feature: planet-of-toys-ecommerce, Property 45: Credential encryption round-trip
//
// For any credential value, the stored form is ciphertext distinct from the
// plaintext, and decrypt(encrypt(value)) returns the original value.
//
// Validates: Requirements 30.7

const NUM_RUNS = 100;
const TEST_KEY = "property-test-encryption-key-please-rotate";

/**
 * Credential values cover the realistic input space: empty strings, ASCII
 * secrets, unicode, and arbitrary text. The encryption key is always sourced
 * from the ENCRYPTION_KEY environment variable, mirroring production behaviour
 * (Req 30.11).
 */
const credentialArb = fc.string({ maxLength: 256 });

describe("Property 45: Credential encryption round-trip", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = savedEnv;
  });

  it("decrypt(encrypt(value)) === value for any credential, with stored form distinct from plaintext", () => {
    fc.assert(
      fc.property(credentialArb, (value) => {
        const envelope = encrypt(value);

        // Round-trip: decryption recovers the original plaintext exactly.
        expect(decrypt(envelope)).toBe(value);

        // Stored form carries the versioned AES-256-GCM envelope structure
        // (v1:<iv>:<tag>:<ciphertext>) and is never the bare plaintext.
        expect(envelope).not.toBe(value);
        const parts = envelope.split(":");
        expect(parts).toHaveLength(4);
        expect(parts[0]).toBe("v1");

        // Stored form is ciphertext distinct from the plaintext: the encrypted
        // bytes differ from the plaintext bytes (encryption is not identity).
        // We compare the decoded ciphertext segment against the plaintext bytes
        // rather than doing a substring check, since short plaintexts can
        // coincidentally appear inside the base64-encoded iv/tag/ciphertext.
        // For non-empty plaintext only: AES-256-GCM yields zero-length
        // ciphertext for empty input, where byte-level distinctness is vacuous
        // and the envelope-level distinctness asserted above already holds.
        if (value !== "") {
          const ciphertextBytes = Buffer.from(parts[3], "base64");
          const plaintextBytes = Buffer.from(value, "utf8");
          expect(ciphertextBytes.equals(plaintextBytes)).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
