import dotenv from "dotenv";

// Load variables from a local .env file when present. In production the
// variables are expected to be provided by the environment directly.
dotenv.config();

/**
 * Environment configuration and startup validation (Req 29).
 *
 * Responsibilities:
 *  - Define the required environment-variable schema.
 *  - Validate that all mandatory variables are present at boot (Req 29.4).
 *  - Fail fast (process exit) when any required variable is missing (Req 29.5).
 *  - Source bootstrap secrets (encryption key, JWT secret, DB connection
 *    string) ONLY from environment variables (Req 29.1).
 *
 * Integration credentials (Razorpay, Shiprocket, WhatsApp, Meta Pixel) may be
 * resolved from encrypted System Settings first and fall back to the
 * environment (Req 29.2). They are therefore optional here and exposed as
 * environment-level fallbacks.
 */

/**
 * Bootstrap secrets that must come from environment variables only (Req 29.1).
 * These are mandatory: the application cannot start without them.
 */
export const BOOTSTRAP_SECRET_VARS = Object.freeze([
  "ENCRYPTION_KEY",
  "JWT_SECRET",
  "MONGODB_URI",
]);

/**
 * The full set of environment variables that must be present at startup
 * (Req 29.4). Currently this equals the bootstrap secrets; additional required
 * variables can be appended here as the system grows.
 */
export const REQUIRED_ENV_VARS = Object.freeze([...BOOTSTRAP_SECRET_VARS]);

