import { Admin as DefaultAdmin } from "../models/index.js";
import {
  verifyPassword as defaultVerifyPassword,
  issueToken as defaultIssueToken,
} from "../services/auth.service.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Auth controller (Req 14.2, 25.3, 25.4).
 *
 * Thin HTTP layer over the Auth Service for administrator login. It:
 *  - Looks up the administrator by email and verifies the submitted password
 *    against the stored bcrypt hash (Req 22.3).
 *  - On success, issues a signed JWT and returns `{ token }` (Req 14.1).
 *  - On ANY failure — a wrong password for a registered email, an unregistered
 *    email, or missing/malformed input — returns the SAME generic 401 response
 *    that never reveals which credential field was incorrect (Req 14.2, 25.3,
 *    25.4). The constant-shape failure is the core security property here.
 *  - Records each attempt's outcome with the injected brute-force tracker so a
 *    source can be temporarily blocked after too many failures (Req 25.2).
 *
 * Every collaborator (the Admin model, password verifier, token issuer, the
 * brute-force tracker, and an optional audit recorder) is injected so the
 * controller stays decoupled and testable; sensible defaults wire the real
 * services for production use.
 */

/**
 * The single generic authentication-failure message. Identical for wrong
 * passwords and unregistered emails so the two are indistinguishable
 * (Req 14.2, 25.3, 25.4).
 */
export const GENERIC_AUTH_FAILURE_MESSAGE =
  "Invalid email or password.";

/** Build a generic 401 error funneled through the central error handler. */
function authFailure() {
  return new AppError("Administrator authentication failed.", 401, {
    clientMessage: GENERIC_AUTH_FAILURE_MESSAGE,
  });
}

/**
 * Create the administrator login request handler.
 *
 * @param {object} [options]
 * @param {{ findOne: Function }} [options.Admin] Admin model.
 * @param {(plain: string, hash: string) => Promise<boolean>} [options.verifyPassword]
 * @param {(admin: object, opts?: object) => string} [options.issueToken]
 * @param {{ recordFailure: Function, recordSuccess: Function, keyFor: Function }} [options.bruteForce]
 *   Brute-force tracker. Optional; when omitted no per-source tracking occurs.
 * @param {(req: import("express").Request) => { record: Function }} [options.recordAudit]
 *   Optional audit recorder factory (used by task 6.8 to log successful logins).
 * @param {Record<string, string|undefined>} [options.env]
 * @returns {import("express").RequestHandler}
 */
export function createLoginHandler({
  Admin = DefaultAdmin,
  verifyPassword = defaultVerifyPassword,
  issueToken = defaultIssueToken,
  bruteForce,
  recordAudit,
  env,
} = {}) {
  return async function login(req, res, next) {
    // The guard middleware sets `req.loginSourceKey`; fall back to deriving it
    // directly so the handler also works when used without the guard.
    const sourceKey =
      req.loginSourceKey ?? bruteForce?.keyFor?.(req);

    const onFailure = () => {
      if (bruteForce && sourceKey !== undefined) {
        bruteForce.recordFailure(sourceKey);
      }
      return next(authFailure());
    };

    try {
      const body = req.body ?? {};
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      // Missing/malformed credentials are treated as a generic failure — never
      // a distinct validation error that could leak field-level detail.
      if (email === "" || password === "") {
        return onFailure();
      }

      // Email is stored lowercased on the Admin model.
      const admin = await Admin.findOne({ email: email.toLowerCase() });

      // Unregistered email: identical outcome to a wrong password (Req 25.4).
      if (!admin) {
        return onFailure();
      }

      const matches = await verifyPassword(password, admin.passwordHash);
      if (!matches) {
        return onFailure();
      }

      // Success: clear any accumulated failures for this source.
      if (bruteForce && sourceKey !== undefined) {
        bruteForce.recordSuccess(sourceKey);
      }

      const token = issueToken(admin, env ? { env } : undefined);

      // Best-effort audit of the successful login (Req 26.1); never blocks login.
      if (typeof recordAudit === "function") {
        try {
          await recordAudit(req)?.record?.({
            action: "ADMIN_LOGIN",
            admin,
          });
        } catch {
          // Audit failures must not affect the login outcome.
        }
      }

      return res.status(200).json({ token });
    } catch (err) {
      return next(err);
    }
  };
}

export default createLoginHandler;
