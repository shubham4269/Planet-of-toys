/**
 * Planet of Toys — backend API client.
 *
 * A thin fetch wrapper around the JSON HTTP API. It centralizes the base URL
 * (VITE_API_BASE_URL, read at build time), JSON encoding/decoding, bearer-token
 * attachment for authenticated admin/settings calls, and uniform error handling.
 *
 * The backend's central error handler returns only generic, non-revealing error
 * payloads (see design.md "Central Error Handler"), so this client surfaces the
 * server-provided message when present and falls back to a generic message.
 *
 * Requirements: 20.2 (shared client infrastructure for the SPA).
 */

/** Base URL for the backend API, configured at build time via Vite env. */
export const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

/**
 * Error thrown for non-2xx responses. Carries the HTTP status and any parsed
 * response body so callers can branch on status (e.g. 401 -> redirect to login).
 */
export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/** Join the base URL with a request path, tolerating a leading slash. */
function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${suffix}`;
}

/**
 * Core request function.
 *
 * @param {string} path  API path (e.g. "/api/products/abc") or absolute URL.
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {*}      [options.body]    JSON-serializable request body.
 * @param {string} [options.token]   Bearer token for authenticated requests.
 * @param {object} [options.headers] Additional headers.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<*>} Parsed JSON body (or null for empty responses).
 */
export async function request(
  path,
  { method = "GET", body, token, headers = {}, signal } = {}
) {
  const finalHeaders = { Accept: "application/json", ...headers };
  let payload;

  if (body !== undefined && body !== null) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers: finalHeaders,
      body: payload,
      signal,
    });
  } catch (networkError) {
    // Network/connection failure — never surfaces server internals.
    throw new ApiError("Unable to reach the server. Please try again.", {
      status: 0,
      data: null,
    });
  }

  const data = await parseBody(response);

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.error || data.message)) ||
      "Something went wrong. Please try again.";
    throw new ApiError(message, { status: response.status, data });
  }

  return data;
}

/** Parse a response body as JSON when present; tolerate empty/non-JSON bodies. */
async function parseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return text;
}

/** Convenience HTTP verb helpers. */
export const apiClient = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};

export default apiClient;
