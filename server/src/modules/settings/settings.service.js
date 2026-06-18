import { encrypt as defaultEncrypt, getCredential } from "./credential.service.js";
import { SystemSettings } from "../../models/index.js";
import { logger as defaultLogger } from "../../shared/config/logger.js";

/**
 * System Settings Service (Req 30).
 *
 * Manages the four integration configuration sections — Razorpay, Shiprocket,
 * WhatsApp, and Meta Pixel (Req 30.2–30.6) — providing three operations:
 *
 *  - `getMaskedSettings()` — returns every section in masked form. Secret
 *    values (key secret, password, access/verify tokens) are NEVER returned;
 *    only a `configured` boolean is exposed for them. Non-secret identifiers
 *    (key id, email, phone number id, pixel id) are returned masked, revealing
 *    at most a short non-sensitive suffix (Req 30.8, 30.9, 30.20).
 *  - `updateSection(section, payload, ctx)` — validates the supplied credential
 *    formats and, only when ALL provided fields are valid, encrypts secret
 *    values and persists the section, recording an Audit_Log entry. When any
 *    field is invalid it throws and persists NOTHING (Req 30.7, 30.12, 30.14).
 *  - `verifySection(section, payload, ctx)` — performs a live, server-side
 *    connection test using the supplied credentials and returns only a boolean
 *    outcome and a generic message; secrets/tokens are excluded from the
 *    response (Req 30.16, 30.19, 30.20).
 *
 * All secret handling stays server-side. The encrypt function, the live-
 * verification clients, and the persistence model are injectable so the service
 * can be unit-tested without real network calls or a particular key.
 */

/** Raised when a submitted credential fails format validation (Req 30.14). */
export class SettingsValidationError extends Error {
  /**
   * @param {string} message client-safe explanation of the rejection
   * @param {number} [statusCode=400]
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "SettingsValidationError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.clientMessage = message;
  }
}

// --- Field-level format validators ----------------------------------------
// Each validator returns true when the trimmed string is a plausible value for
// that credential. They are intentionally strict enough to catch obvious
// mistakes (wrong field, empty/whitespace, malformed identifiers) while not so
// strict that they reject valid provider values.

const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

const validators = Object.freeze({
  razorpayKeyId: (v) => isNonEmpty(v) && /^rzp_(test|live)_[A-Za-z0-9]+$/.test(v.trim()),
  razorpayKeySecret: (v) => isNonEmpty(v) && /^[A-Za-z0-9]{16,}$/.test(v.trim()),
  razorpayWebhookSecret: (v) => isNonEmpty(v) && v.trim().length >= 8,
  email: (v) => isNonEmpty(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  shiprocketPassword: (v) => isNonEmpty(v) && v.length >= 6,
  shiprocketWebhookToken: (v) => isNonEmpty(v) && v.trim().length >= 8,
  phoneNumberId: (v) => isNonEmpty(v) && /^\d{6,}$/.test(v.trim()),
  accessToken: (v) => isNonEmpty(v) && /^[A-Za-z0-9._-]{20,}$/.test(v.trim()),
  verifyToken: (v) => isNonEmpty(v) && v.trim().length >= 8,
  pixelId: (v) => isNonEmpty(v) && /^\d{10,20}$/.test(v.trim()),
});

/**
 * Section field descriptors. For each section, every accepted input field maps
 * to whether it is a secret, the document field it persists to, the validator
 * that gates its format, and a human label used in error messages.
 */
const SECTION_FIELDS = Object.freeze({
  razorpay: {
    keyId: { secret: false, storedField: "keyId", validate: validators.razorpayKeyId, label: "Razorpay Key ID" },
    keySecret: { secret: true, storedField: "keySecretEnc", validate: validators.razorpayKeySecret, label: "Razorpay Key Secret" },
    webhookSecret: { secret: true, storedField: "webhookSecretEnc", validate: validators.razorpayWebhookSecret, label: "Razorpay Webhook Secret" },
  },
  shiprocket: {
    email: { secret: false, storedField: "email", validate: validators.email, label: "Shiprocket Email" },
    password: { secret: true, storedField: "passwordEnc", validate: validators.shiprocketPassword, label: "Shiprocket Password" },
    webhookToken: { secret: true, storedField: "webhookTokenEnc", validate: validators.shiprocketWebhookToken, label: "Shiprocket Webhook Token" },
  },
  whatsapp: {
    phoneNumberId: { secret: false, storedField: "phoneNumberId", validate: validators.phoneNumberId, label: "WhatsApp Phone Number ID" },
    accessToken: { secret: true, storedField: "accessTokenEnc", validate: validators.accessToken, label: "WhatsApp Access Token" },
    verifyToken: { secret: true, storedField: "verifyTokenEnc", validate: validators.verifyToken, label: "WhatsApp Verify Token" },
  },
  metaPixel: {
    pixelId: { secret: false, storedField: "pixelId", validate: validators.pixelId, label: "Meta Pixel ID" },
  },
});

/** The supported section identifiers (Req 30.2). */
export const SETTINGS_SECTIONS = Object.freeze(Object.keys(SECTION_FIELDS));

/**
 * For each section, the logical credential keys (as understood by the
 * credential service) needed to perform a live verification.
 */
const VERIFY_CREDENTIALS = Object.freeze({
  razorpay: ["keyId", "keySecret"],
  shiprocket: ["email", "password"],
  whatsapp: ["phoneNumberId", "accessToken"],
  metaPixel: ["pixelId"],
});

/**
 * Mask a value for display, revealing at most a short non-sensitive suffix and
 * never the full plaintext (Req 30.9; Property 46). Returns `null` for empty
 * values so the UI can show an "unset" state.
 *
 * @param {unknown} value
 * @param {number} [visible=4] number of trailing characters to reveal
 * @returns {string|null}
 */
export function maskValue(value, visible = 4) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const v = value.trim();
  if (v.length <= visible) return "•".repeat(v.length);
  return `${"•".repeat(Math.min(8, v.length - visible))}${v.slice(-visible)}`;
}

