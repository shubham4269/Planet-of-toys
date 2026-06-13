import crypto from "node:crypto";
import { buildConfig } from "../config/env.js";
import { SystemSettings } from "../models/index.js";

/**
 * Credential encryption and resolution service (Req 29.2, 30.7, 30.10, 30.11).
 *
 * Responsibilities:
 *  - Encrypt/decrypt integration credentials with AES-256-GCM using an
 *    encryption key sourced ONLY from environment variables (Req 30.7, 30.11).
 *  - Resolve a credential for server-side integration use via
 *    `getCredential(section, key)`, returning the (decrypted) encrypted
 *    System_Settings value when present and falling back to the corresponding
 *    environment variable otherwise (Req 29.2, 30.10).
 *
 * The key is read lazily (per call) from `config.secrets.encryptionKey` so the
 * service honours the current environment and can be exercised in tests without
 * a module-load-time dependency on a particular key being set.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the recommended size for GCM.
const KEY_BYTES = 32; // AES-256 requires a 32-byte key.
const ENVELOPE_VERSION = "v1";

/** Raised when encryption/decryption cannot proceed or input is malformed. */
export class CredentialCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

/**
 * Resolve the raw encryption-key material from the environment (Req 30.11).
 * The key is always read from environment variables via {@link buildConfig};
 * it is never sourced from System_Settings or any other store.
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {string} the configured encryption key string
 */
function resolveEncryptionKeyString(env = process.env) {
  const { secrets } = buildConfig(env);
  const key = secrets.encryptionKey;
  if (typeof key !== "string" || key.trim() === "") {
    throw new CredentialCryptoError(
      "ENCRYPTION_KEY is not configured; credential encryption is unavailable."
    );
  }
  return key;
}

/**
 * Derive a fixed-length 32-byte AES-256 key from the configured key string.
 * Using SHA-256 lets the operator supply a passphrase or a hex/base64 string of
 * any length while always yielding a valid 256-bit key.
 *
 * @param {string} keyString
 * @returns {Buffer} 32-byte key
 */
function deriveKey(keyString) {
  return crypto.createHash("sha256").update(keyString, "utf8").digest();
}

/**
 * Encrypt a plaintext credential with AES-256-GCM (Req 30.7).
 *
 * Returns a self-describing envelope string:
 *   `v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>`
 * The random IV guarantees that encrypting the same plaintext twice yields
 * distinct ciphertext, and the GCM auth tag makes tampering detectable.
 *
 * @param {string} plaintext the credential value to protect
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {string} the encrypted envelope
 */
export function encrypt(plaintext, env = process.env) {
  if (typeof plaintext !== "string") {
    throw new CredentialCryptoError("encrypt expects a string plaintext.");
  }

  const key = deriveKey(resolveEncryptionKeyString(env));
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt an envelope produced by {@link encrypt} (Req 30.10).
 *
 * @param {string} envelope the encrypted envelope string
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {string} the original plaintext
 */
export function decrypt(envelope, env = process.env) {
  if (typeof envelope !== "string") {
    throw new CredentialCryptoError("decrypt expects a string envelope.");
  }

  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new CredentialCryptoError("Malformed credential envelope.");
  }

  const [, ivB64, tagB64, ctB64] = parts;
  const key = deriveKey(resolveEncryptionKeyString(env));

  let iv;
  let authTag;
  let ciphertext;
  try {
    iv = Buffer.from(ivB64, "base64");
    authTag = Buffer.from(tagB64, "base64");
    ciphertext = Buffer.from(ctB64, "base64");
  } catch {
    throw new CredentialCryptoError("Malformed credential envelope.");
  }

  if (iv.length !== IV_BYTES) {
    throw new CredentialCryptoError("Malformed credential envelope.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Authentication failure (tampered ciphertext/tag or wrong key).
    throw new CredentialCryptoError(
      "Credential decryption failed: data is corrupt or the key is wrong."
    );
  }
}

/**
 * Credential resolution map (Req 29.2).
 *
 * For each integration `section` and logical `key` it records:
 *  - `storedField`: the field on the SystemSettings section document.
 *  - `encrypted`:   whether the stored field holds an encrypted envelope.
 *  - `env`:         a selector returning the environment-variable fallback.
 */
const CREDENTIAL_MAP = Object.freeze({
  razorpay: {
    keyId: {
      storedField: "keyId",
      encrypted: false,
      env: (cfg) => cfg.integrations.razorpay.keyId,
    },
    keySecret: {
      storedField: "keySecretEnc",
      encrypted: true,
      env: (cfg) => cfg.integrations.razorpay.keySecret,
    },
    webhookSecret: {
      storedField: "webhookSecretEnc",
      encrypted: true,
      env: (cfg) => cfg.integrations.razorpay.webhookSecret,
    },
  },
  shiprocket: {
    email: {
      storedField: "email",
      encrypted: false,
      env: (cfg) => cfg.integrations.shiprocket.email,
    },
    password: {
      storedField: "passwordEnc",
      encrypted: true,
      env: (cfg) => cfg.integrations.shiprocket.password,
    },
    webhookToken: {
      storedField: "webhookTokenEnc",
      encrypted: true,
      env: (cfg) => cfg.integrations.shiprocket.webhookToken,
    },
  },
  whatsapp: {
    phoneNumberId: {
      storedField: "phoneNumberId",
      encrypted: false,
      env: (cfg) => cfg.integrations.whatsapp.phoneNumberId,
    },
    accessToken: {
      storedField: "accessTokenEnc",
      encrypted: true,
      env: (cfg) => cfg.integrations.whatsapp.accessToken,
    },
    verifyToken: {
      storedField: "verifyTokenEnc",
      encrypted: true,
      env: (cfg) => cfg.integrations.whatsapp.verifyToken,
    },
  },
  metaPixel: {
    pixelId: {
      storedField: "pixelId",
      encrypted: false,
      env: (cfg) => cfg.integrations.metaPixel.pixelId,
    },
  },
});

/** A stored value is "present" when it is a non-empty string. */
function hasValue(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Resolve an integration credential for server-side use (Req 29.2, 30.10).
 *
 * Precedence: the value persisted in encrypted System_Settings wins when
 * present; otherwise the environment-variable fallback is returned. Encrypted
 * stored fields are decrypted only here, for the calling server-side
 * integration. Returns `null` when neither source provides a value.
 *
 * @param {"razorpay"|"shiprocket"|"whatsapp"|"metaPixel"} section
 * @param {string} key the logical credential key within the section
 * @param {object} [options]
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @returns {Promise<string|null>} the resolved credential, or null
 */
export async function getCredential(section, key, { env = process.env } = {}) {
  const sectionMap = CREDENTIAL_MAP[section];
  if (!sectionMap) {
    throw new CredentialCryptoError(`Unknown credential section: ${section}`);
  }
  const entry = sectionMap[key];
  if (!entry) {
    throw new CredentialCryptoError(
      `Unknown credential key '${key}' for section '${section}'`
    );
  }

  // 1) Prefer the value stored in System_Settings (Req 29.2 precedence).
  const settings = await SystemSettings.findOne().lean();
  const storedSection = settings ? settings[section] : undefined;
  const storedValue = storedSection
    ? storedSection[entry.storedField]
    : undefined;

  if (hasValue(storedValue)) {
    return entry.encrypted ? decrypt(storedValue, env) : storedValue;
  }

  // 2) Fall back to the environment-variable value.
  const fallback = entry.env(buildConfig(env));
  return hasValue(fallback) ? fallback : null;
}

export default { encrypt, decrypt, getCredential, CredentialCryptoError };
