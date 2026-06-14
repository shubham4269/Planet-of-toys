import PromoBanner from "./promoBanner.model.js";

/**
 * Content module service — promotional header (and, in future, other content
 * types). Admin reads/writes the full banner; the storefront reads a filtered,
 * public projection. Validation throws ContentValidationError (a 400-class
 * operational error) which the central error handler renders client-safe.
 */

/** Operational validation error carrying a client-safe message + 400 status. */
export class ContentValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ContentValidationError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.clientMessage = message;
  }
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MIN_INTERVAL_MS = 2000;
const DEFAULT_INTERVAL_MS = 5000;
const SINGLETON_QUERY = { singleton: "promoBanner" };

/** Validate an optional hex color; returns the trimmed value or null. */
function sanitizeColor(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !HEX_RE.test(value.trim())) {
    throw new ContentValidationError(`${label} must be a hex color like #RRGGBB.`);
  }
  return value.trim();
}

/** Coerce an optional non-empty string; returns trimmed value or null. */
function sanitizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/** Parse an optional date; returns a Date or null; throws on invalid input. */
function sanitizeDate(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ContentValidationError(`${label} is not a valid date.`);
  }
  return date;
}

/** Coerce a boolean with a default. */
function sanitizeBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

/** Validate + normalize one announcement from arbitrary input. */
function sanitizeAnnouncement(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new ContentValidationError(`Announcement ${index + 1} is invalid.`);
  }
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (text === "") {
    throw new ContentValidationError(`Announcement ${index + 1} requires text.`);
  }
  const startAt = sanitizeDate(raw.startAt, `Announcement ${index + 1} start date`);
  const endAt = sanitizeDate(raw.endAt, `Announcement ${index + 1} end date`);
  if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
    throw new ContentValidationError(
      `Announcement ${index + 1} start date must be on or before its end date.`
    );
  }
  return {
    text,
    url: sanitizeOptionalString(raw.url),
    couponCode: sanitizeOptionalString(raw.couponCode),
    bgColor: sanitizeColor(raw.bgColor, `Announcement ${index + 1} background color`),
    textColor: sanitizeColor(raw.textColor, `Announcement ${index + 1} text color`),
    startAt,
    endAt,
    showOnMobile: sanitizeBool(raw.showOnMobile, true),
    showOnDesktop: sanitizeBool(raw.showOnDesktop, true),
    enabled: sanitizeBool(raw.enabled, true),
  };
}

/** Validate + normalize the full banner payload. */
function sanitizeBanner(payload) {
  if (!payload || typeof payload !== "object") {
    throw new ContentValidationError("A promo banner payload is required.");
  }
  const announcementsInput = Array.isArray(payload.announcements)
    ? payload.announcements
    : [];
  let interval = Number(payload.rotationIntervalMs);
  if (!Number.isFinite(interval)) interval = DEFAULT_INTERVAL_MS;
  interval = Math.max(MIN_INTERVAL_MS, Math.round(interval));

  return {
    enabled: sanitizeBool(payload.enabled, false),
    bgColor: sanitizeColor(payload.bgColor, "Background color") ?? "#E11B22",
    textColor: sanitizeColor(payload.textColor, "Text color") ?? "#FFFFFF",
    rotationIntervalMs: interval,
    rightText: sanitizeOptionalString(payload.rightText),
    announcements: announcementsInput.map((a, i) => sanitizeAnnouncement(a, i)),
  };
}

/** Whether `now` falls within an announcement's optional [startAt, endAt]. */
function withinWindow(announcement, now) {
  if (announcement.startAt && now < announcement.startAt) return false;
  if (announcement.endAt && now > announcement.endAt) return false;
  return true;
}

/** Project one announcement to its public, device-aware shape. */
function toPublicAnnouncement(a) {
  return {
    id: a.id,
    text: a.text,
    url: a.url ?? null,
    couponCode: a.couponCode ?? null,
    bgColor: a.bgColor ?? null,
    textColor: a.textColor ?? null,
    showOnMobile: a.showOnMobile,
    showOnDesktop: a.showOnDesktop,
  };
}

export function createContentService() {
  /** Load (creating on first use) the singleton banner document. */
  async function loadSingleton() {
    return PromoBanner.findOneAndUpdate(
      SINGLETON_QUERY,
      { $setOnInsert: SINGLETON_QUERY },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  /** Full banner for the admin editor. */
  async function getPromoBanner() {
    const doc = await loadSingleton();
    return doc.toJSON();
  }

  /** Validate + persist the full banner; returns the saved document. */
  async function updatePromoBanner(payload) {
    const sanitized = sanitizeBanner(payload);
    const doc = await PromoBanner.findOneAndUpdate(
      SINGLETON_QUERY,
      { $set: sanitized, $setOnInsert: SINGLETON_QUERY },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    return doc.toJSON();
  }

  /**
   * Public, filtered banner for the storefront. Returns a disabled shape when
   * the banner is off; otherwise filters announcements to enabled ones within
   * their date window and projects them to the public shape. Device filtering
   * happens client-side using showOnMobile/showOnDesktop.
   */
  async function getPublicPromoBanner({ now = new Date() } = {}) {
    const banner = (await loadSingleton()).toJSON();
    if (!banner.enabled) {
      return { enabled: false, announcements: [] };
    }
    const announcements = banner.announcements
      .filter((a) => a.enabled && withinWindow(a, now))
      .map(toPublicAnnouncement);
    return {
      enabled: true,
      bgColor: banner.bgColor,
      textColor: banner.textColor,
      rotationIntervalMs: banner.rotationIntervalMs,
      rightText: banner.rightText ?? null,
      announcements,
    };
  }

  return { getPromoBanner, updatePromoBanner, getPublicPromoBanner };
}

export default createContentService;
