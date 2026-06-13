import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { buildConfig } from "../config/env.js";

/**
 * Auth Service — password hashing/verification and JWT issuance/validation
 * (Req 14.1, 14.3, 14.4, 21.1, 21.2, 21.4, 22.1, 22.2, 22.3).
 *
 * Administrator passwords are protected with bcrypt:
 *  - {@link hashPassword} produces a salted bcrypt hash for storage; plaintext
 *    passwords are never persisted (Req 22.1, 22.2). Only the resulting hash is
 *    stored on the Admin model (`passwordHash`).
 *  - {@link verifyPassword} compares a submitted plaintext against a stored
 *    bcrypt hash using bcrypt's constant-time comparison (Req 22.3).
 *
 * bcrypt embeds a per-hash random salt inside the produced hash string, so the
 * salted-hash storage requirement (Req 14.4) is satisfied without managing
 * salts separately.
 *
 * Administrator sessions are JWT-based:
 *  - {@link issueToken} signs a JWT for an authenticated administrator using
 *    the bootstrap JWT secret and an expiry read from the configured
 *    `SESSION_EXPIRATION` (Req 14.1, 21.1).
 *  - {@link verifyToken} validates a token's signature and expiry, throwing for
 *    missing, expired, or tampered tokens (Req 14.3, 21.2, 21.4). The
 *    `requireAuth` Express middleware (see ../middleware/requireAuth.js) wraps
 *    this to guard admin and settings routes.
 *
 * The JWT secret and session expiration are read lazily (per call) from
 * {@link buildConfig} so the service honours the current environment and can be
 * exercised in tests without a module-load-time dependency on a particular
 * configuration.
 */

/**
 * Default bcrypt cost factor (work factor). 10 rounds is a sensible balance
 * between resistance to offline attacks and login latency for an admin panel.
 */
export const BCRYPT_COST = 10;

/** Raised when password hashing/verification receives invalid input. */
export class PasswordError extends Error {
  constructor(message) {
    super(message);
    this.name = "PasswordError";
  }
}

/** Raised when JWT issuance/validation cannot proceed due to configuration. */
export class AuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthConfigError";
  }
}

/**
 * Raised when a JWT is missing, malformed, expired, or has an invalid
 * signature. Carries a stable `code` (`"missing" | "expired" | "invalid"`) so
 * callers (e.g. the route guard) can react without inspecting message text.
 */
export class TokenError extends Error {
  /**
   * @param {string} message internal message (never exposed to clients)
   * @param {"missing"|"expired"|"invalid"} [code="invalid"]
   */
  constructor(message, code = "invalid") {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

/**
 * Hash a plaintext password into a salted bcrypt hash suitable for storage
 * (Req 22.1, 22.2; Req 14.4 salted hash).
 *
 * @param {string} plain the plaintext password
 * @param {number} [cost=BCRYPT_COST] the bcrypt cost factor
 * @returns {Promise<string>} the bcrypt hash (includes algorithm, cost, and salt)
 */
export async function hashPassword(plain, cost = BCRYPT_COST) {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new PasswordError("hashPassword requires a non-empty string password.");
  }
  const salt = await bcrypt.genSalt(cost);
  return bcrypt.hash(plain, salt);
}

/**
 * Verify a plaintext password against a stored bcrypt hash (Req 22.3).
 *
 * Returns `false` rather than throwing when the stored hash is missing or
 * malformed, so callers can treat any non-match as an authentication failure
 * without leaking which condition occurred (supports the generic-failure
 * behavior in Req 14.2 / Req 25.3).
 *
 * @param {string} plain the submitted plaintext password
 * @param {string} hash the stored bcrypt hash
 * @returns {Promise<boolean>} true when the password matches the hash
 */
export async function verifyPassword(plain, hash) {
  if (typeof plain !== "string" || typeof hash !== "string" || hash === "") {
    return false;
  }
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // A malformed/non-bcrypt hash is treated as a non-match, never an error.
    return false;
  }
}

// --- JWT issuance and validation -------------------------------------------

/**
 * Resolve the JWT signing secret from the environment-only bootstrap config
 * (Req 29.1). Read lazily so the service honours the current environment and
 * stays testable. Throws {@link AuthConfigError} when the secret is absent.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {string} the configured JWT secret
 */
function resolveJwtSecret(env) {
  const { secrets } = buildConfig(env);
  const secret = secrets.jwtSecret;
  if (typeof secret !== "string" || secret.trim() === "") {
    throw new AuthConfigError(
      "JWT_SECRET is not configured; tokens cannot be issued or verified."
    );
  }
  return secret;
}

/**
 * Issue a signed JWT for an authenticated administrator (Req 14.1, 21.1).
 *
 * The token is signed with the environment-only bootstrap `JWT_SECRET` and its
 * expiry is read from the configured `SESSION_EXPIRATION` (exposed as
 * `config.auth.sessionExpiration`). The payload carries only non-sensitive
 * identity claims — the administrator id (as the standard `sub` claim) and
 * email — never the password hash or any secret.
 *
 * @param {{ id?: string, _id?: unknown, email?: string }} admin the authenticated admin
 * @param {object} [options]
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @returns {string} the signed, compact-serialized JWT
 */
export function issueToken(admin, { env = process.env } = {}) {
  if (!admin || typeof admin !== "object") {
    throw new AuthConfigError("issueToken requires an administrator object.");
  }

  const secret = resolveJwtSecret(env);
  const { auth } = buildConfig(env);

  const subject = admin.id ?? admin._id;
  if (subject === undefined || subject === null || String(subject) === "") {
    throw new AuthConfigError("issueToken requires an administrator identifier.");
  }

  const payload = { email: admin.email };

  return jwt.sign(payload, secret, {
    subject: String(subject),
    expiresIn: auth.sessionExpiration,
  });
}

/**
 * Verify a JWT's signature and expiry (Req 14.3, 21.2, 21.4).
 *
 * Throws {@link TokenError} with a stable `code` for every rejection path so a
 * caller (the {@link requireAuth} guard) can react without parsing messages:
 *  - `"missing"` — no token / not a non-empty string
 *  - `"expired"` — signature valid but the expiry has elapsed (Req 21.2)
 *  - `"invalid"` — malformed token or invalid signature (Req 21.4)
 *
 * @param {string} token the compact-serialized JWT
 * @param {object} [options]
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @returns {object} the decoded, verified token payload
 */
export function verifyToken(token, { env = process.env } = {}) {
  if (typeof token !== "string" || token.trim() === "") {
    throw new TokenError("No authentication token was provided.", "missing");
  }

  const secret = resolveJwtSecret(env);

  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenError("The authentication token has expired.", "expired");
    }
    // JsonWebTokenError (bad signature/malformed), NotBeforeError, etc.
    throw new TokenError("The authentication token is invalid.", "invalid");
  }
}

export default {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  BCRYPT_COST,
  PasswordError,
  AuthConfigError,
  TokenError,
};
