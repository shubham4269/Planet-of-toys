import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  ADMIN_TOKEN_KEY,
  ADMIN_UNAUTHORIZED_EVENT,
  getToken,
  setToken,
  clearToken,
  decodeToken,
  isTokenExpired,
  isAuthenticated,
  notifyUnauthorized,
} from "./adminAuth.js";

/** Build a minimal JWT (header.payload.signature) with the given claims. */
function makeJwt(claims) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

describe("adminAuth token storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a stored token", () => {
    expect(getToken()).toBeNull();
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("abc.def.ghi");
  });

  it("clears a stored token", () => {
    setToken("abc.def.ghi");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("treats a falsy setToken value as a clear", () => {
    setToken("abc.def.ghi");
    setToken("");
    expect(getToken()).toBeNull();
  });
});

describe("adminAuth.decodeToken", () => {
  it("decodes the payload claims of a well-formed JWT", () => {
    const token = makeJwt({ sub: "admin", role: "admin", exp: 123 });
    expect(decodeToken(token)).toMatchObject({ sub: "admin", role: "admin" });
  });

  it("returns null for malformed tokens", () => {
    expect(decodeToken("not-a-jwt")).toBeNull();
    expect(decodeToken("only.two")).toBeNull();
    expect(decodeToken("")).toBeNull();
    expect(decodeToken(null)).toBeNull();
    expect(decodeToken(123)).toBeNull();
  });
});

describe("adminAuth.isTokenExpired", () => {
  const now = 1_000_000_000_000; // fixed ms

  it("reports an elapsed exp as expired", () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) - 1 });
    expect(isTokenExpired(token, now)).toBe(true);
  });

  it("reports a future exp as not expired", () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    expect(isTokenExpired(token, now)).toBe(false);
  });

  it("treats a token without exp as not expired (presence-only)", () => {
    const token = makeJwt({ sub: "admin" });
    expect(isTokenExpired(token, now)).toBe(false);
  });

  it("treats an undecodable token as expired", () => {
    expect(isTokenExpired("garbage", now)).toBe(true);
  });
});

describe("adminAuth.isAuthenticated", () => {
  const now = 1_000_000_000_000;

  beforeEach(() => {
    localStorage.clear();
  });

  it("is false with no token", () => {
    expect(isAuthenticated(now)).toBe(false);
  });

  it("is true for a present, unexpired token", () => {
    setToken(makeJwt({ exp: Math.floor(now / 1000) + 3600 }));
    expect(isAuthenticated(now)).toBe(true);
  });

  it("is false for an expired token", () => {
    setToken(makeJwt({ exp: Math.floor(now / 1000) - 1 }));
    expect(isAuthenticated(now)).toBe(false);
  });

  it("is false for a malformed token", () => {
    setToken("garbage");
    expect(isAuthenticated(now)).toBe(false);
  });
});

describe("adminAuth.notifyUnauthorized", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clears the token and dispatches the unauthorized event", () => {
    setToken("abc.def.ghi");
    const handler = vi.fn();
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, handler);

    notifyUnauthorized();

    expect(getToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, handler);
  });
});
