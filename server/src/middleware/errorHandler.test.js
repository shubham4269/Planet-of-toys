import { describe, it, expect, vi } from "vitest";
import express from "express";
import {
  AppError,
  GENERIC_ERROR_MESSAGE,
  createErrorHandler,
  errorHandler,
  notFoundHandler,
  resolveStatusCode,
  resolveClientMessage,
} from "./errorHandler.js";

function makeLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

/** Minimal mock Express response capturing status + json body. */
function makeRes({ headersSent = false } = {}) {
  const res = {
    headersSent,
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
  return res;
}

describe("AppError", () => {
  it("defaults to status 500 and marks operational", () => {
    const err = new AppError("boom");
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("carries an explicit status and client-safe message", () => {
    const err = new AppError("internal detail", 404, {
      clientMessage: "Not here",
    });
    expect(err.statusCode).toBe(404);
    expect(err.clientMessage).toBe("Not here");
  });
});

describe("resolveStatusCode", () => {
  it("uses a valid AppError status", () => {
    expect(resolveStatusCode(new AppError("x", 422))).toBe(422);
  });

  it("reads a plain error's status/statusCode field", () => {
    expect(resolveStatusCode({ status: 401 })).toBe(401);
    expect(resolveStatusCode({ statusCode: 409 })).toBe(409);
  });

  it("falls back to 500 for unknown or invalid statuses", () => {
    expect(resolveStatusCode(new Error("x"))).toBe(500);
    expect(resolveStatusCode({ statusCode: 200 })).toBe(500);
    expect(resolveStatusCode({ statusCode: 999 })).toBe(500);
    expect(resolveStatusCode("not an object")).toBe(500);
  });
});

describe("resolveClientMessage", () => {
  it("always uses the generic message for 5xx", () => {
    const err = new AppError("db connection string leaked", 500, {
      clientMessage: "should be ignored for 5xx",
    });
    expect(resolveClientMessage(err, 500)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("uses the vetted client message for operational 4xx errors", () => {
    const err = new AppError("internal", 400, { clientMessage: "Bad input" });
    expect(resolveClientMessage(err, 400)).toBe("Bad input");
  });

  it("uses a generic per-status message for plain 4xx errors", () => {
    expect(resolveClientMessage(new Error("x"), 404)).toBe(
      "The requested resource was not found."
    );
    expect(resolveClientMessage(new Error("x"), 429)).toBe(
      "Too many requests. Please try again later."
    );
  });
});

describe("errorHandler middleware", () => {
  it("returns a fixed-shape generic body for unexpected errors", () => {
    const logger = makeLogger();
    const handler = createErrorHandler({ logger });
    const res = makeRes();

    handler(new Error("secret detail"), { method: "GET", url: "/x" }, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { message: GENERIC_ERROR_MESSAGE, status: 500 },
    });
  });

  it("never leaks stack, paths, secrets, or schema into the response", () => {
    const logger = makeLogger();
    const handler = createErrorHandler({ logger });
    const res = makeRes();

    const err = new Error(
      "Cast to ObjectId failed at /var/app/server/src/models/order.model.js — token=abcd1234 secret=sk_live_X"
    );
    err.stack = "Error: ...\n  at /var/app/server/src/models/order.model.js:42";
    err.connectionString = "mongodb://user:p@ss@localhost:27017/db";

    handler(err, { method: "POST", url: "/api/orders" }, res, vi.fn());

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("ObjectId");
    expect(serialized).not.toContain("/var/app");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("secret=");
    expect(serialized).not.toContain("mongodb://");
    expect(serialized).not.toContain(".model.js");
    expect(res.body).toEqual({
      error: { message: GENERIC_ERROR_MESSAGE, status: 500 },
    });
  });

  it("logs full detail server-side at error level for 5xx", () => {
    const logger = makeLogger();
    const handler = createErrorHandler({ logger });
    const res = makeRes();
    const err = new Error("internal kaboom");

    handler(err, { method: "GET", url: "/boom", id: "req-1" }, res, vi.fn());

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [, context] = logger.error.mock.calls[0];
    expect(context.statusCode).toBe(500);
    expect(context.method).toBe("GET");
    expect(context.path).toBe("/boom");
    expect(context.requestId).toBe("req-1");
    expect(context.error.message).toBe("internal kaboom");
    expect(typeof context.error.stack).toBe("string");
  });

  it("logs 4xx operational errors at warn level and exposes the vetted message", () => {
    const logger = makeLogger();
    const handler = createErrorHandler({ logger });
    const res = makeRes();

    handler(
      new AppError("validation failed on field email", 400, {
        clientMessage: "Please check the highlighted fields.",
      }),
      { method: "POST", url: "/api/checkout" },
      res,
      vi.fn()
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { message: "Please check the highlighted fields.", status: 400 },
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("delegates to next when headers are already sent", () => {
    const logger = makeLogger();
    const handler = createErrorHandler({ logger });
    const res = makeRes({ headersSent: true });
    const next = vi.fn();
    const err = new Error("late error");

    handler(err, { method: "GET", url: "/x" }, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.body).toBeUndefined();
  });
});

describe("notFoundHandler", () => {
  it("forwards a 404 AppError to next", () => {
    const next = vi.fn();
    notFoundHandler({ method: "GET", originalUrl: "/missing" }, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
  });
});

describe("integration via Express", () => {
  it("returns generic 500 through a real Express pipeline", async () => {
    const app = express();
    app.get("/throws", () => {
      throw new Error("boom with /etc/passwd and token=xyz");
    });
    // Use a quiet logger so the test output stays clean.
    app.use(createErrorHandler({ logger: makeLogger() }));

    const server = await listen(app);
    try {
      const { port } = server.address();
      const r = await fetch(`http://127.0.0.1:${port}/throws`);
      const body = await r.json();
      expect(r.status).toBe(500);
      expect(body).toEqual({
        error: { message: GENERIC_ERROR_MESSAGE, status: 500 },
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

/** Start an Express app on an ephemeral port; resolves with the server. */
function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

// Sanity that the default exported handler is wired and four-arg (Express err mw).
describe("default errorHandler export", () => {
  it("has the four-argument error-middleware signature", () => {
    expect(errorHandler.length).toBe(4);
  });
});
