import { describe, it, expect, vi } from "vitest";
import {
  createRequireAuth,
  extractBearerToken,
} from "./requireAuth.js";
import { AppError } from "./errorHandler.js";
import { TokenError } from "../services/auth.service.js";

/** Build a minimal Express-like request with the given Authorization header. */
function reqWith(authorization) {
  return { headers: authorization === undefined ? {} : { authorization } };
}

/** Run a middleware and capture what it passes to `next`. */
function run(middleware, req) {
  return new Promise((resolve) => {
    const res = {};
    middleware(req, res, (err) => resolve(err));
  });
}

describe("extractBearerToken", () => {
  it("extracts a bearer token (case-insensitive scheme)", () => {
    expect(extractBearerToken(reqWith("Bearer abc.def.ghi"))).toBe(
      "abc.def.ghi"
    );
    expect(extractBearerToken(reqWith("bearer abc.def.ghi"))).toBe(
      "abc.def.ghi"
    );
  });

  it("returns null when the header is absent or not a bearer token", () => {
    expect(extractBearerToken(reqWith(undefined))).toBeNull();
    expect(extractBearerToken(reqWith(""))).toBeNull();
    expect(extractBearerToken(reqWith("Basic xyz"))).toBeNull();
    expect(extractBearerToken(reqWith("Bearer "))).toBeNull();
  });
});

describe("requireAuth guard", () => {
  it("calls next() with no error and attaches req.admin on a valid token (Req 14.3)", async () => {
    const payload = { sub: "admin-1", email: "a@b.com" };
    const verify = vi.fn().mockReturnValue(payload);
    const guard = createRequireAuth({ verify });

    const req = reqWith("Bearer good-token");
    const err = await run(guard, req);

    expect(err).toBeUndefined();
    expect(verify).toHaveBeenCalledWith("good-token", expect.any(Object));
    expect(req.admin).toEqual(payload);
  });

  it("rejects a request with no token as 401 (Req 19.5)", async () => {
    const verify = vi.fn();
    const guard = createRequireAuth({ verify });

    const err = await run(guard, reqWith(undefined));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    // The verifier is never invoked when the token is absent.
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an expired token as 401 (Req 21.2)", async () => {
    const verify = vi.fn(() => {
      throw new TokenError("expired", "expired");
    });
    const guard = createRequireAuth({ verify });

    const err = await run(guard, reqWith("Bearer expired-token"));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it("rejects a tampered/invalid token as 401 (Req 21.4)", async () => {
    const verify = vi.fn(() => {
      throw new TokenError("invalid", "invalid");
    });
    const guard = createRequireAuth({ verify });

    const err = await run(guard, reqWith("Bearer tampered-token"));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it("does not leak the token-failure reason in the client message", async () => {
    const verify = vi.fn(() => {
      throw new TokenError("internal detail", "expired");
    });
    const guard = createRequireAuth({ verify });

    const err = await run(guard, reqWith("Bearer x"));
    // AppError for 401 carries no explicit clientMessage, so the central
    // handler emits the generic per-status message rather than internal text.
    expect(err.clientMessage).toBeUndefined();
  });

  it("forwards unexpected (non-token) errors to the error handler", async () => {
    const boom = new Error("config blew up");
    const verify = vi.fn(() => {
      throw boom;
    });
    const guard = createRequireAuth({ verify });

    const err = await run(guard, reqWith("Bearer x"));
    expect(err).toBe(boom);
  });
});
