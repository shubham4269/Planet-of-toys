/**
 * Central error handling (Req 27.1–27.5).
 *
 * Provides:
 *  - {@link AppError}: a lightweight error carrying an HTTP status code and an
 *    optional client-safe message for *known* error conditions.
 *  - {@link errorHandler}: the single Express error-handling middleware that
 *    catches every thrown/rejected error, records full detail to the
 *    server-side log (Req 27.5), and returns ONLY a generic message plus an
 *    appropriate status to the client (Req 27.1–27.4).
 *  - {@link notFoundHandler}: a small helper to convert unmatched routes into a
 *    404 AppError funneled through the same path.
 *
 * Information-disclosure guarantee: the response body is constructed from a
 * fixed shape — `{ error: { message, status } }` — using either a generic
 * message or, for {@link AppError} instances, an explicitly-vetted
 * `clientMessage`. Stack traces, database schema, filesystem paths, secrets,
 * tokens, and any other internal detail are never copied into the response.
 */

import { logger as defaultLogger, serializeErrorForLog } from "../config/logger.js";

/** Generic, client-safe fallback message used for unknown/500-class errors. */
export const GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again later.";

/**
 * Default client-safe messages for common HTTP status codes. Used when an
 * {@link AppError} does not supply its own `clientMessage`. These are
 * deliberately generic and free of internal detail.
 */
const STATUS_MESSAGES = Object.freeze({
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

/**
 * Create the central Express error-handling middleware.
 *
 * The logger is injectable for testability; in production the default
 * server-side logger is used.
 *
 * @param {object} [options]
 * @param {{ error: Function, warn: Function }} [options.logger]
 * @returns {import("express").ErrorRequestHandler}
 */
export function createErrorHandler({ logger = defaultLogger } = {}) {
  // Express identifies error-handling middleware by its four-arg signature.
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    const statusCode = resolveStatusCode(err);
    const clientMessage = resolveClientMessage(err, statusCode);

    // Record FULL detail server-side only (Req 27.5). Includes stack, custom
    // properties, request method/path/id, and the underlying cause.
    const logContext = {
      statusCode,
      method: req?.method,
      path: req?.originalUrl ?? req?.url,
      requestId: req?.id,
      error: serializeErrorForLog(err),
    };
    if (err && err.cause !== undefined) {
      logContext.cause = serializeErrorForLog(err.cause);
    }

    const logLevel = statusCode >= 500 ? "error" : "warn";
    logger[logLevel]?.(`Request error (${statusCode})`, logContext);

    // If headers are already sent, delegate to Express' default handler which
    // closes the connection rather than attempting to write a second response.
    if (res.headersSent) {
      return next(err);
    }

    // Construct a fixed-shape, client-safe body. No raw error fields are ever
    // spread/copied in here, guaranteeing zero internal disclosure.
    res.status(statusCode).json({
      error: {
        message: clientMessage,
        status: statusCode,
      },
    });
  };
}

/** Default central error handler wired to the server-side logger. */
export const errorHandler = createErrorHandler();

/**
 * Express middleware that turns any unmatched route into a 404 {@link AppError}
 * routed through the central error handler. Mount this AFTER all routers and
 * BEFORE the error handler.
 *
 * @type {import("express").RequestHandler}
 */
export function notFoundHandler(req, res, next) {
  next(
    new AppError(`Route not found: ${req.method} ${req.originalUrl ?? req.url}`, 404)
  );
}

export default errorHandler;
