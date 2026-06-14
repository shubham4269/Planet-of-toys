# Promotional Header — Content Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-managed, dynamic promotional header (rotating announcement bar with per-slide scheduling, device targeting, links, coupon-copy, and colors) rendered site-wide on the storefront, as the first item of a new admin **Content** section.

**Architecture:** New server `content` module (model + service + controller) exposing an auth-guarded admin router (`/api/admin/content`) and a public read router (`/api/content`), mirroring the existing `settings`/`config` split. A shared presentational React component (`PromoBannerView` in `@planet-of-toys/shared-web`) renders the banner chrome and is consumed by both the storefront wrapper and the admin live preview. The admin **Content** page hosts a `PromoBannerEditor`.

**Tech Stack:** Node + Express + Mongoose (server), React 18 + Vite (apps/client, apps/admin), Vitest + Testing Library, shared `@planet-of-toys/shared-web` workspace package.

---

## File Structure

**Server (`server/src/modules/content/`)**
- `promoBanner.model.js` — Mongoose singleton model for the banner + announcements subdocuments.
- `content.service.js` — `createContentService()` → `getPromoBanner`, `updatePromoBanner` (validate + persist), `getPublicPromoBanner` (filter by enabled + date window); plus `ContentValidationError`.
- `content.controller.js` — thin HTTP layer (`getPromoBanner`, `updatePromoBanner`, `getPublicPromoBanner`).
- `content.admin.router.js` — `createContentAdminRouter({ requireAuth, contentService })`.
- `content.public.router.js` — `createContentPublicRouter({ contentService })`.
- Tests alongside each file.

**Server wiring**
- `server/src/shared/constants/routerMounts.js` — add `contentAdmin`, `content` mounts.
- `server/src/models/index.js` — export `PromoBanner`.
- `server/src/index.js` — construct + mount both routers.

**Shared (`packages/shared-web/src/promoBanner/`)**
- `PromoBannerView.jsx` — pure presentational component (rotation, SVG arrows, coupon copy, colors, rightText).
- `packages/shared-web/src/index.js` + `package.json` — export the component + add `react` peer dep.

**Storefront (`apps/client/src/`)**
- `components/PromoBanner.jsx` — data-fetching + viewport-filtering wrapper around `PromoBannerView`.
- `components/CustomerLayout.jsx` — render `<PromoBanner />` above `<Outlet>`.

**Admin (`apps/admin/src/`)**
- `pages/admin/ContentPage.jsx` (+ `.css`) — Content section container; renders `PromoBannerEditor`.
- `pages/admin/PromoBannerEditor.jsx` — load/edit/save the banner, drag-and-drop + up/down reorder, live preview.
- `components/AdminLayout.jsx` — add **Content** nav item with inline SVG icon.
- `App.jsx` — add `admin/content` route.

---

## Task 1: PromoBanner Mongoose model

**Files:**
- Create: `server/src/modules/content/promoBanner.model.js`
- Test: `server/src/modules/content/promoBanner.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/content/promoBanner.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import PromoBanner from "./promoBanner.model.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await PromoBanner.deleteMany({});
});

describe("PromoBanner model", () => {
  it("applies banner-level defaults", async () => {
    const doc = await PromoBanner.create({ singleton: "promoBanner" });
    expect(doc.enabled).toBe(false);
    expect(doc.bgColor).toBe("#E11B22");
    expect(doc.textColor).toBe("#FFFFFF");
    expect(doc.rotationIntervalMs).toBe(5000);
    expect(doc.announcements).toEqual([]);
  });

  it("applies announcement defaults and serializes id/announcement ids", async () => {
    const doc = await PromoBanner.create({
      singleton: "promoBanner",
      announcements: [{ text: "Free shipping" }],
    });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.singleton).toBeUndefined();
    expect(json.announcements[0].id).toBeDefined();
    expect(json.announcements[0]._id).toBeUndefined();
    expect(json.announcements[0].showOnMobile).toBe(true);
    expect(json.announcements[0].showOnDesktop).toBe(true);
    expect(json.announcements[0].enabled).toBe(true);
  });

  it("enforces a single document via the unique singleton key", async () => {
    await PromoBanner.create({ singleton: "promoBanner" });
    await expect(PromoBanner.create({ singleton: "promoBanner" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- promoBanner.model`
Expected: FAIL — cannot find module `./promoBanner.model.js`.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/content/promoBanner.model.js
import mongoose from "mongoose";

/**
 * PromoBanner model — the storefront promotional header (announcement bar).
 *
 * Stored as a SINGLETON document (one row, like SystemSettings) keyed by a
 * fixed `singleton` value with a unique index so a second document can never be
 * created. Banner-level fields hold defaults; `announcements` is the ordered
 * list of rotating slides (array order is the display order). Per-slide
 * scheduling (`startAt`/`endAt`), device targeting (`showOnMobile`/
 * `showOnDesktop`) and an `enabled` flag let the public endpoint and storefront
 * decide what to show. The `toJSON` transform maps `_id`->`id` (banner and each
 * announcement) and strips internal fields, consistent with other models.
 */
const { Schema } = mongoose;

const announcementSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    url: { type: String, default: null },
    couponCode: { type: String, default: null },
    bgColor: { type: String, default: null },
    textColor: { type: String, default: null },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    showOnMobile: { type: Boolean, default: true },
    showOnDesktop: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: true }
);

const promoBannerSchema = new Schema(
  {
    // Fixed discriminator that enforces a single document.
    singleton: {
      type: String,
      default: "promoBanner",
      unique: true,
      immutable: true,
    },
    enabled: { type: Boolean, default: false },
    bgColor: { type: String, default: "#E11B22" },
    textColor: { type: String, default: "#FFFFFF" },
    rotationIntervalMs: { type: Number, default: 5000 },
    rightText: { type: String, default: null },
    announcements: { type: [announcementSchema], default: [] },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.singleton;
        if (Array.isArray(ret.announcements)) {
          ret.announcements = ret.announcements.map((a) => {
            const out = { ...a, id: a._id };
            delete out._id;
            return out;
          });
        }
        return ret;
      },
    },
  }
);

