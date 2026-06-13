/**
 * Presentation helpers for the customer storefront.
 *
 * Centralizes price formatting (the platform operates in India, so amounts are
 * shown in INR) and resolution of stored media references to fully-qualified
 * URLs. Media is served by the backend as static, non-executing content under
 * `/api/media/<filename>` (see server media router), relative to the configured
 * API base URL.
 */

import { API_BASE_URL } from "./apiClient.js";

/** Currency the storefront transacts in (Razorpay / COD operate in INR). */
export const CURRENCY = "INR";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: CURRENCY,
  // Toy prices are whole-rupee; avoid noisy trailing decimals.
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/**
 * Format a numeric amount as an INR price string (e.g. 1299 -> "₹1,299").
 * Falls back to an empty-safe rendering for non-finite input.
 * @param {number} amount
 * @returns {string}
 */
export function formatINR(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return inrFormatter.format(0);
  }
  return inrFormatter.format(value);
}

/**
 * Resolve a stored media reference (filename, root-relative path, or absolute
 * URL) to a fully-qualified URL the browser can load.
 *
 * - Absolute URLs (http/https) are returned unchanged.
 * - Root-relative paths (starting with "/") are appended to the API base URL.
 * - Bare filenames are served from the backend media route.
 *
 * @param {string} ref
 * @returns {string|null}
 */
export function mediaUrl(ref) {
  if (typeof ref !== "string" || ref.trim() === "") return null;
  const value = ref.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return `${API_BASE_URL}/api/media/${value}`;
}

export default { CURRENCY, formatINR, mediaUrl };
