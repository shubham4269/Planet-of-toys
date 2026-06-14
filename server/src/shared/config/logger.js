/**
 * Server-side logger (Req 27.5).
 *
 * A thin, dependency-free logging utility that writes structured, full-detail
 * log entries to the server console (stdout/stderr). It exists so that the
 * central error handler (and other services) can record complete error
 * detail — message, stack, and context — ONLY on the server side, while the
 * client receives nothing but a generic message (Req 27.1–27.4).
 *
 * The implementation is intentionally minimal: it formats a timestamped,
 * level-tagged line plus a JSON-serialized metadata payload. The underlying
 * sink (`console` by default) is injectable so callers and tests can capture
 * or redirect output without monkey-patching globals.
 *
 * IMPORTANT: This logger is for SERVER-SIDE output only. Its output must never
 * be forwarded verbatim to an HTTP response.
 */

/** Supported log levels mapped to their console method. */
const LEVEL_METHODS = Object.freeze({
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
});

/**
 * Safely serialize a metadata object to JSON, tolerating circular references
 * and non-serializable values (e.g. BigInt, functions). Never throws.
 *
 * @param {unknown} meta
 * @returns {string}
 */
function safeStringify(meta) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      meta,
      (key, value) => {
        if (typeof value === "bigint") return value.toString();
        if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      }
    );
  } catch {
    return String(meta);
  }
}

/**
 * Normalize an Error into a fully-detailed, server-side-only plain object.
 * Captures message, name, stack, status, and any custom enumerable props.
 *
 * @param {unknown} error
 * @returns {Record<string, unknown>}
 */
export function serializeErrorForLog(error) {
  if (error instanceof Error) {
    const detail = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    // Capture custom enumerable properties (e.g. statusCode, context, code).
    for (const key of Object.keys(error)) {
      if (!(key in detail)) {
        detail[key] = error[key];
      }
    }
    return detail;
  }
  return { message: String(error) };
}

/**
 * Create a logger bound to a particular sink.
 *
 * @param {object} [options]
 * @param {Console | { debug?: Function, info?: Function, warn?: Function, error?: Function, log?: Function }} [options.sink=console]
 *   The output sink. Defaults to the global `console`.
 * @param {() => Date} [options.now=() => new Date()] Clock injection for tests.
 */
export function createLogger({ sink = console, now = () => new Date() } = {}) {
  function write(level, message, meta) {
    const methodName = LEVEL_METHODS[level] || "log";
    const fn =
      typeof sink[methodName] === "function"
        ? sink[methodName].bind(sink)
        : typeof sink.log === "function"
          ? sink.log.bind(sink)
          : () => {};

    const timestamp = now().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (meta !== undefined && meta !== null) {
      fn(`${prefix} ${message} ${safeStringify(meta)}`);
    } else {
      fn(`${prefix} ${message}`);
    }
  }

  return Object.freeze({
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  });
}

/** Default application logger writing to the server console. */
export const logger = createLogger();

export default logger;