const PromoBanner =
  mongoose.models.PromoBanner ||
  mongoose.model("PromoBanner", promoBannerSchema);

export default PromoBanner;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- promoBanner.model`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the model in the registry**

In `server/src/models/index.js`, add after the `SystemSettings` export:

```js
export { default as PromoBanner } from "../modules/content/promoBanner.model.js";
```

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/content/promoBanner.model.js server/src/modules/content/promoBanner.model.test.js server/src/models/index.js
git commit -m "feat(content): add PromoBanner singleton model"
```

---

## Task 2: Content service

**Files:**
- Create: `server/src/modules/content/content.service.js`
- Test: `server/src/modules/content/content.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/content/content.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentService, ContentValidationError } from "./content.service.js";
import PromoBanner from "./promoBanner.model.js";

let mongod;
const service = createContentService();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await PromoBanner.deleteMany({});
});

describe("content service — promo banner", () => {
  it("creates the singleton on first read with defaults", async () => {
    const banner = await service.getPromoBanner();
    expect(banner.id).toBeDefined();
    expect(banner.enabled).toBe(false);
    expect(await PromoBanner.countDocuments()).toBe(1);
  });

  it("persists a validated update and clamps the interval to the minimum", async () => {
    const banner = await service.updatePromoBanner({
      enabled: true,
      rotationIntervalMs: 500,
      rightText: "Customer Care: 011-41410060",
      announcements: [{ text: "Free shipping over Rs.499", couponCode: "FREE499" }],
    });
    expect(banner.enabled).toBe(true);
    expect(banner.rotationIntervalMs).toBe(2000);
    expect(banner.announcements).toHaveLength(1);
    expect(banner.announcements[0].couponCode).toBe("FREE499");
  });

  it("rejects an announcement with empty text", async () => {
    await expect(
      service.updatePromoBanner({ announcements: [{ text: "  " }] })
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("rejects an invalid hex color", async () => {
    await expect(
      service.updatePromoBanner({ bgColor: "red" })
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("rejects a window where startAt is after endAt", async () => {
    await expect(
      service.updatePromoBanner({
        announcements: [
          { text: "x", startAt: "2026-02-01T00:00:00Z", endAt: "2026-01-01T00:00:00Z" },
        ],
      })
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("public read returns disabled shape when the banner is off", async () => {
    await service.updatePromoBanner({ enabled: false, announcements: [{ text: "hi" }] });
    const pub = await service.getPublicPromoBanner({ now: new Date("2026-06-14T00:00:00Z") });
    expect(pub.enabled).toBe(false);
    expect(pub.announcements).toEqual([]);
  });

  it("public read filters announcements by enabled and date window", async () => {
    await service.updatePromoBanner({
      enabled: true,
      announcements: [
        { text: "always" },
        { text: "disabled", enabled: false },
        { text: "future", startAt: "2026-07-01T00:00:00Z" },
        { text: "past", endAt: "2026-01-01T00:00:00Z" },
        { text: "current", startAt: "2026-06-01T00:00:00Z", endAt: "2026-12-01T00:00:00Z" },
      ],
    });
    const pub = await service.getPublicPromoBanner({ now: new Date("2026-06-14T00:00:00Z") });
    const texts = pub.announcements.map((a) => a.text);
    expect(texts).toEqual(["always", "current"]);
    // Public projection must not leak scheduling/enabled fields.
    expect(pub.announcements[0].startAt).toBeUndefined();
    expect(pub.announcements[0].enabled).toBeUndefined();
    expect(pub.announcements[0].showOnMobile).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- content.service`
Expected: FAIL — cannot find module `./content.service.js`.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/content/content.service.js
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
```

> Note: `withinWindow` compares against the `Date` values on the JSON doc. `toJSON` preserves `startAt`/`endAt` as `Date` objects, and `now` is a `Date`, so `<`/`>` comparisons are valid.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- content.service`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/content/content.service.js server/src/modules/content/content.service.test.js
git commit -m "feat(content): add content service with validation and public filtering"
```

---

## Task 3: Content controller

**Files:**
- Create: `server/src/modules/content/content.controller.js`
- Test: `server/src/modules/content/content.controller.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/content/content.controller.test.js
import { describe, it, expect, vi } from "vitest";
import { createContentController } from "./content.controller.js";

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() };
}

