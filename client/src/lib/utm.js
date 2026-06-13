/**
 * UTM Attribution Capture (Req 2)
 *
 * Captures the marketing attribution parameters present in the landing URL
 * and persists them in browser `sessionStorage` so they can later be attached
 * to a created order (Req 2.1, 2.2). When no UTM parameters are present in the
 * URL, an empty attribution record is stored (Req 2.3).
 *
 * The recognized UTM parameters are defined in the requirements glossary:
 *   utm_source, utm_medium, utm_campaign, utm_term, utm_content.
 */

// The recognized UTM parameter names (requirements glossary: UTM_Parameters).
export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

// sessionStorage key under which the attribution record is persisted.
export const UTM_STORAGE_KEY = "pot_utm";

/**
 * Extract the recognized UTM parameters from a URL query string.
 * @param {string} search - a location search string (e.g. "?utm_source=meta").
 * @returns {Record<string,string>} the UTM parameters present (possibly empty).
 */
export function parseUtm(search = "") {
  const params = new URLSearchParams(search);
  const record = {};
  for (const key of UTM_KEYS) {
    if (params.has(key)) {
      record[key] = params.get(key);
    }
  }
  return record;
}

/**
 * Capture UTM parameters from the current URL (or a provided search string)
 * and persist them in sessionStorage. Stores an empty record when none are
 * present (Req 2.1, 2.3).
 * @param {string} [search] - optional query string; defaults to the current URL.
 * @returns {Record<string,string>} the attribution record that was stored.
 */
export function captureUtm(search) {
  const query =
    search !== undefined
      ? search
      : typeof window !== "undefined"
        ? window.location.search
        : "";

  const record = parseUtm(query);

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // sessionStorage may be unavailable (private mode / quota); attribution
    // is best-effort and must never block the landing page.
  }

  return record;
}

/**
 * Read the persisted attribution record back from sessionStorage.
 * Returns an empty record when nothing has been stored or on parse failure.
 * @returns {Record<string,string>} the stored attribution record.
 */
export function getUtm() {
  try {
    if (typeof sessionStorage === "undefined") {
      return {};
    }
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (raw == null) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const utm = {
  UTM_KEYS,
  UTM_STORAGE_KEY,
  parseUtm,
  captureUtm,
  getUtm,
};

export default utm;
