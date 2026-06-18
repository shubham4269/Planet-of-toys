/**
 * Central error handling (Req 27.1–27.5).
 *
 * Provides:
 *  - {@link errorHandler}: the single Express error-handling middleware that
 *    catches every thrown/rejected error, records full detail to the
 *    server-side log (Req 27.5), and returns ONLY a generic message plus an
 *    appropriate status to the client (Req 27.1–27.4).
 *  - {@link notFoundHandler}: a small helper to convert unmatched routes into a
 *    404 AppError funneled through the same path.
 *
 * The operational {@link AppError} type and the pure status/message resolvers
 * live in the framework-free error model under `../errors` and are re-exported
 * here for backward compatibility with existing import sites.
 *
 * Information-disclosure guarantee: the response body is constructed from a
 * fixed shape — `{ error: { message, status } }` — using either a generic
 * message or, for {@link AppError} instances, an explicitly-vetted
 * `clientMessage`. Stack traces, database schema, filesystem paths, secrets,
 * tokens, and any other internal detail are never copied into the response.
 */

import { logger as defaultLogger, serializeErrorForLog } from "../config/logger.js";
import {
  AppError,
  GENERIC_ERROR_MESSAGE,
  resolveStatusCode,
  resolveClientMessage,
} from "../errors/index.js";

// Re-export the error model so existing import sites (`AppError`, the resolvers,
// and the generic message constant) continue to resolve through this module.
export {
  AppError,
  GENERIC_ERROR_MESSAGE,
  resolveStatusCode,
  resolveClientMessage,
};

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
