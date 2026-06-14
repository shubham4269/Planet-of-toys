import NewsletterSubscriber from "./subscriber.model.js";

/** Operational validation error (400, client-safe) for newsletter input. */
export class NewsletterValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "NewsletterValidationError";
    this.statusCode = 400;
    this.isOperational = true;
    this.clientMessage = message;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (v) => String(v ?? "").trim().toLowerCase();

/** Escape a CSV cell (wrap in quotes, double internal quotes). */
function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function createNewsletterService() {
  /** Subscribe (or re-subscribe) an email; idempotent on an already-subscribed address. */
  async function subscribe({ email, source = "footer", ipAddress = null, userAgent = null } = {}) {
    const normalized = normalizeEmail(email);
    if (!EMAIL_RE.test(normalized)) {
      throw new NewsletterValidationError("Please enter a valid email address.");
    }
    const existing = await NewsletterSubscriber.findOne({ email: normalized });
    if (existing) {
      if (existing.status === "subscribed") {
        return { id: existing.id, email: normalized, already: true };
      }
      existing.status = "subscribed";
      existing.subscribedAt = new Date();
      existing.unsubscribedAt = null;
      if (ipAddress) existing.ipAddress = ipAddress;
      if (userAgent) existing.userAgent = userAgent;
      await existing.save();
      return { id: existing.id, email: normalized, already: false };
    }
    const created = await NewsletterSubscriber.create({
      email: normalized, source: source || "footer", ipAddress, userAgent,
    });
    return { id: created.id, email: normalized, already: false };
  }

  /** Paginated subscriber list with optional email search + status filter. */
  async function listSubscribers({ search = "", status = "", page = 1, limit = 20 } = {}) {
    const query = {};
    if (search) query.email = { $regex: String(search).trim(), $options: "i" };
    if (status === "subscribed" || status === "unsubscribed") query.status = status;
    const pageNum = Math.max(1, Number(page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(limit) || 20));
    const [docs, total] = await Promise.all([
      NewsletterSubscriber.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * perPage).limit(perPage),
      NewsletterSubscriber.countDocuments(query),
    ]);
    return { subscribers: docs.map((d) => d.toJSON()), total, page: pageNum, limit: perPage };
  }

  /** Mark a subscriber unsubscribed (soft). */
  async function unsubscribe(id) {
    const doc = await NewsletterSubscriber.findByIdAndUpdate(
      id, { $set: { status: "unsubscribed", unsubscribedAt: new Date() } }, { new: true }
    );
    if (!doc) throw new NewsletterValidationError("Subscriber not found.");
    return doc.toJSON();
  }

  /** Build a CSV of all matching subscribers (header + rows). */
  async function exportCsv({ search = "", status = "" } = {}) {
    const query = {};
    if (search) query.email = { $regex: String(search).trim(), $options: "i" };
    if (status === "subscribed" || status === "unsubscribed") query.status = status;
    const docs = await NewsletterSubscriber.find(query).sort({ createdAt: -1 });
    const header = "email,status,source,subscribedAt";
    const rows = docs.map((d) =>
      [csvCell(d.email), csvCell(d.status), csvCell(d.source), csvCell(d.subscribedAt?.toISOString() ?? "")].join(",")
    );
    return [header, ...rows].join("\n");
  }

  return { subscribe, listSubscribers, unsubscribe, exportCsv };
}

export default createNewsletterService;
