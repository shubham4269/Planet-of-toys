import { verifyToken as defaultVerifyToken, TokenError } from "../../modules/auth/auth.service.js";
import { AppError } from "./errorHandler.js";

/**
 * Administrator route guard (Req 14.3, 19.5, 21.2, 21.4).
 *
 * `requireAuth` is the Express middleware that protects every admin and
 * settings route. It extracts a Bearer JWT from the `Authorization` header and
 * delegates to the Auth Service's {@link verifyToken} to validate the token's
 * signature and expiry. Any failure — a missing, malformed, expired, or
 * tampered token — results in the request being rejected with a generic
 * `401 Unauthorized` funneled through the central error handler, which emits
 * only a client-safe message (Req 27). On success the verified token payload is
 * attached to `req.admin` for downstream handlers.
 *
 * The verifier is injectable so the guard can be unit-tested without minting
 * real tokens and so wiring can supply an environment-scoped verifier.
 */

/**
 * Extract the bearer token from a request's `Authorization` header.
 *
 * Accepts the standard `Authorization: Bearer <token>` form (scheme match is
 * case-insensitive). Returns `null` when the header is absent or does not carry
 * a non-empty bearer token, so the guard treats it as a missing token.
 *
 * @param {import("express").Request} req
 * @returns {string|null} the raw token, or null when none is present
 */
export function extractBearerToken(req) {
  const header = req?.headers?.authorization;
  if (typeof header !== "string") return null;

  const match = /^Bearer (.+)$/i.exec(header.trim());
  if (!match) return null;

  const token = match[1].trim();
  return token === "" ? null : token;
}

/**
 * Create the `requireAuth` guard middleware.
 *
 * @param {object} [options]
 * @param {(token: string, opts?: object) => object} [options.verify=verifyToken]
 *   token verifier; defaults to the Auth Service implementation.
 * @param {Record<string, string|undefined>} [options.env=process.env]
 *   environment passed through to the verifier for secret resolution.
 * @returns {import("express").RequestHandler}
 */
export function createRequireAuth({ verify = defaultVerifyToken, env = process.env } = {}) {
  return function requireAuth(req, _res, next) {
    const token = extractBearerToken(req);

    if (token === null) {
      // No credentials presented on a protected route (Req 19.5, 14.3).
      return next(new AppError("Authentication token is missing.", 401));
    }

    try {
      // Validates signature + expiry; throws TokenError otherwise
      // (Req 14.3, 21.2, 21.4).
      const payload = verify(token, { env });
      req.admin = payload;
      return next();
    } catch (err) {
      if (err instanceof TokenError) {
        // Map every rejection path to a generic 401; the specific reason is
        // recorded server-side via the error's message/code, never exposed.
        return next(
          new AppError(`Authentication failed: ${err.code}.`, 401, { cause: err })
        );
      }
      // Unexpected failure (e.g. misconfiguration) — let the central handler
      // classify and log it without leaking detail.
      return next(err);
    }
  };
}

/** Default guard wired to the Auth Service verifier and process environment. */
export const requireAuth = createRequireAuth();

export default requireAuth;
