import PromoBanner from "./promoBanner.model.js";
import FooterContent from "./footerContent.model.js";

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

/**
 * Reverse the global input sanitizer's HTML-entity escaping for the banner's
 * human-/link-facing fields. The app-wide XSS sanitizer escapes string input
 * (e.g. `/` -> `&#x2F;`, `&` -> `&amp;`), which corrupts URLs and visible text
 * — and double-encodes them across save/load cycles. These banner fields are
 * rendered by React (which escapes on output), so storing the decoded value is
 * XSS-safe and keeps links working. Decodes repeatedly to undo double-encoding.
 */
const HTML_ENTITY = Object.freeze({
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#x2F;": "/",
  "&#x60;": "`",
  "&#x3D;": "=",
});
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|#x27|#x2F|#x60|#x3D);/g;

function decodeEntities(value) {
  if (typeof value !== "string") return value;
  let current = value;
  for (let i = 0; i < 5; i += 1) {
    const next = current.replace(HTML_ENTITY_RE, (m) => HTML_ENTITY[m]);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Validate an optional hex color; returns the trimmed value or null. */
function sanitizeColor(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !HEX_RE.test(value.trim())) {
    throw new ContentValidationError(`${label} must be a hex color like #RRGGBB.`);
  }
  return value.trim();
}

/** Coerce an optional non-empty string; returns decoded, trimmed value or null. */
function sanitizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = decodeEntities(String(value)).trim();
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

const FOOTER_SINGLETON = { singleton: "footer" };
const SOCIAL_PLATFORMS = ["facebook", "instagram", "youtube", "whatsapp", "twitter"];
const TRUST_ICON_KEYS = ["shield", "truck", "lock", "gift", "star", "heart"];

/** Decode + trim a string field (always returns a string, possibly empty). */
function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return decodeEntities(String(value)).trim();
}
function sanitizeFooterLink(raw) {
  return { label: sanitizeText(raw?.label), url: sanitizeText(raw?.url), enabled: sanitizeBool(raw?.enabled, true) };
}
function sanitizeFooter(payload) {
  if (!payload || typeof payload !== "object") {
    throw new ContentValidationError("A footer payload is required.");
  }
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const social = Array.isArray(payload.social) ? payload.social : [];
  const trust = Array.isArray(payload.trustHighlights) ? payload.trustHighlights : [];
  const bottom = Array.isArray(payload.bottomLinks) ? payload.bottomLinks : [];
  const nl = payload.newsletter ?? {};
  const mp = payload.membershipPromo ?? {};
  const ct = payload.contact ?? {};
  return {
    enabled: sanitizeBool(payload.enabled, true),
    columns: columns.map((c) => ({
      title: sanitizeText(c?.title),
      enabled: sanitizeBool(c?.enabled, true),
      links: (Array.isArray(c?.links) ? c.links : []).map(sanitizeFooterLink),
    })),
    newsletter: {
      enabled: sanitizeBool(nl.enabled, true),
      title: sanitizeText(nl.title),
      subtitle: sanitizeText(nl.subtitle),
      placeholder: sanitizeText(nl.placeholder) || "Enter your email",
      buttonLabel: sanitizeText(nl.buttonLabel) || "Subscribe",
    },
    membershipPromo: {
      enabled: sanitizeBool(mp.enabled, true),
      title: sanitizeText(mp.title),
      description: sanitizeText(mp.description),
      buttonLabel: sanitizeText(mp.buttonLabel),
      buttonUrl: sanitizeText(mp.buttonUrl),
    },
    social: social.filter((s) => SOCIAL_PLATFORMS.includes(s?.platform)).map((s) => ({ platform: s.platform, url: sanitizeText(s?.url) })),
    contact: {
      companyName: sanitizeText(ct.companyName),
      address: sanitizeText(ct.address),
      phone: sanitizeText(ct.phone),
      email: sanitizeText(ct.email),
      whatsapp: sanitizeText(ct.whatsapp),
      supportHours: sanitizeText(ct.supportHours),
    },
    trustHighlights: trust.map((t) => ({
      iconKey: TRUST_ICON_KEYS.includes(t?.iconKey) ? t.iconKey : "shield",
      title: sanitizeText(t?.title),
      subtitle: sanitizeText(t?.subtitle),
    })),
    bottomLinks: bottom.map(sanitizeFooterLink),
    copyrightText: sanitizeText(payload.copyrightText),
  };
}

/** Validate + normalize one announcement from arbitrary input. */
function sanitizeAnnouncement(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new ContentValidationError(`Announcement ${index + 1} is invalid.`);
  }
  const text = typeof raw.text === "string" ? decodeEntities(raw.text).trim() : "";
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

  async function loadFooter() {
    return FooterContent.findOneAndUpdate(
      FOOTER_SINGLETON,
      { $setOnInsert: FOOTER_SINGLETON },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  async function getFooter() {
    return (await loadFooter()).toJSON();
  }
  async function updateFooter(payload) {
    const sanitized = sanitizeFooter(payload);
    const doc = await FooterContent.findOneAndUpdate(
      FOOTER_SINGLETON,
      { $set: sanitized, $setOnInsert: FOOTER_SINGLETON },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    return doc.toJSON();
  }
  async function getPublicFooter() {
    const f = (await loadFooter()).toJSON();
    if (!f.enabled) return { enabled: false };
    const columns = f.columns
      .filter((c) => c.enabled)
      .map((c) => ({ id: c.id, title: c.title, links: c.links.filter((l) => l.enabled).map((l) => ({ id: l.id, label: l.label, url: l.url })) }))
      .filter((c) => c.links.length > 0);
    const out = {
      enabled: true,
      columns,
      social: f.social.filter((s) => s.url).map((s) => ({ id: s.id, platform: s.platform, url: s.url })),
      contact: f.contact,
      trustHighlights: f.trustHighlights.map((t) => ({ id: t.id, iconKey: t.iconKey, title: t.title, subtitle: t.subtitle })),
      bottomLinks: f.bottomLinks.filter((l) => l.enabled).map((l) => ({ id: l.id, label: l.label, url: l.url })),
      copyrightText: f.copyrightText,
    };
    if (f.newsletter.enabled) out.newsletter = f.newsletter;
    if (f.membershipPromo.enabled) out.membershipPromo = f.membershipPromo;
    return out;
  }

  return { getPromoBanner, updatePromoBanner, getPublicPromoBanner, getFooter, updateFooter, getPublicFooter };
}

export default createContentService;