describe("content controller", () => {
  it("getPromoBanner returns the banner", async () => {
    const service = { getPromoBanner: vi.fn().mockResolvedValue({ id: "1", enabled: true }) };
    const controller = createContentController(service);
    const res = mockRes();
    await controller.getPromoBanner({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ banner: { id: "1", enabled: true } });
  });

  it("updatePromoBanner passes the body through and returns the saved banner", async () => {
    const service = { updatePromoBanner: vi.fn().mockResolvedValue({ id: "1", enabled: false }) };
    const controller = createContentController(service);
    const res = mockRes();
    await controller.updatePromoBanner({ body: { enabled: false } }, res, vi.fn());
    expect(service.updatePromoBanner).toHaveBeenCalledWith({ enabled: false });
    expect(res.json).toHaveBeenCalledWith({ banner: { id: "1", enabled: false } });
  });

  it("getPublicPromoBanner returns the public projection", async () => {
    const service = {
      getPublicPromoBanner: vi.fn().mockResolvedValue({ enabled: false, announcements: [] }),
    };
    const controller = createContentController(service);
    const res = mockRes();
    await controller.getPublicPromoBanner({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ banner: { enabled: false, announcements: [] } });
  });

  it("forwards service errors to next()", async () => {
    const boom = new Error("boom");
    const service = { getPromoBanner: vi.fn().mockRejectedValue(boom) };
    const controller = createContentController(service);
    const next = vi.fn();
    await controller.getPromoBanner({}, mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- content.controller`
Expected: FAIL — cannot find module `./content.controller.js`.

- [ ] **Step 3: Write the controller**

```js
// server/src/modules/content/content.controller.js
/**
 * Content controller — thin HTTP layer over the content service. Shapes
 * responses as `{ banner }` and forwards errors to the central error handler.
 *
 * @param {{ getPromoBanner: Function, updatePromoBanner: Function, getPublicPromoBanner: Function }} contentService
 */
export function createContentController(contentService) {
  /** GET /api/admin/content/promo-banner — full banner for the editor. */
  async function getPromoBanner(_req, res, next) {
    try {
      const banner = await contentService.getPromoBanner();
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/admin/content/promo-banner — validate + persist. */
  async function updatePromoBanner(req, res, next) {
    try {
      const banner = await contentService.updatePromoBanner(req.body ?? {});
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/content/promo-banner — public, filtered banner. */
  async function getPublicPromoBanner(_req, res, next) {
    try {
      const banner = await contentService.getPublicPromoBanner({ now: new Date() });
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  }

  return { getPromoBanner, updatePromoBanner, getPublicPromoBanner };
}

export default createContentController;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=server -- content.controller`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/content/content.controller.js server/src/modules/content/content.controller.test.js
git commit -m "feat(content): add content controller"
```

---

## Task 4: Admin + public routers

**Files:**
- Create: `server/src/modules/content/content.admin.router.js`
- Create: `server/src/modules/content/content.public.router.js`
- Test: `server/src/modules/content/content.router.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/content/content.router.test.js
// Mirrors the existing server router-test style: spin up the app with
// `app.listen(0)` and exercise it over real HTTP with `fetch` (no supertest).
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentAdminRouter } from "./content.admin.router.js";
import { createContentPublicRouter } from "./content.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import PromoBanner from "./promoBanner.model.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await PromoBanner.deleteMany({});
});

/** Build + start the app; returns { server, adminUrl, publicUrl }. */
function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) {
      return res
        .status(401)
        .json({ error: { message: "Authentication is required.", status: 401 } });
    }
    req.admin = { id: "admin-1" };
    next();
  };
  app.use("/api/admin/content", createContentAdminRouter({ requireAuth }));
  app.use("/api/content", createContentPublicRouter());
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    server,
    adminUrl: `${base}/api/admin/content/promo-banner`,
    publicUrl: `${base}/api/content/promo-banner`,
  };
}

/** PUT JSON helper. */
function putJson(url, body) {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("content routers", () => {
  it("rejects unauthenticated admin requests", async () => {
    const { server, adminUrl } = buildApp({ authorized: false });
    try {
      const res = await fetch(adminUrl);
      expect(res.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("admin can read then update the banner", async () => {
    const { server, adminUrl } = buildApp();
    try {
      const read = await fetch(adminUrl);
      expect(read.status).toBe(200);
      expect((await read.json()).banner.enabled).toBe(false);

      const update = await putJson(adminUrl, {
        enabled: true,
        announcements: [{ text: "Free shipping" }],
      });
      expect(update.status).toBe(200);
      const body = await update.json();
      expect(body.banner.enabled).toBe(true);
      expect(body.banner.announcements).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("admin update returns 400 on invalid input", async () => {
    const { server, adminUrl } = buildApp();
    try {
      const res = await putJson(adminUrl, { bgColor: "notacolor" });
      expect(res.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("public endpoint exposes only enabled banner without admin-only fields", async () => {
    const { server, adminUrl, publicUrl } = buildApp();
    try {
      await putJson(adminUrl, {
        enabled: true,
        announcements: [
          { text: "Live", enabled: true },
          { text: "Off", enabled: false },
        ],
      });
      const res = await fetch(publicUrl);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.banner.enabled).toBe(true);
      expect(body.banner.announcements).toHaveLength(1);
      expect(body.banner.announcements[0].text).toBe("Live");
      expect(body.banner.announcements[0].enabled).toBeUndefined();
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=server -- content.router`
Expected: FAIL — cannot find module `./content.admin.router.js`.

- [ ] **Step 3: Write the admin router**

```js
// server/src/modules/content/content.admin.router.js
import { Router } from "express";
import { createContentService } from "./content.service.js";
import { createContentController } from "./content.controller.js";

/**
 * Admin content router. Mounted at `/api/admin/content` (see ROUTER_MOUNTS).
 * Every route is behind the injected JWT auth guard. For now it manages the
 * promotional header; future content types add their own sub-paths here.
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 * @param {ReturnType<typeof createContentService>} [options.contentService]
 */
export function createContentAdminRouter({
  requireAuth = (req, res, next) => next(),
  contentService = createContentService(),
} = {}) {
  const router = Router();
  const controller = createContentController(contentService);

  router.use(requireAuth);
  router.get("/promo-banner", controller.getPromoBanner);
  router.put("/promo-banner", controller.updatePromoBanner);

  return router;
}

export default createContentAdminRouter;
```

- [ ] **Step 4: Write the public router**

```js
// server/src/modules/content/content.public.router.js
import { Router } from "express";
import { createContentService } from "./content.service.js";
import { createContentController } from "./content.controller.js";

/**
 * Public content router. Mounted at `/api/content` (see ROUTER_MOUNTS).
 * Unauthenticated; returns only the filtered, public banner projection so the
 * storefront can render the promotional header at runtime.
 *
 * @param {object} [options]
 * @param {ReturnType<typeof createContentService>} [options.contentService]
 */
export function createContentPublicRouter({
  contentService = createContentService(),
} = {}) {
  const router = Router();
  const controller = createContentController(contentService);

  router.get("/promo-banner", controller.getPublicPromoBanner);

  return router;
}

export default createContentPublicRouter;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=server -- content.router`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/content/content.admin.router.js server/src/modules/content/content.public.router.js server/src/modules/content/content.router.test.js
git commit -m "feat(content): add admin and public content routers"
```

---

## Task 5: Wire routers into the app

**Files:**
- Modify: `server/src/shared/constants/routerMounts.js`
- Modify: `server/src/index.js`
- Test: `server/src/shared/constants/routerMounts.test.js` (create if absent) OR extend existing mount assertions.

- [ ] **Step 1: Add the mounts**

In `server/src/shared/constants/routerMounts.js`, add two entries inside `ROUTER_MOUNTS` (after `config`):

```js
  config: "/api/config",
  contentAdmin: "/api/admin/content",
  content: "/api/content",
```

- [ ] **Step 2: Write/extend a mount test**

Create `server/src/shared/constants/routerMounts.test.js`:

```js
import { describe, it, expect } from "vitest";
import { ROUTER_MOUNTS } from "./routerMounts.js";

describe("ROUTER_MOUNTS", () => {
  it("declares the content mounts", () => {
    expect(ROUTER_MOUNTS.contentAdmin).toBe("/api/admin/content");
    expect(ROUTER_MOUNTS.content).toBe("/api/content");
  });
});
```

- [ ] **Step 3: Run the mount test**

Run: `npm test --workspace=server -- routerMounts`
Expected: PASS.

- [ ] **Step 4: Wire the routers in `server/src/index.js`**

Add imports near the other router imports:

```js
import { createContentAdminRouter } from "./modules/content/content.admin.router.js";
import { createContentPublicRouter } from "./modules/content/content.public.router.js";
```

Add to the `routers` object passed to `createApp` (after the `config:` entry):

```js
    // Admin content management: /api/admin/content/promo-banner, guarded.
    contentAdmin: createContentAdminRouter({ requireAuth }),
    // Public storefront content: GET /api/content/promo-banner (filtered).
    content: createContentPublicRouter(),
```

- [ ] **Step 5: Run the whole server test suite (no regressions)**

Run: `npm run test:server`
Expected: PASS (all suites, including the new content tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/shared/constants/routerMounts.js server/src/shared/constants/routerMounts.test.js server/src/index.js
git commit -m "feat(content): mount content routers in the app"
```

---

## Task 6: Shared `PromoBannerView` component

**Files:**
- Create: `packages/shared-web/src/promoBanner/PromoBannerView.jsx`
- Modify: `packages/shared-web/package.json` (add export + react peer dep)
- Modify: `packages/shared-web/src/index.js` (re-export)
- Test: covered in Task 7 (storefront) and Task 8 (admin), which run in jsdom. `shared-web`'s own Vitest stays node-only and is not modified.

- [ ] **Step 1: Write the component**

```jsx
// packages/shared-web/src/promoBanner/PromoBannerView.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Pure presentational promotional header. Receives an already-prepared list of
 * announcements (filtering by date/device is the caller's job) and renders the
 * rotating bar: prev/next SVG arrows, per-slide colors, an optional clickable
 * link, an optional click-to-copy coupon chip, and an optional persistent
 * rightText slot. Auto-rotates when there is more than one slide and the user
 * has not requested reduced motion; pauses on hover/focus. Renders nothing when
 * there are no announcements. All icons are inline SVG (no icon fonts).
 *
 * @param {object} props
 * @param {Array} props.announcements  {id,text,url,couponCode,bgColor,textColor}
 * @param {string} [props.bgColor]     banner default background
 * @param {string} [props.textColor]   banner default text color
 * @param {number} [props.rotationIntervalMs=5000]
 * @param {string|null} [props.rightText]
 */
export default function PromoBannerView({
  announcements = [],
  bgColor = "#E11B22",
  textColor = "#FFFFFF",
  rotationIntervalMs = 5000,
  rightText = null,
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const count = announcements.length;

  // Keep the active index in range when the list shrinks.
  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  const reducedMotion =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return undefined;
    const interval = Math.max(2000, rotationIntervalMs);
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, interval);
    return () => clearInterval(id);
  }, [count, paused, reducedMotion, rotationIntervalMs]);

  if (count === 0) return null;

  const active = announcements[Math.min(index, count - 1)];
  const slideBg = active.bgColor || bgColor;
  const slideFg = active.textColor || textColor;

  function go(delta) {
    setIndex((i) => (i + delta + count) % count);
  }

  async function copyCoupon(code, id) {
    try {
      await globalThis.navigator?.clipboard?.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }

  return (
    <div
      className="promo-banner"
      role="region"
      aria-label="Promotional announcements"
      style={{ background: slideBg, color: slideFg }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {count > 1 && (
        <button
          type="button"
          className="promo-banner__nav promo-banner__nav--prev"
          aria-label="Previous announcement"
          onClick={() => go(-1)}
          style={{ color: slideFg }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className="promo-banner__center" aria-live="polite">
        <span className="promo-banner__text">
          {active.url ? (
            <a href={active.url} className="promo-banner__link" style={{ color: slideFg }}>
              {active.text}
            </a>
          ) : (
            active.text
          )}
        </span>
        {active.couponCode && (
          <button
            type="button"
            className="promo-banner__coupon"
            onClick={() => copyCoupon(active.couponCode, active.id)}
            aria-label={`Copy coupon code ${active.couponCode}`}
          >
            <span className="promo-banner__coupon-code">{active.couponCode}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="promo-banner__coupon-status">
              {copiedId === active.id ? "Copied!" : "Copy"}
            </span>
          </button>
        )}
      </div>

      {count > 1 && (
        <button
          type="button"
          className="promo-banner__nav promo-banner__nav--next"
          aria-label="Next announcement"
          onClick={() => go(1)}
          style={{ color: slideFg }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {rightText && <span className="promo-banner__right">{rightText}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Add the export path and react peer dep**

In `packages/shared-web/package.json`, add to `exports`:

```json
    "./format": "./src/format.js",
    "./promoBanner": "./src/promoBanner/PromoBannerView.jsx"
```

And add a `peerDependencies` block (react is provided by the consuming apps):

```json
  "peerDependencies": {
    "react": ">=18"
  },
```

- [ ] **Step 3: Re-export from the package index**

In `packages/shared-web/src/index.js`, add at the end:

```js
// Promotional header presentational component (consumed by storefront + admin).
export { default as PromoBannerView } from "./promoBanner/PromoBannerView.jsx";
```

> Note: `index.js` is the node-environment entry for the package's existing `.js` util tests. Importing a `.jsx` React component there does not run in those node tests (they import specific util files), and the consuming Vite apps transform JSX from the linked workspace package. The component is exercised by the jsdom tests in Tasks 7 and 8.

- [ ] **Step 4: Verify shared-web's existing tests still pass**

Run: `npm run test:shared`
Expected: PASS (unchanged util tests; no new test added here).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/promoBanner/PromoBannerView.jsx packages/shared-web/package.json packages/shared-web/src/index.js
git commit -m "feat(shared-web): add PromoBannerView presentational component"
```

---

## Task 7: Storefront PromoBanner wrapper + layout

**Files:**
- Create: `apps/client/src/components/PromoBanner.jsx`
- Create: `apps/client/src/components/PromoBanner.css`
- Modify: `apps/client/src/components/CustomerLayout.jsx`
- Test: `apps/client/src/components/PromoBanner.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/components/PromoBanner.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PromoBanner from "./PromoBanner.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
}));

function setViewport(isMobile) {
  globalThis.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("max-width") ? isMobile : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

beforeEach(() => {
  apiMock.get.mockReset();
  setViewport(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PromoBanner", () => {
  it("renders nothing when the banner is disabled", async () => {
    apiMock.get.mockResolvedValue({ banner: { enabled: false, announcements: [] } });
    const { container } = render(<PromoBanner />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container.querySelector(".promo-banner")).toBeNull();
  });

  it("renders enabled announcements and the rightText slot", async () => {
    apiMock.get.mockResolvedValue({
      banner: {
        enabled: true,
        bgColor: "#E11B22",
        textColor: "#FFFFFF",
        rotationIntervalMs: 5000,
        rightText: "Customer Care: 011-41410060",
        announcements: [
          { id: "1", text: "Free shipping over Rs.499", showOnMobile: true, showOnDesktop: true },
        ],
      },
    });
    render(<PromoBanner />);
    expect(await screen.findByText("Free shipping over Rs.499")).toBeInTheDocument();
    expect(screen.getByText("Customer Care: 011-41410060")).toBeInTheDocument();
  });

  it("filters announcements hidden on the current (mobile) viewport", async () => {
    setViewport(true);
    apiMock.get.mockResolvedValue({
      banner: {
        enabled: true,
        announcements: [
          { id: "1", text: "Desktop only", showOnMobile: false, showOnDesktop: true },
          { id: "2", text: "Mobile ok", showOnMobile: true, showOnDesktop: true },
        ],
      },
    });
    render(<PromoBanner />);
    expect(await screen.findByText("Mobile ok")).toBeInTheDocument();
    expect(screen.queryByText("Desktop only")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@planet-of-toys/client -- PromoBanner`
Expected: FAIL — cannot find module `./PromoBanner.jsx`.

- [ ] **Step 3: Write the wrapper**

```jsx
// apps/client/src/components/PromoBanner.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { PromoBannerView } from "@planet-of-toys/shared-web";
import "./PromoBanner.css";

/**
 * Storefront promotional header. Fetches the public banner, filters slides by
 * the current viewport (showOnMobile/showOnDesktop), and renders the shared
 * PromoBannerView so the bar looks identical to the admin live preview. Renders
 * nothing on fetch failure, when disabled, or when no slide targets this
 * device — it must never block or break the page.
 */
const MOBILE_QUERY = "(max-width: 768px)";

export default function PromoBanner() {
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get("/api/content/promo-banner")
      .then((res) => {
        if (active) setBanner(res?.banner ?? null);
      })
      .catch(() => {
        if (active) setBanner(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!banner || !banner.enabled) return null;

  const isMobile =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia(MOBILE_QUERY).matches;

  const announcements = (banner.announcements ?? []).filter((a) =>
    isMobile ? a.showOnMobile : a.showOnDesktop
  );

  if (announcements.length === 0) return null;

  return (
    <PromoBannerView
      announcements={announcements}
      bgColor={banner.bgColor}
      textColor={banner.textColor}
      rotationIntervalMs={banner.rotationIntervalMs}
      rightText={banner.rightText}
    />
  );
}
```

- [ ] **Step 4: Write the banner stylesheet**

```css
/* apps/client/src/components/PromoBanner.css */
.promo-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  position: relative;
  min-height: 40px;
  padding: 0.5rem 2.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}
.promo-banner__center {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}
.promo-banner__link { text-decoration: underline; }
.promo-banner__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 0.25rem;
  opacity: 0.85;
}
.promo-banner__nav:hover { opacity: 1; }
.promo-banner__nav--prev { left: 0.5rem; }
.promo-banner__nav--next { right: 0.5rem; }
.promo-banner__coupon {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px dashed currentColor;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.promo-banner__coupon-code { font-weight: 700; letter-spacing: 0.04em; }
.promo-banner__right {
  position: absolute;
  right: 1rem;
  font-weight: 600;
}
@media (max-width: 768px) {
  .promo-banner__right { display: none; }
}
```

- [ ] **Step 5: Render it in the layout**

Replace the body of `apps/client/src/components/CustomerLayout.jsx` so the banner renders above the outlet:

```jsx
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import PromoBanner from "./PromoBanner.jsx";

/**
 * Layout wrapper for the customer-facing storefront routes. Activates the light
 * customer theme, renders the site-wide promotional header, then the matched
 * child route via <Outlet>.
 *
 * Requirements: 20.2.
 */
export default function CustomerLayout() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
  }, []);

  return (
    <div className="customer-shell">
      <PromoBanner />
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --workspace=@planet-of-toys/client -- PromoBanner`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full client suite (no regressions)**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/components/PromoBanner.jsx apps/client/src/components/PromoBanner.css apps/client/src/components/PromoBanner.test.jsx apps/client/src/components/CustomerLayout.jsx
git commit -m "feat(client): render dynamic promotional header site-wide"
```

---

## Task 8: Admin Content page + PromoBannerEditor

**Files:**
- Create: `apps/admin/src/pages/admin/ContentPage.jsx`
- Create: `apps/admin/src/pages/admin/ContentPage.css`
- Create: `apps/admin/src/pages/admin/PromoBannerEditor.jsx`
- Modify: `apps/admin/src/components/AdminLayout.jsx` (nav item + icon)
- Modify: `apps/admin/src/App.jsx` (route)
- Test: `apps/admin/src/pages/admin/PromoBannerEditor.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/PromoBannerEditor.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PromoBannerEditor from "./PromoBannerEditor.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
}));
vi.mock("../../lib/adminAuth.js", () => ({
  getToken: () => "test-token",
  notifyUnauthorized: vi.fn(),
}));

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  globalThis.matchMedia ??= vi.fn().mockReturnValue({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
});

afterEach(() => vi.restoreAllMocks());

const EMPTY = {
  banner: {
    id: "1", enabled: false, bgColor: "#E11B22", textColor: "#FFFFFF",
    rotationIntervalMs: 5000, rightText: null, announcements: [],
  },
};

describe("PromoBannerEditor", () => {
  it("loads the banner and can add an announcement and save", async () => {
    apiMock.get.mockResolvedValue(EMPTY);
    apiMock.put.mockResolvedValue({ banner: { ...EMPTY.banner, enabled: true } });
    render(<PromoBannerEditor />);

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(
      "/api/admin/content/promo-banner", { token: "test-token" }
    ));

    fireEvent.click(screen.getByRole("button", { name: /add announcement/i }));
    fireEvent.change(screen.getByLabelText(/announcement 1 text/i), {
      target: { value: "Free shipping over Rs.499" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const [path, payload, opts] = apiMock.put.mock.calls[0];
    expect(path).toBe("/api/admin/content/promo-banner");
    expect(payload.announcements[0].text).toBe("Free shipping over Rs.499");
    expect(opts).toEqual({ token: "test-token" });
  });

  it("reorders announcements with the move-up control", async () => {
    apiMock.get.mockResolvedValue({
      banner: {
        ...EMPTY.banner,
        announcements: [
          { id: "a", text: "First", showOnMobile: true, showOnDesktop: true, enabled: true },
          { id: "b", text: "Second", showOnMobile: true, showOnDesktop: true, enabled: true },
        ],
      },
    });
    apiMock.put.mockResolvedValue(EMPTY);
    render(<PromoBannerEditor />);

    await screen.findByDisplayValue("First");
    fireEvent.click(screen.getAllByRole("button", { name: /move up/i })[1]);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const payload = apiMock.put.mock.calls[0][1];
    expect(payload.announcements.map((a) => a.text)).toEqual(["Second", "First"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@planet-of-toys/admin -- PromoBannerEditor`
Expected: FAIL — cannot find module `./PromoBannerEditor.jsx`.

- [ ] **Step 3: Write the editor**

```jsx
// apps/admin/src/pages/admin/PromoBannerEditor.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { PromoBannerView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";

/**
 * Promotional header editor. Loads the banner, lets the admin toggle it, set
 * default colors / rotation interval / rightText, and manage the ordered list
 * of announcements (add / remove / reorder by drag-and-drop with up/down
 * fallback). A live preview renders the shared PromoBannerView from current
 * form state. Saves the full banner via PUT.
 */

const API_PATH = "/api/admin/content/promo-banner";

/** A blank announcement row for the editor. */
function blankAnnouncement() {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    text: "",
    url: "",
    couponCode: "",
    bgColor: "",
    textColor: "",
    startAt: "",
    endAt: "",
    showOnMobile: true,
    showOnDesktop: true,
    enabled: true,
  };
}

/** Convert an ISO date (or null) to a value usable by <input type=datetime-local>. */
function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalize a loaded banner into editable form state. */
function toFormState(banner) {
  return {
    enabled: Boolean(banner?.enabled),
    bgColor: banner?.bgColor || "#E11B22",
    textColor: banner?.textColor || "#FFFFFF",
    rotationIntervalMs: banner?.rotationIntervalMs || 5000,
    rightText: banner?.rightText || "",
    announcements: (banner?.announcements ?? []).map((a) => ({
      id: a.id || `loaded-${Math.random().toString(36).slice(2)}`,
      text: a.text || "",
      url: a.url || "",
      couponCode: a.couponCode || "",
      bgColor: a.bgColor || "",
      textColor: a.textColor || "",
      startAt: toLocalInput(a.startAt),
      endAt: toLocalInput(a.endAt),
      showOnMobile: a.showOnMobile !== false,
      showOnDesktop: a.showOnDesktop !== false,
      enabled: a.enabled !== false,
    })),
  };
}

/** Build the API payload from form state (drop client-only ids/empties). */
function toPayload(form) {
  return {
    enabled: form.enabled,
    bgColor: form.bgColor,
    textColor: form.textColor,
    rotationIntervalMs: Number(form.rotationIntervalMs) || 5000,
    rightText: form.rightText.trim() || null,
    announcements: form.announcements.map((a) => ({
      text: a.text,
      url: a.url.trim() || null,
      couponCode: a.couponCode.trim() || null,
      bgColor: a.bgColor || null,
      textColor: a.textColor || null,
      startAt: a.startAt ? new Date(a.startAt).toISOString() : null,
      endAt: a.endAt ? new Date(a.endAt).toISOString() : null,
      showOnMobile: a.showOnMobile,
      showOnDesktop: a.showOnDesktop,
      enabled: a.enabled,
    })),
  };
}

export default function PromoBannerEditor() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(API_PATH, { token: getToken() });
      setForm(toFormState(res?.banner));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError("Could not load the promotional header.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateAnnouncement(index, key, value) {
    setForm((f) => {
      const announcements = f.announcements.slice();
      announcements[index] = { ...announcements[index], [key]: value };
      return { ...f, announcements };
    });
  }

  function addAnnouncement() {
    setForm((f) => ({ ...f, announcements: [...f.announcements, blankAnnouncement()] }));
  }

  function removeAnnouncement(index) {
    setForm((f) => ({
      ...f,
      announcements: f.announcements.filter((_, i) => i !== index),
    }));
  }

  function move(from, to) {
    setForm((f) => {
      if (to < 0 || to >= f.announcements.length) return f;
      const announcements = f.announcements.slice();
      const [item] = announcements.splice(from, 1);
      announcements.splice(to, 0, item);
      return { ...f, announcements };
    });
  }

  function onDrop(index) {
    if (dragIndex === null || dragIndex === index) return;
    move(dragIndex, index);
    setDragIndex(null);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiClient.put(API_PATH, toPayload(form), { token: getToken() });
      setForm(toFormState(res?.banner));
      setMessage("Saved.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not save the promotional header.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (!form) return <p>{error || "Unavailable."}</p>;

  // Preview uses the same component the storefront renders.
  const previewAnnouncements = form.announcements
    .filter((a) => a.enabled && a.text.trim())
    .map((a) => ({
      id: a.id,
      text: a.text,
      url: a.url || null,
      couponCode: a.couponCode || null,
      bgColor: a.bgColor || null,
      textColor: a.textColor || null,
    }));

  return (
    <form className="promo-editor" onSubmit={handleSave}>
      <h1>Promotional Header</h1>

      <div className="promo-editor__preview">
        <span className="promo-editor__preview-label">Live preview</span>
        {form.enabled && previewAnnouncements.length > 0 ? (
          <PromoBannerView
            announcements={previewAnnouncements}
            bgColor={form.bgColor}
            textColor={form.textColor}
            rotationIntervalMs={Number(form.rotationIntervalMs) || 5000}
            rightText={form.rightText || null}
          />
        ) : (
          <p className="promo-editor__preview-empty">
            {form.enabled ? "Add an enabled announcement to preview." : "Banner is disabled."}
          </p>
        )}
      </div>

      <fieldset className="promo-editor__settings">
        <label className="promo-editor__row">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => updateField("enabled", e.target.checked)}
          />
          Enable banner
        </label>
        <label className="promo-editor__row">
          Default background
          <input type="color" value={form.bgColor}
            onChange={(e) => updateField("bgColor", e.target.value)} />
        </label>
        <label className="promo-editor__row">
          Default text color
          <input type="color" value={form.textColor}
            onChange={(e) => updateField("textColor", e.target.value)} />
        </label>
        <label className="promo-editor__row">
          Rotation interval (seconds)
          <input type="number" min="2" step="1"
            value={Math.round(form.rotationIntervalMs / 1000)}
            onChange={(e) => updateField("rotationIntervalMs", Number(e.target.value) * 1000)} />
        </label>
        <label className="promo-editor__row">
          Right text (e.g. customer care)
          <input type="text" value={form.rightText}
            onChange={(e) => updateField("rightText", e.target.value)} />
        </label>
      </fieldset>

      <h2>Announcements</h2>
      <ul className="promo-editor__list">
        {form.announcements.map((a, index) => (
          <li
            key={a.id}
            className="promo-editor__item"
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(index)}
          >
            <div className="promo-editor__item-controls">
              <button type="button" aria-label={`Move announcement ${index + 1} up`}
                onClick={() => move(index, index - 1)} disabled={index === 0}>↑</button>
              <button type="button" aria-label={`Move announcement ${index + 1} down`}
                onClick={() => move(index, index + 1)}
                disabled={index === form.announcements.length - 1}>↓</button>
              <button type="button" aria-label={`Remove announcement ${index + 1}`}
                onClick={() => removeAnnouncement(index)}>✕</button>
            </div>

            <label>Announcement {index + 1} text
              <input type="text" value={a.text}
                onChange={(e) => updateAnnouncement(index, "text", e.target.value)} />
            </label>
            <label>Link URL (optional)
              <input type="url" value={a.url}
                onChange={(e) => updateAnnouncement(index, "url", e.target.value)} />
            </label>
            <label>Coupon code (optional)
              <input type="text" value={a.couponCode}
                onChange={(e) => updateAnnouncement(index, "couponCode", e.target.value)} />
            </label>
            <label>Slide background
              <input type="color" value={a.bgColor || form.bgColor}
                onChange={(e) => updateAnnouncement(index, "bgColor", e.target.value)} />
            </label>
            <label>Slide text color
              <input type="color" value={a.textColor || form.textColor}
                onChange={(e) => updateAnnouncement(index, "textColor", e.target.value)} />
            </label>
            <label>Start date
              <input type="datetime-local" value={a.startAt}
                onChange={(e) => updateAnnouncement(index, "startAt", e.target.value)} />
            </label>
            <label>End date
              <input type="datetime-local" value={a.endAt}
                onChange={(e) => updateAnnouncement(index, "endAt", e.target.value)} />
            </label>
            <label className="promo-editor__row">
              <input type="checkbox" checked={a.showOnDesktop}
                onChange={(e) => updateAnnouncement(index, "showOnDesktop", e.target.checked)} />
              Show on desktop
            </label>
            <label className="promo-editor__row">
              <input type="checkbox" checked={a.showOnMobile}
                onChange={(e) => updateAnnouncement(index, "showOnMobile", e.target.checked)} />
              Show on mobile
            </label>
            <label className="promo-editor__row">
              <input type="checkbox" checked={a.enabled}
                onChange={(e) => updateAnnouncement(index, "enabled", e.target.checked)} />
              Enabled
            </label>
          </li>
        ))}
      </ul>

      <button type="button" className="promo-editor__add" onClick={addAnnouncement}>
        Add announcement
      </button>

      <div className="promo-editor__actions">
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        {message && <span className="promo-editor__ok">{message}</span>}
        {error && <span className="promo-editor__err">{error}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run the editor test to verify it passes**

Run: `npm test --workspace=@planet-of-toys/admin -- PromoBannerEditor`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the ContentPage wrapper + styles**

```jsx
// apps/admin/src/pages/admin/ContentPage.jsx
import PromoBannerEditor from "./PromoBannerEditor.jsx";
import "./ContentPage.css";

/**
 * Admin Content section. Container for storefront content management. For now it
 * hosts the Promotional Header editor; future content types (Hero Sliders,
 * Homepage Sections, Membership Promotions, Footer Content) become additional
 * sections/tabs here.
 */
export default function ContentPage() {
  return (
    <section className="content-page">
      <PromoBannerEditor />
    </section>
  );
}
```

```css
/* apps/admin/src/pages/admin/ContentPage.css */
.content-page { padding: 1.5rem; max-width: 880px; }
.promo-editor h1 { margin-top: 0; }
.promo-editor__preview {
  border: 1px solid var(--admin-border, #2a2a33);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 1.5rem;
}
.promo-editor__preview-label {
  display: block;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.7;
}
.promo-editor__preview-empty { padding: 1rem; opacity: 0.7; }
.promo-editor__settings {
  display: grid;
  gap: 0.75rem;
  border: 0;
  padding: 0;
  margin-bottom: 1.5rem;
}
.promo-editor__row { display: flex; align-items: center; gap: 0.5rem; }
.promo-editor__list { list-style: none; padding: 0; display: grid; gap: 1rem; }
.promo-editor__item {
  border: 1px solid var(--admin-border, #2a2a33);
  border-radius: 8px;
  padding: 1rem;
  display: grid;
  gap: 0.6rem;
}
.promo-editor__item label { display: grid; gap: 0.25rem; font-size: 0.85rem; }
.promo-editor__item-controls { display: flex; gap: 0.5rem; justify-content: flex-end; }
.promo-editor__actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; }
.promo-editor__ok { color: #2ecc71; }
.promo-editor__err { color: #ff6b6b; }
```

- [ ] **Step 6: Add the route in `apps/admin/src/App.jsx`**

Add the import:

```jsx
import ContentPage from "./pages/admin/ContentPage.jsx";
```

Add the route inside the guarded block (after the `orders` route):

```jsx
          {/* Content management — promotional header (Content section). */}
          <Route path="content" element={<ContentPage />} />
```

- [ ] **Step 7: Add the nav item in `apps/admin/src/components/AdminLayout.jsx`**

Add an icon component near the other `Icon*` functions:

```jsx
function IconContent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <rect x="3" y="4" width="18" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 12h16M4 16h10M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
```

Add to `NAV_ITEMS` (after the Orders entry, before Settings):

```jsx
  { to: "/admin/content", label: "Content", Icon: IconContent },
```

- [ ] **Step 8: Run the full admin suite (route + nav + editor, no regressions)**

Run: `npm run test:admin`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/pages/admin/ContentPage.jsx apps/admin/src/pages/admin/ContentPage.css apps/admin/src/pages/admin/PromoBannerEditor.jsx apps/admin/src/pages/admin/PromoBannerEditor.test.jsx apps/admin/src/components/AdminLayout.jsx apps/admin/src/App.jsx
git commit -m "feat(admin): add Content section with promotional header editor"
```

---

## Task 9: Full-suite verification

- [ ] **Step 1: Run every workspace test suite**

Run: `npm test`
Expected: PASS across server, client, admin, and shared-web.

- [ ] **Step 2: Lint/build sanity (optional but recommended)**

Run: `npm run build:client && npm run build:admin`
Expected: both builds succeed (confirms the shared `.jsx` export resolves through Vite in both apps).

- [ ] **Step 3: Manual smoke (optional)**

Start the stack (`npm run dev:server`, `npm run dev:admin`, `npm run dev:client`), log into the admin, open **Content → Promotional Header**, enable it, add an announcement with a coupon and a link, confirm the live preview updates, save, then load the storefront and confirm the banner renders, rotates, and the coupon copies.

---

## Self-Review Notes

- **Spec coverage:** model (Task 1), service incl. per-announcement scheduling + device flags + public filtering (Task 2), controller (Task 3), admin+public routers with auth (Task 4), mounts/wiring (Task 5), shared presentational view (Task 6), storefront site-wide render + viewport filtering (Task 7), admin Content nav/route/editor with drag-and-drop + up/down + live preview (Task 8), verification (Task 9). Error handling (validation 400s, public degrade-to-empty, storefront render-nothing-on-failure) is implemented in Tasks 2/4/7. SVG-only icons used throughout (Tasks 6, 8).
- **Type consistency:** response shape `{ banner }` used by controller (Task 3) and consumed by storefront (`res.banner`, Task 7) and admin (`res.banner`, Task 8). `PromoBannerView` prop names (`announcements`, `bgColor`, `textColor`, `rotationIntervalMs`, `rightText`) are identical across the component (Task 6) and both consumers (Tasks 7, 8). Service method names (`getPromoBanner`, `updatePromoBanner`, `getPublicPromoBanner`) consistent across service/controller/routers/tests.
- **Dependencies:** no new test deps — router tests use the existing `app.listen(0)` + `fetch` pattern (matching `settings.router.test.js`). React is added as a shared-web peer dep (Task 6); both apps already depend on React 18.
