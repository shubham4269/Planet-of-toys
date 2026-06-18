/**
 * Application error model (Req 27.1–27.5).
 *
 * Defines the operational {@link AppError} type and the pure helpers used to
 * resolve a client-safe HTTP status and message for any thrown error. The
 * central error-handling middleware ({@link module:shared/middleware/errorHandler})
 * builds on this model; keeping the model here gives modules a dependency-free
 * place to import {@link AppError} without pulling in Express middleware.
 *
 * Information-disclosure guarantee: client messages are constructed only from a
 * fixed set of generic strings or an explicitly-vetted `clientMessage`. Internal
 * detail (stack traces, schema, paths, secrets) is never surfaced here.
 */

/** Generic, client-safe fallback message used for unknown/500-class errors. */
export const GENERIC_ERROR_MESSAGE =
  "An unexpected error occurred. Please try again later.";

/**
 * Default client-safe messages for common HTTP status codes. Used when an
 * {@link AppError} does not supply its own `clientMessage`. These are
 * deliberately generic and free of internal detail.
 */
export const STATUS_MESSAGES = Object.freeze({
  400: "The request was invalid.",
  401: "Authentication is required.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "The request conflicts with the current state.",
  413: "The request payload is too large.",
  422: "The request could not be processed.",
  429: "Too many requests. Please try again later.",
});

/**
 * A known, operational error with an associated HTTP status code and an
 * explicitly client-safe message. Service and controller code should throw
 * `AppError` for conditions that map to a specific status (e.g. validation,
 * not-found, unauthorized). Anything else is treated as an unexpected 500.
 */
export class AppError extends Error {
  /**
   * @param {string} message Internal message (logged server-side).
   * @param {number} [statusCode=500] HTTP status to return to the client.
   * @param {object} [options]
   * @param {string} [options.clientMessage] Vetted message safe to expose to
   *   the client. When omitted, a generic per-status message is used. For
   *   5xx statuses the generic 500 message is always used regardless.
   * @param {unknown} [options.cause] Underlying error (logged, never exposed).
   */
  constructor(message, statusCode = 500, { clientMessage, cause } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    if (clientMessage !== undefined) this.clientMessage = clientMessage;
    if (cause !== undefined) this.cause = cause;
    // Maintain a clean stack where supported.
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/** True when `value` is an integer HTTP status code in the valid range. */
function isValidStatus(value) {
  return Number.isInteger(value) && value >= 400 && value <= 599;
}

/**
 * Resolve the HTTP status code to return for a given error. Falls back to 500
 * for anything that is not an {@link AppError} with a valid status, so internal
 * faults never accidentally surface as a 2xx/3xx.
 *
 * @param {unknown} error
 * @returns {number}
 */
export function resolveStatusCode(error) {
  if (error && typeof error === "object") {
    const candidate = error.statusCode ?? error.status;
    if (isValidStatus(candidate)) return candidate;
  }
  return 500;
}

/**
 * Build the client-safe message for an error + status. Never derives the
 * message from raw error text for unknown/5xx errors, preventing leakage of
 * internal detail (Req 27.2–27.4).
 *
 * @param {unknown} error
 * @param {number} statusCode
 * @returns {string}
 */
export function resolveClientMessage(error, statusCode) {
  // Server-side faults: always the fixed generic message.
  if (statusCode >= 500) return GENERIC_ERROR_MESSAGE;

  // Known operational errors may carry an explicitly-vetted client message.
  if (error instanceof AppError && typeof error.clientMessage === "string") {
    return error.clientMessage;
  }

  // Otherwise use a generic per-status message; fall back to the generic one.
  return STATUS_MESSAGES[statusCode] || GENERIC_ERROR_MESSAGE;
}