/** Default HTTP client backed by global fetch; returns `{ status, data }`. */
function createDefaultHttpClient() {
  return {
    async request({ method = "GET", url, headers = {}, body } = {}) {
      const response = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...headers },
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return { status: response.status, data };
    },
  };
}

/**
 * Default live-verification routines, one per section. Each receives the
 * resolved plaintext credentials and an HTTP client, performs a single
 * server-side request, and resolves to a boolean. They never return or log the
 * credential values themselves (Req 30.19, 30.20).
 */
function createDefaultVerifiers(httpClient) {
  return Object.freeze({
    async razorpay({ keyId, keySecret }) {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const { status } = await httpClient.request({
        method: "GET",
        url: "https://api.razorpay.com/v1/payments?count=1",
        headers: { Authorization: `Basic ${auth}` },
      });
      return status >= 200 && status < 300;
    },
    async shiprocket({ email, password }) {
      const { status, data } = await httpClient.request({
        method: "POST",
        url: "https://apiv2.shiprocket.in/v1/external/auth/login",
        headers: { "Content-Type": "application/json" },
        body: { email, password },
      });
      return status >= 200 && status < 300 && typeof data?.token === "string";
    },
    async whatsapp({ phoneNumberId, accessToken }) {
      const { status } = await httpClient.request({
        method: "GET",
        url: `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}`,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return status >= 200 && status < 300;
    },
    // Meta Pixel exposes no server-side credential to authenticate; a valid
    // Pixel ID format is the only verifiable condition (Req 30.15).
    async metaPixel({ pixelId }) {
      return validators.pixelId(pixelId);
    },
  });
}

/** Resolve and assert that `section` is supported, returning its descriptors. */
function resolveSection(section) {
  const fields = SECTION_FIELDS[section];
  if (!fields) {
    throw new SettingsValidationError(`Unknown settings section: ${section}.`, 404);
  }
  return fields;
}

/**
 * Create a System Settings Service instance.
 *
 * @param {object} [options]
 * @param {typeof SystemSettings} [options.settingsModel]
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @param {(plaintext: string, env?: object) => string} [options.encryptFn]
 * @param {{ request: Function }} [options.httpClient]
 * @param {Record<string, (creds: object) => Promise<boolean>>} [options.verifiers]
 * @param {{ warn: Function, error: Function }} [options.logger]
 */
export function createSettingsService({
  settingsModel = SystemSettings,
  env = process.env,
  encryptFn = defaultEncrypt,
  httpClient = createDefaultHttpClient(),
  verifiers = createDefaultVerifiers(httpClient),
  logger = defaultLogger,
} = {}) {
  /**
   * Load the singleton settings document as a plain object, or an empty object
   * when none has been created yet.
   */
  async function loadRaw() {
    const doc = await settingsModel.findOne().lean();
    return doc || {};
  }

  /**
   * Return all sections in masked form. Secret fields expose only a
   * `configured` boolean; non-secret fields expose a masked value plus
   * `configured`. No plaintext or encrypted secret ever appears (Req 30.8,
   * 30.9, 30.20).
   *
   * @returns {Promise<Record<string, object>>}
   */
  async function getMaskedSettings() {
    const raw = await loadRaw();
    const out = {};
    for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
      const stored = raw[section] || {};
      out[section] = {};
      for (const [key, descriptor] of Object.entries(fields)) {
        const value = stored[descriptor.storedField];
        const configured = typeof value === "string" && value.trim() !== "";
        out[section][key] = descriptor.secret
          ? { configured }
          : { configured, masked: maskValue(value) };
      }
    }
    return out;
  }

  /**
   * Validate the supplied fields for a section. Returns the list of
   * `{ key, descriptor, value }` entries that were provided, or throws a
   * {@link SettingsValidationError} when any provided field is malformed.
   * Unknown fields and empty/whitespace values are rejected.
   */
  function validateSectionInput(fields, payload, { requireAll = false } = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new SettingsValidationError("A settings payload object is required.");
    }

    const allowedKeys = Object.keys(fields);
    for (const key of Object.keys(payload)) {
      if (!allowedKeys.includes(key)) {
        throw new SettingsValidationError(`Unsupported field for this section: ${key}.`);
      }
    }

    const provided = [];
    for (const [key, descriptor] of Object.entries(fields)) {
      const has = Object.prototype.hasOwnProperty.call(payload, key);
      if (!has) {
        if (requireAll) {
          throw new SettingsValidationError(`${descriptor.label} is required.`);
        }
        continue;
      }
      const value = payload[key];
      if (!descriptor.validate(value)) {
        // Reject without persisting anything (Req 30.14).
        throw new SettingsValidationError(`${descriptor.label} is not in a valid format.`);
      }
      provided.push({ key, descriptor, value: String(value).trim() });
    }

    if (provided.length === 0) {
      throw new SettingsValidationError("No settings fields were provided to update.");
    }
    return provided;
  }

  /**
   * Validate, encrypt, and persist a section, then record an audit entry.
   *
   * Validation runs to completion BEFORE any write, so an invalid submission
   * persists nothing (Req 30.14). Secret fields are AES-256-GCM encrypted via
   * the credential service before storage (Req 30.7); non-secret fields are
   * stored as-is. A successful update records one Audit_Log entry capturing the
   * action, the acting administrator, and the affected field names — never any
   * credential value (Req 30.12).
   *
   * @param {string} section
   * @param {object} payload field values to update (partial allowed)
   * @param {object} [ctx]
   * @param {string} [ctx.adminId] acting administrator id (for the audit entry)
   * @param {(entry: object) => any} [ctx.recordAudit] audit recorder (injected)
   * @returns {Promise<Record<string, object>>} the masked settings after update
   */
  async function updateSection(section, payload, { adminId, recordAudit } = {}) {
    const fields = resolveSection(section);
    const provided = validateSectionInput(fields, payload);

    const set = {};
    for (const { key, descriptor, value } of provided) {
      set[`${section}.${descriptor.storedField}`] = descriptor.secret
        ? encryptFn(value, env)
        : value;
    }

    await settingsModel.findOneAndUpdate(
      {},
      { $set: set },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Record the auditable action with field names only — no values (Req 30.12).
    if (typeof recordAudit === "function") {
      try {
        await recordAudit({
          action: "settings.update",
          adminId,
          targetType: "SystemSettings",
          targetId: section,
          metadata: { section, fields: provided.map((p) => p.key) },
        });
      } catch (error) {
        // Auditing must not break the operation; log and continue.
        logger.error?.("Failed to record settings audit entry.", {
          section,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return getMaskedSettings();
  }

  /**
   * Resolve the plaintext credentials needed to verify a section, preferring
   * the values supplied in `payload` and falling back to the stored/encrypted
   * value or environment variable via the credential service.
   */
  async function resolveVerifyCredentials(section, fields, payload) {
    const creds = {};
    for (const key of VERIFY_CREDENTIALS[section]) {
      const supplied = payload && Object.prototype.hasOwnProperty.call(payload, key)
        ? payload[key]
        : undefined;
      if (typeof supplied === "string" && supplied.trim() !== "") {
        creds[key] = supplied.trim();
      } else {
        creds[key] = await getCredential(section, key, { env });
      }
    }
    return creds;
  }

  /**
   * Perform a live, server-side connection test for a section (Req 30.16,
   * 30.19). The supplied credentials are validated for format first; an invalid
   * format is rejected without attempting a connection (Req 30.14). The result
   * contains only a boolean outcome and a generic message — no secrets, tokens,
   * passwords, or credential values (Req 30.20).
   *
   * @param {string} section
   * @param {object} payload supplied credentials to test
   * @returns {Promise<{ section: string, verified: boolean, message: string }>}
   */
  async function verifySection(section, payload) {
    const fields = resolveSection(section);

    // Validate the format of every supplied field before any live attempt.
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      for (const [key, value] of Object.entries(payload)) {
        const descriptor = fields[key];
        if (!descriptor) {
          throw new SettingsValidationError(`Unsupported field for this section: ${key}.`);
        }
        if (!descriptor.validate(value)) {
          throw new SettingsValidationError(`${descriptor.label} is not in a valid format.`);
        }
      }
    }

    const creds = await resolveVerifyCredentials(section, fields, payload);
    const missing = VERIFY_CREDENTIALS[section].filter(
      (k) => typeof creds[k] !== "string" || creds[k].trim() === ""
    );
    if (missing.length > 0) {
      return {
        section,
        verified: false,
        message: "Credentials are incomplete; cannot verify the connection.",
      };
    }

    const verifier = verifiers[section];
    try {
      const verified = Boolean(await verifier(creds));
      return {
        section,
        verified,
        message: verified
          ? "Connection verified successfully."
          : "Verification failed. Please check the credentials and try again.",
      };
    } catch (error) {
      // Never surface provider/internal detail to the client (Req 30.20, 27).
      logger.error?.("Settings verification attempt failed.", {
        section,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        section,
        verified: false,
        message: "Verification failed. Please check the credentials and try again.",
      };
    }
  }

  return Object.freeze({
    SETTINGS_SECTIONS,
    getMaskedSettings,
    updateSection,
    verifySection,
  });
}

/** Default application System Settings Service instance. */
export const settingsService = createSettingsService();

/** Bound convenience exports over the default instance. */
export const getMaskedSettings = (...args) => settingsService.getMaskedSettings(...args);
export const updateSection = (...args) => settingsService.updateSection(...args);
export const verifySection = (...args) => settingsService.verifySection(...args);

export default settingsService;