/** Error thrown when one or more required environment variables are missing. */
export class EnvValidationError extends Error {
  constructor(missing) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Refer to .env.example and ensure all bootstrap secrets are set.`
    );
    this.name = "EnvValidationError";
    this.missing = missing;
  }
}

/** A value is "present" when it is defined and not blank/whitespace-only. */
function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/**
 * Return the list of required variables that are missing from `env`.
 * Pure and side-effect free so it can be unit/property tested directly.
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {string[]} names of missing required variables
 */
export function findMissingEnvVars(env = process.env) {
  return REQUIRED_ENV_VARS.filter((name) => !isPresent(env[name]));
}

/**
 * Validate that all required environment variables are present.
 * Throws {@link EnvValidationError} when any are missing (Req 29.4, 29.5).
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 */
export function validateEnv(env = process.env) {
  const missing = findMissingEnvVars(env);
  if (missing.length > 0) {
    throw new EnvValidationError(missing);
  }
}

// --- Parsing helpers -------------------------------------------------------

function parseInteger(value, fallback) {
  if (!isPresent(value)) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value, fallback = []) {
  if (!isPresent(value)) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Build the typed configuration object from a validated environment.
 * Does NOT validate presence — call {@link validateEnv} first (or use
 * {@link loadConfig}).
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 */
export function buildConfig(env = process.env) {
  return Object.freeze({
    server: Object.freeze({
      port: parseInteger(env.PORT, 4000),
      nodeEnv: isPresent(env.NODE_ENV) ? env.NODE_ENV : "development",
      // Number of reverse-proxy hops to trust for the real client IP. Behind a
      // single nginx (the VPS setup) this is 1; set higher only if another
      // proxy (e.g. Cloudflare) sits in front. Defaults to 1 in production so
      // rate limiting works correctly behind the proxy, and 0 (disabled) in
      // development where requests hit the server directly.
      trustProxy: parseInteger(
        env.TRUST_PROXY,
        (isPresent(env.NODE_ENV) ? env.NODE_ENV : "development") === "production"
          ? 1
          : 0
      ),
    }),

    // Bootstrap secrets — environment-only (Req 29.1).
    secrets: Object.freeze({
      encryptionKey: env.ENCRYPTION_KEY,
      jwtSecret: env.JWT_SECRET,
      mongoUri: env.MONGODB_URI,
    }),

    // Sessions / auth.
    auth: Object.freeze({
      sessionExpiration: isPresent(env.SESSION_EXPIRATION)
        ? env.SESSION_EXPIRATION
        : "2h",
    }),

    // CORS allowed origins (Req 19.3).
    cors: Object.freeze({
      allowedOrigins: parseList(env.ALLOWED_ORIGINS, [
        "http://localhost:5173",
      ]),
    }),

    // Upload settings (Req 23).
    uploads: Object.freeze({
      maxUploadSizeMb: parseInteger(env.MAX_UPLOAD_SIZE_MB, 10),
      allowedMediaTypes: parseList(env.ALLOWED_MEDIA_TYPES, [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
      ]),
    }),

    // Tiered rate-limit settings (Req 28). Each tier has a window and a max.
    rateLimits: Object.freeze({
      global: Object.freeze({
        windowMs: parseInteger(env.RATE_LIMIT_GLOBAL_WINDOW_MS, 15 * 60 * 1000),
        max: parseInteger(env.RATE_LIMIT_GLOBAL_MAX, 300),
      }),
      otp: Object.freeze({
        windowMs: parseInteger(env.RATE_LIMIT_OTP_WINDOW_MS, 10 * 60 * 1000),
        max: parseInteger(env.RATE_LIMIT_OTP_MAX, 3),
      }),
      payment: Object.freeze({
        windowMs: parseInteger(
          env.RATE_LIMIT_PAYMENT_WINDOW_MS,
          15 * 60 * 1000
        ),
        max: parseInteger(env.RATE_LIMIT_PAYMENT_MAX, 20),
      }),
      order: Object.freeze({
        windowMs: parseInteger(env.RATE_LIMIT_ORDER_WINDOW_MS, 15 * 60 * 1000),
        max: parseInteger(env.RATE_LIMIT_ORDER_MAX, 20),
      }),
      login: Object.freeze({
        windowMs: parseInteger(env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000),
        max: parseInteger(env.RATE_LIMIT_LOGIN_MAX, 10),
        blockThreshold: parseInteger(env.LOGIN_BLOCK_THRESHOLD, 5),
      }),
    }),

    // Integration credential fallbacks (resolved from System Settings first;
    // Req 29.2). Optional at boot.
    integrations: Object.freeze({
      razorpay: Object.freeze({
        keyId: env.RAZORPAY_KEY_ID,
        keySecret: env.RAZORPAY_KEY_SECRET,
        // Shared secret used to verify inbound Razorpay webhooks (the same
        // value configured in the Razorpay dashboard webhook setup). The
        // webhook verifier FAILS CLOSED when this is absent.
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
      }),
      shiprocket: Object.freeze({
        email: env.SHIPROCKET_EMAIL,
        password: env.SHIPROCKET_PASSWORD,
        // Shared secret used to verify inbound Shiprocket status webhooks
        // (Req 24.1). The webhook verifier FAILS CLOSED when this is absent,
        // so leaving it unset disables webhook processing rather than
        // accepting unauthenticated requests.
        webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN,
      }),
      whatsapp: Object.freeze({
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      }),
      metaPixel: Object.freeze({
        pixelId: env.META_PIXEL_ID,
      }),
    }),
  });
}

/**
 * Validate the environment and build the configuration object.
 * Throws {@link EnvValidationError} when required variables are missing.
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 */
export function loadConfig(env = process.env) {
  validateEnv(env);
  return buildConfig(env);
}

/**
 * Validate the environment and build the configuration, failing fast by
 * exiting the process when required variables are missing (Req 29.5).
 *
 * The logger and exit function are injectable so this is testable without
 * actually terminating the test runner.
 *
 * @param {object} [options]
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @param {(code?: number) => never} [options.exit=process.exit]
 * @param {{ error: (...args: any[]) => void }} [options.logger=console]
 */
export function loadConfigOrExit({
  env = process.env,
  exit = process.exit,
  logger = console,
} = {}) {
  try {
    return loadConfig(env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      logger.error(`[startup] ${error.message}`);
    } else {
      logger.error(`[startup] Environment configuration failed: ${error.message}`);
    }
    // Fail fast — the application must not start in an invalid state.
    return exit(1);
  }
}

export default loadConfig;
