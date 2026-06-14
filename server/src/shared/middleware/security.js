import helmet from "helmet";
import cors from "cors";
import mongoSanitize from "express-mongo-sanitize";

/**
 * HTTP security and input-sanitization middleware (Req 19.3, 19.4).
 *
 * This module provides:
 *  - `securityHeaders()`  -> helmet HTTP security headers (Req 19.3)
 *  - `corsMiddleware()`   -> CORS restricted to configured allowed origins (Req 19.3)
 *  - `mongoSanitizer()`   -> express-mongo-sanitize, strips `$`/`.` keys (Req 19.4)
 *  - `xssSanitizer()`     -> escapes HTML and neutralizes operator-injection
 *                            keys in request input (Req 19.4)
 *  - `applySecurityMiddleware(app, options)` -> wires all of the above in order
 *
 * The pure helpers (`escapeHtml`, `neutralizeKey`, `sanitizeInput`) are exported
 * so the behavior can be unit/property tested without an HTTP server.
 */

/**
 * Characters that, when present in an object key, indicate a potential MongoDB
 * operator-injection attempt: `$`-prefixed operators (e.g. `$gt`, `$where`) and
 * dotted paths (e.g. `a.b`) used to reach nested fields.
 */
const PROHIBITED_KEY_PATTERN = /[$.]/g;

/**
 * Map of HTML-significant characters to their escaped entity equivalents. This
 * neutralizes cross-site scripting payloads while preserving the original text
 * as inert, displayable content (Req 19.4).
 */
const HTML_ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
});

/**
 * Escape HTML-significant characters in a string so that any embedded markup or
 * script is rendered inert while the underlying text content is preserved.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Neutralize an object key that could be used for MongoDB operator injection by
 * replacing every `$` and `.` with an underscore. A key composed solely of such
 * characters still yields a non-empty, harmless key.
 *
 * @param {string} key
 * @returns {string}
 */
export function neutralizeKey(key) {
  if (typeof key !== "string") return key;
  return key.replace(PROHIBITED_KEY_PATTERN, "_");
}

/**
 * Recursively sanitize an arbitrary input value:
 *  - string values are HTML-escaped (XSS neutralization)
 *  - object keys containing `$` or `.` are neutralized (operator-injection)
 *  - arrays and nested objects are processed element by element
 *
 * Returns a sanitized copy; the input is not mutated. Primitives other than
 * strings (numbers, booleans, null) are returned unchanged.
 *
 * @param {*} value
 * @returns {*}
 */
export function sanitizeInput(value) {
  if (typeof value === "string") {
    return escapeHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInput(item));
  }

  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[neutralizeKey(key)] = sanitizeInput(val);
    }
    return result;
  }

  return value;
}

/**
 * Sanitize the mutable request input containers in place. `req.query` is a
 * getter-backed object on some Express versions, so it is mutated key-by-key
 * rather than reassigned.
 *
 * @param {import("express").Request} req
 */
function sanitizeRequest(req) {
  for (const container of ["body", "params"]) {
    if (req[container] && typeof req[container] === "object") {
      req[container] = sanitizeInput(req[container]);
    }
  }

  // req.query may be a non-configurable accessor; mutate its own keys instead
  // of reassigning the property.
  if (req.query && typeof req.query === "object") {
    const sanitizedQuery = sanitizeInput(req.query);
    for (const key of Object.keys(req.query)) {
      delete req.query[key];
    }
    Object.assign(req.query, sanitizedQuery);
  }
}

/**
 * helmet HTTP security headers (Req 19.3).
 * @returns {import("express").RequestHandler}
 */
export function securityHeaders() {
  return helmet();
}

/**
 * CORS middleware restricted to the configured allowed origins (Req 19.3).
 *
 * Requests with no `Origin` header (server-to-server, curl, same-origin) are
 * permitted; requests from any origin not in the allow-list are rejected.
 *
 * @param {string[]} [allowedOrigins=[]]
 * @returns {import("express").RequestHandler}
 */
export function corsMiddleware(allowedOrigins = []) {
  const allowList = new Set(allowedOrigins);
  return cors({
    origin(origin, callback) {
      // Allow non-browser / same-origin requests that omit the Origin header.
      if (!origin || allowList.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  });
}

/**
 * express-mongo-sanitize middleware: removes keys containing `$` or `.` from
 * request payloads to prevent MongoDB operator injection (Req 19.4).
 * @returns {import("express").RequestHandler}
 */
export function mongoSanitizer() {
  return mongoSanitize({ replaceWith: "_" });
}

/**
 * XSS / operator-injection input sanitizer (Req 19.4). Escapes HTML in string
 * values and neutralizes `$`-prefixed and dotted keys across body, query, and
 * route params.
 * @returns {import("express").RequestHandler}
 */
export function xssSanitizer() {
  return function xssSanitize(req, _res, next) {
    try {
      sanitizeRequest(req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Apply the full HTTP security and input-sanitization stack to an Express app
 * in the correct order: security headers -> CORS -> mongo sanitize -> XSS
 * sanitize (Req 19.3, 19.4).
 *
 * @param {import("express").Express} app
 * @param {object} [options]
 * @param {string[]} [options.allowedOrigins=[]] configured CORS allow-list
 * @returns {import("express").Express} the same app, for chaining
 */
export function applySecurityMiddleware(app, { allowedOrigins = [] } = {}) {
  app.use(securityHeaders());
  app.use(corsMiddleware(allowedOrigins));
  app.use(mongoSanitizer());
  app.use(xssSanitizer());
  return app;
}

export default applySecurityMiddleware;
