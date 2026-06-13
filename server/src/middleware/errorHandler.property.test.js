// Feature: planet-of-toys-ecommerce, Property 40: Error responses disclose no internal detail
//
// Property 40: Error responses disclose no internal detail
// "For any internal error raised while processing a request, the customer-facing
//  response is a generic error message containing no stack trace, database schema
//  information, filesystem path, secret, token, or internal server detail."
//
// Validates: Requirements 27.1, 27.2, 27.3, 27.4
//
// Strategy: generate arbitrary errors whose INTERNAL-only fields (message, stack,
// cause, and arbitrary custom properties) are stuffed with sensitive content —
// stack traces, filesystem paths, secrets, access tokens, DB connection strings,
// and database-schema descriptions. Each sensitive fragment carries a unique
// random nonce so a substring match in the serialized response is unambiguous
// proof of leakage. The error handler's response body must always be the fixed
// generic shape and must never contain any of those injected fragments.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import {
  AppError,
  GENERIC_ERROR_MESSAGE,
  createErrorHandler,
} from "./errorHandler.js";

/** Silent logger so property runs don't spam the test output. */
function makeLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

/** Minimal mock Express response capturing status + json body. */
function makeRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

/**
 * The complete set of messages the handler is allowed to expose. Any response
 * message MUST be one of these — never anything derived from the raw error.
 */
const ALLOWED_MESSAGES = new Set([
  GENERIC_ERROR_MESSAGE,
  "The request was invalid.",
  "Authentication is required.",
  "You do not have permission to perform this action.",
  "The requested resource was not found.",
  "The request conflicts with the current state.",
  "The request payload is too large.",
  "The request could not be processed.",
  "Too many requests. Please try again later.",
]);

/** A short unique nonce used to make leak detection unambiguous. */
const nonce = () =>
  fc.string({
    minLength: 6,
    maxLength: 12,
    unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  });

/**
 * Generates a single sensitive fragment together with the list of substrings
 * that must NOT appear in any response body. Each fragment embeds a unique
 * nonce so the assertion cannot match by coincidence.
 */
const sensitiveFragment = fc.oneof(
  // Filesystem paths (POSIX + Windows).
  nonce().map((n) => {
    const value = `/var/app/server/src/models/order_${n}.model.js`;
    return { value, leaks: [value, `order_${n}.model.js`, n] };
  }),
  nonce().map((n) => {
    const value = `C:\\planet-of-toys\\server\\src\\config\\secret_${n}.js`;
    return { value, leaks: [value, n] };
  }),
  // API secrets / keys.
  nonce().map((n) => {
    const value = `sk_live_${n}`;
    return { value, leaks: [value, n] };
  }),
  // Access tokens.
  nonce().map((n) => {
    const value = `Bearer eyJ${n}.payload.sig`;
    return { value, leaks: [value, `eyJ${n}`, n] };
  }),
  // DB connection strings (with embedded credentials).
  nonce().map((n) => {
    const value = `mongodb://admin:p${n}@db.internal:27017/planetoftoys`;
    return { value, leaks: [value, `p${n}`, n] };
  }),
  // Database schema detail.
  nonce().map((n) => {
    const value = `OrderSchema { _id: ObjectId, amount: Number, field_${n}: String }`;
    return { value, leaks: [value, `field_${n}`, n] };
  }),
  // Internal stack-trace frame.
  nonce().map((n) => {
    const value = `at Object.handler (/srv/internal/stack_${n}.js:42:13)`;
    return { value, leaks: [value, `stack_${n}.js`, n] };
  })
);

/** A nonempty collection of sensitive fragments. */
const sensitivePayload = fc.array(sensitiveFragment, {
  minLength: 1,
  maxLength: 6,
});

/**
 * Builds an arbitrary error variant carrying the supplied sensitive fragments
 * exclusively in internal-only locations (message / stack / cause / custom
 * fields). The vetted client message, when present, is always safe and free of
 * the sensitive payload.
 */
function buildError(fragments, variant, status) {
  const blob = fragments.map((f) => f.value).join(" | ");
  const stack = `Error: ${blob}\n  ${fragments
    .map((f) => `at frame (${f.value})`)
    .join("\n  ")}`;

  let err;
  switch (variant) {
    case "plain": {
      err = new Error(`internal failure: ${blob}`);
      err.stack = stack;
      break;
    }
    case "appError": {
      err = new AppError(`internal failure: ${blob}`, status);
      err.stack = stack;
      break;
    }
    case "appErrorVettedMessage": {
      err = new AppError(`internal failure: ${blob}`, status, {
        clientMessage: "Please review your request and try again.",
      });
      err.stack = stack;
      break;
    }
    case "withCause": {
      const cause = new Error(`root cause: ${blob}`);
      cause.stack = stack;
      err = new AppError("wrapper failure", status, { cause });
      break;
    }
    case "plainObject": {
      err = { status, message: `internal failure: ${blob}`, stack };
      break;
    }
    default: {
      err = new Error(`internal failure: ${blob}`);
      err.stack = stack;
    }
  }

  // Attach the sensitive payload as arbitrary custom properties too, ensuring
  // the handler does not blindly spread/serialize error fields.
  if (err && typeof err === "object") {
    err.connectionString = blob;
    err.internalContext = { schema: blob, path: blob };
  }
  return err;
}

describe("Property 40: Error responses disclose no internal detail", () => {
  it("never leaks stack, paths, secrets, tokens, or schema into the response body", () => {
    fc.assert(
      fc.property(
        sensitivePayload,
        fc.constantFrom(
          "plain",
          "appError",
          "appErrorVettedMessage",
          "withCause",
          "plainObject"
        ),
        fc.constantFrom(400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503),
        fc.constantFrom("GET", "POST", "PUT", "PATCH", "DELETE"),
        (fragments, variant, status, method) => {
          const handler = createErrorHandler({ logger: makeLogger() });
          const res = makeRes();
          const req = { method, originalUrl: "/api/resource", id: "req-test" };

          const err = buildError(fragments, variant, status);
          handler(err, req, res, vi.fn());

          // 1. Response body is the fixed generic shape: only message + status.
          expect(res.body).toBeDefined();
          expect(Object.keys(res.body)).toEqual(["error"]);
          expect(Object.keys(res.body.error).sort()).toEqual([
            "message",
            "status",
          ]);
          expect(typeof res.body.error.message).toBe("string");
          expect(res.body.error.status).toBe(res.statusCode);

          // 2. The exposed message is always one of the vetted, generic messages
          //    (or the explicitly-vetted 4xx client message).
          const msg = res.body.error.message;
          const isVetted =
            ALLOWED_MESSAGES.has(msg) ||
            msg === "Please review your request and try again.";
          expect(isVetted).toBe(true);

          // 3. No sensitive fragment (or its nonce) appears anywhere in the body.
          const serialized = JSON.stringify(res.body);
          for (const fragment of fragments) {
            for (const leak of fragment.leaks) {
              expect(serialized.includes(leak)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
