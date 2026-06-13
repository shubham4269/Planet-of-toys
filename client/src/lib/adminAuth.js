/**
 * Planet of Toys — admin session (client-side JWT) utilities.
 *
 * The admin SPA stores the JWT issued by `POST /api/admin/login` and uses it as
 * a bearer token for subsequent admin/settings API calls. This module is the
 * single source of truth for reading, writing, and clearing that token, plus a
 * best-effort client-side validity check used by the route guard.
 *
 * Security note: the JWT signature is authoritative only on the Backend, which
 * verifies signature + expiry on every protected request (Req 21.4). The
 * client-side checks here are a UX convenience — they keep an unauthenticated or
 * obviously-expired session from rendering admin views and redirect to login
 * (Req 19.5, 21.3). They never grant access; the server remains the gate.
 *
 * Requirements: 21.3 (redirect expired sessions to login), 19.5, 15.2.
 */

/** localStorage key under which the admin JWT is persisted. */
export const ADMIN_TOKEN_KEY = "pot_admin_token";

/**
 * Window event dispatched when an admin API call is rejected as unauthorized
 * (HTTP 401 / expired token). The admin shell listens for this and redirects to
 * the login page so expired sessions never linger on a protected view.
 */
export const ADMIN_UNAUTHORIZED_EVENT = "admin:unauthorized";

/** Safe handle to localStorage (guards SSR / privacy-mode access errors). */
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read the persisted admin token, or null when absent/unavailable. */
export function getToken() {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(ADMIN_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

/** Persist the admin token. A falsy value clears any stored token. */
export function setToken(token) {
  const store = storage();
  if (!store) return;
  try {
    if (token) {
      store.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      store.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    /* ignore storage write failures (e.g. quota / privacy mode) */
  }
}

/** Remove the persisted admin token. */
export function clearToken() {
  setToken(null);
}

/** Base64url-decode a JWT segment into a UTF-8 string, or null on failure. */
function base64UrlDecode(segment) {
  try {
    let normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    if (pad === 2) normalized += "==";
    else if (pad === 3) normalized += "=";
    else if (pad === 1) return null; // not a valid base64 length
    return atob(normalized);
  } catch {
    return null;
  }
}

/**
 * Decode (without verifying) the payload claims of a JWT.
 *
 * @param {string} token
 * @returns {object|null} The decoded claims object, or null when the token is
 *   missing or not a well-formed three-part JWT with a JSON payload.
 */
export function decodeToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const json = base64UrlDecode(parts[1]);
  if (json == null) return null;
  try {
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Determine whether a token is expired based on its `exp` claim (seconds since
 * epoch). A token with no `exp` claim is treated as not-expired (presence-only);
 * an undecodable token is treated as expired.
 *
 * @param {string} token
 * @param {number} [now=Date.now()] Current time in ms (injectable for tests).
 */
export function isTokenExpired(token, now = Date.now()) {
  const claims = decodeToken(token);
  if (!claims) return true;
  if (typeof claims.exp !== "number") return false;
  return claims.exp * 1000 <= now;
}

/**
 * Whether a usable admin session is present: a token exists, is a well-formed
 * JWT, and has not expired. Used by the route guard to decide render vs. login.
 *
 * @param {number} [now=Date.now()]
 */
export function isAuthenticated(now = Date.now()) {
  const token = getToken();
  if (!token) return false;
  if (decodeToken(token) == null) return false;
  return !isTokenExpired(token, now);
}

/**
 * Signal that an admin request was rejected as unauthorized. Clears the stored
 * token and dispatches {@link ADMIN_UNAUTHORIZED_EVENT} so the admin shell can
 * redirect to login (Req 21.3). Safe to call from anywhere in the SPA.
 */
export function notifyUnauthorized() {
  clearToken();
  try {
    globalThis.dispatchEvent?.(new Event(ADMIN_UNAUTHORIZED_EVENT));
  } catch {
    /* no-op when no event target is available */
  }
}
