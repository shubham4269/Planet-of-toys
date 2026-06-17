import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiClient, request, ApiError, API_BASE_URL } from "./apiClient.js";

/** Build a fake Response-like object for the mocked fetch. */
function jsonResponse(body, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  };
}

describe("apiClient", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes relative paths with the configured base URL", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ slug: "abc" }));
    await apiClient.get("/api/products/abc");
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/products/abc`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("serializes JSON bodies and sets the content-type header", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await apiClient.post("/api/orders", { qty: 2 });
    const [, options] = fetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ qty: 2 }));
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("attaches a bearer token when provided", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiClient.get("/api/admin/products", { token: "tok123" });
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer tok123");
  });

  it("returns parsed JSON for successful responses", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ slug: "abc", price: 100 }));
    const data = await apiClient.get("/api/products/abc");
    expect(data).toEqual({ slug: "abc", price: 100 });
  });

  it("throws ApiError with status and server message on non-2xx", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not found" }, { status: 404 })
    );
    await expect(apiClient.get("/api/products/missing")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Not found",
    });
  });

  it("extracts the message from the { error: { message, status } } server shape", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ error: { message: "Unsupported media type.", status: 415 } }, { status: 415 })
    );
    await expect(request("/api/admin/media")).rejects.toMatchObject({
      name: "ApiError",
      status: 415,
      message: "Unsupported media type.",
    });
  });

  it("falls back to a generic message when the error body has none", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    await expect(request("/api/x")).rejects.toMatchObject({
      status: 500,
      message: /something went wrong/i,
    });
  });

  it("wraps network failures in a generic ApiError", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await request("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/unable to reach the server/i);
  });

  it("returns null for empty (204) responses", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(undefined, { status: 204 }));
    const data = await apiClient.delete("/api/admin/products/1", {
      token: "t",
    });
    expect(data).toBeNull();
  });
});
