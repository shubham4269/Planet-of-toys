# Footer CMS + Newsletter + Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CMS-managed Footer (next content type), a real Newsletter subscription system, and a Marketing admin area for subscribers — following the established content-module / admin-write / public-read patterns.

**Architecture:** Footer reuses the `content` module (model + `content.service`/`content.controller` + the existing admin/public content routers). Newsletter is a new `server/src/modules/newsletter/` module (model + service + controller + public/admin routers). A shared pure `FooterView` (in `@planet-of-toys/shared-web`) renders identically on the storefront and in the admin live preview. Inline SVG only; colors are token-driven (not CMS-editable).

**Tech Stack:** Node + Express + Mongoose, React 18 + Vite + react-router-dom, Vitest + Testing Library, `@planet-of-toys/shared-web`.

**Spec:** `docs/superpowers/specs/2026-06-15-footer-cms-design.md`

---

## File Structure

**Server — content module (footer)**
- Create `server/src/modules/content/footerContent.model.js` — FooterContent singleton.
- Modify `server/src/modules/content/content.service.js` — add `getFooter`, `updateFooter`, `getPublicFooter` + footer sanitizers (reuse `decodeEntities`).
- Modify `server/src/modules/content/content.controller.js` — add `getFooter`, `updateFooter`, `getPublicFooter`.
- Modify `server/src/modules/content/content.admin.router.js` — add `GET/PUT /footer`.
- Modify `server/src/modules/content/content.public.router.js` — add `GET /footer`.
- Modify `server/src/models/index.js` — export `FooterContent`.

**Server — newsletter module (new)**
- Create `server/src/modules/newsletter/subscriber.model.js`
- Create `server/src/modules/newsletter/newsletter.service.js`
- Create `server/src/modules/newsletter/newsletter.controller.js`
- Create `server/src/modules/newsletter/newsletter.public.router.js`
- Create `server/src/modules/newsletter/newsletter.admin.router.js`
- Modify `server/src/shared/constants/routerMounts.js` — add `newsletter`, `newsletterAdmin`.
- Modify `server/src/index.js` — wire routers (+ a tight subscribe rate limiter).
- Modify `server/src/models/index.js` — export `NewsletterSubscriber`.

**Shared**
- Create `packages/shared-web/src/footer/FooterView.jsx` + export in `packages/shared-web/src/index.js`.

**Storefront**
- Create `apps/client/src/components/Footer.jsx` + `Footer.css`; modify `CustomerLayout.jsx`.

**Admin**
- Create `apps/admin/src/pages/admin/content/FooterPage.jsx` + `apps/admin/src/pages/admin/content/FooterEditor.jsx` + `FooterEditor.css`.
- Create `apps/admin/src/pages/admin/marketing/SubscribersPage.jsx` + `SubscribersPage.css`.
- Modify `apps/admin/src/components/AdminLayout.jsx` (Footer child + Marketing group), `apps/admin/src/App.jsx` (routes).

> Test commands: server `npm test --workspace=server -- <pattern>`; client `npm test --workspace=@planet-of-toys/client -- <pattern>`; admin `npm test --workspace=@planet-of-toys/admin -- <pattern>`. Branch `dev`; commit each task. End every commit body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Task 1: FooterContent model

**Files:** Create `server/src/modules/content/footerContent.model.js`; Test `server/src/modules/content/footerContent.model.test.js`; Modify `server/src/models/index.js`.

- [ ] **Step 1: Failing test**

```js
// server/src/modules/content/footerContent.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import FooterContent from "./footerContent.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await FooterContent.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await FooterContent.deleteMany({}); });

describe("FooterContent model", () => {
  it("applies defaults", async () => {
    const doc = await FooterContent.create({ singleton: "footer" });
    expect(doc.enabled).toBe(true);
    expect(doc.newsletter.placeholder).toBe("Enter your email");
    expect(doc.columns).toEqual([]);
  });

  it("maps _id->id on doc and nested subdocs and strips singleton/__v", async () => {
    const doc = await FooterContent.create({
      singleton: "footer",
      columns: [{ title: "Shop", links: [{ label: "Sale", url: "/sale" }] }],
      social: [{ platform: "facebook", url: "https://fb.com/x" }],
    });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.singleton).toBeUndefined();
    expect(json.columns[0].id).toBeDefined();
    expect(json.columns[0]._id).toBeUndefined();
    expect(json.columns[0].links[0].id).toBeDefined();
    expect(json.columns[0].links[0]._id).toBeUndefined();
    expect(json.social[0].id).toBeDefined();
  });

  it("enforces a single document", async () => {
    await FooterContent.create({ singleton: "footer" });
    await expect(FooterContent.create({ singleton: "footer" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- footerContent.model`

- [ ] **Step 3: Implement**

```js
// server/src/modules/content/footerContent.model.js
import mongoose from "mongoose";

/**
 * FooterContent — CMS-managed storefront footer (singleton, like SystemSettings/
 * PromoBanner). Colors are NOT stored (token-driven on the client). toJSON maps
 * every _id (doc + nested array subdocs) to `id` and strips internal fields.
 */
const { Schema } = mongoose;

const linkSchema = new Schema(
  { label: { type: String, default: "" }, url: { type: String, default: "" }, enabled: { type: Boolean, default: true } },
  { _id: true }
);
const columnSchema = new Schema(
  { title: { type: String, default: "" }, enabled: { type: Boolean, default: true }, links: { type: [linkSchema], default: [] } },
  { _id: true }
);
const socialSchema = new Schema(
  { platform: { type: String, enum: ["facebook", "instagram", "youtube", "whatsapp", "twitter"], required: true }, url: { type: String, default: "" } },
  { _id: true }
);
const trustSchema = new Schema(
  { iconKey: { type: String, enum: ["shield", "truck", "lock", "gift", "star", "heart"], default: "shield" }, title: { type: String, default: "" }, subtitle: { type: String, default: "" } },
  { _id: true }
);
const bottomLinkSchema = new Schema(
  { label: { type: String, default: "" }, url: { type: String, default: "" }, enabled: { type: Boolean, default: true } },
  { _id: true }
);

/** Recursively map `_id`->`id` on a plain object tree (doc + nested subdocs). */
function mapIds(node) {
  if (Array.isArray(node)) { node.forEach(mapIds); return; }
  if (node && typeof node === "object" && !(node instanceof Date)) {
    if (node._id !== undefined) { node.id = node._id; delete node._id; }
    for (const key of Object.keys(node)) mapIds(node[key]);
  }
}

const footerContentSchema = new Schema(
  {
    singleton: { type: String, default: "footer", unique: true, immutable: true },
    enabled: { type: Boolean, default: true },
    columns: { type: [columnSchema], default: [] },
    newsletter: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
      placeholder: { type: String, default: "Enter your email" },
      buttonLabel: { type: String, default: "Subscribe" },
    },
    membershipPromo: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      buttonLabel: { type: String, default: "" },
      buttonUrl: { type: String, default: "" },
    },
    social: { type: [socialSchema], default: [] },
    contact: {
      companyName: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
      supportHours: { type: String, default: "" },
    },
    trustHighlights: { type: [trustSchema], default: [] },
    bottomLinks: { type: [bottomLinkSchema], default: [] },
    copyrightText: { type: String, default: "" },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: {
      transform(_doc, ret) {
        mapIds(ret);
        delete ret.__v;
        delete ret.singleton;
        return ret;
      },
    },
  }
);

const FooterContent =
  mongoose.models.FooterContent || mongoose.model("FooterContent", footerContentSchema);

export default FooterContent;
```

- [ ] **Step 4: Register** — in `server/src/models/index.js` add after the `PromoBanner` export:
```js
export { default as FooterContent } from "../modules/content/footerContent.model.js";
```

- [ ] **Step 5: Run → PASS** `npm test --workspace=server -- footerContent.model`

- [ ] **Step 6: Commit**
```bash
git add server/src/modules/content/footerContent.model.js server/src/modules/content/footerContent.model.test.js server/src/models/index.js
git commit -m "feat(content): add FooterContent singleton model"
```

---

## Task 2: Footer service methods

**Files:** Modify `server/src/modules/content/content.service.js`; Test `server/src/modules/content/footer.service.test.js`.

- [ ] **Step 1: Failing test**

```js
// server/src/modules/content/footer.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentService } from "./content.service.js";
import FooterContent from "./footerContent.model.js";

let mongod; const service = createContentService();
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await FooterContent.deleteMany({}); });

describe("content service — footer", () => {
  it("creates the singleton on first read", async () => {
    const footer = await service.getFooter();
    expect(footer.id).toBeDefined();
    expect(footer.enabled).toBe(true);
    expect(await FooterContent.countDocuments()).toBe(1);
  });

  it("persists an update and decodes escaped slashes in link urls", async () => {
    const footer = await service.updateFooter({
      enabled: true,
      columns: [{ title: "Shop", links: [{ label: "Sale", url: "&#x2F;sale" }] }],
      social: [{ platform: "facebook", url: "https://fb.com/x" }],
      copyrightText: "© 2026 Planet of Toys.",
    });
    expect(footer.columns[0].links[0].url).toBe("/sale");
    expect(footer.copyrightText).toContain("Planet of Toys");
  });

  it("public read returns disabled shape when off", async () => {
    await service.updateFooter({ enabled: false, columns: [{ title: "X", links: [{ label: "a", url: "/a" }] }] });
    const pub = await service.getPublicFooter();
    expect(pub.enabled).toBe(false);
  });

  it("public read drops disabled/empty items, omits social without url, and admin flags", async () => {
    await service.updateFooter({
      enabled: true,
      columns: [
        { title: "Keep", enabled: true, links: [{ label: "A", url: "/a", enabled: true }, { label: "Hidden", url: "/h", enabled: false }] },
        { title: "Gone", enabled: false, links: [{ label: "B", url: "/b" }] },
        { title: "Empty", enabled: true, links: [] },
      ],
      social: [{ platform: "facebook", url: "https://fb" }, { platform: "instagram", url: "" }],
      newsletter: { enabled: false, title: "n" },
      bottomLinks: [{ label: "Privacy", url: "/p", enabled: true }, { label: "Off", url: "/o", enabled: false }],
    });
    const pub = await service.getPublicFooter();
    expect(pub.columns).toHaveLength(1);
    expect(pub.columns[0].links).toHaveLength(1);
    expect(pub.columns[0].links[0].enabled).toBeUndefined();
    expect(pub.social).toHaveLength(1);
    expect(pub.newsletter).toBeUndefined();
    expect(pub.bottomLinks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- footer.service`

- [ ] **Step 3: Implement** — append to `server/src/modules/content/content.service.js`. Add the import at the top (next to the PromoBanner import):
```js
import FooterContent from "./footerContent.model.js";
```
Add these helpers near the other sanitizers (they reuse the existing `decodeEntities`):
```js
const FOOTER_SINGLETON = { singleton: "footer" };
const SOCIAL_PLATFORMS = ["facebook", "instagram", "youtube", "whatsapp", "twitter"];
const TRUST_ICON_KEYS = ["shield", "truck", "lock", "gift", "star", "heart"];

/** Decode + trim a string field (always returns a string, possibly empty). */
function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return decodeEntities(String(value)).trim();
}
function sanitizeFooterLink(raw) {
  return {
    label: sanitizeText(raw?.label),
    url: sanitizeText(raw?.url),
    enabled: sanitizeBool(raw?.enabled, true),
  };
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
    social: social
      .filter((s) => SOCIAL_PLATFORMS.includes(s?.platform))
      .map((s) => ({ platform: s.platform, url: sanitizeText(s?.url) })),
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
```
Inside `createContentService()`, add (next to the promo methods) — note `loadFooter` mirrors the promo `loadSingleton`:
```js
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
```
And add `getFooter, updateFooter, getPublicFooter` to the `return { ... }` of `createContentService`.

- [ ] **Step 4: Run → PASS** `npm test --workspace=server -- footer.service`

- [ ] **Step 5: Commit**
```bash
git add server/src/modules/content/content.service.js server/src/modules/content/footer.service.test.js
git commit -m "feat(content): add footer service (validate, decode, public projection)"
```

---

## Task 3: Footer controller handlers

**Files:** Modify `server/src/modules/content/content.controller.js`; Test `server/src/modules/content/footer.controller.test.js`.

- [ ] **Step 1: Failing test**

```js
// server/src/modules/content/footer.controller.test.js
import { describe, it, expect, vi } from "vitest";
import { createContentController } from "./content.controller.js";

function mockRes() { return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }; }

describe("content controller — footer", () => {
  it("getFooter returns { footer }", async () => {
    const service = { getFooter: vi.fn().mockResolvedValue({ id: "1", enabled: true }) };
    const res = mockRes();
    await createContentController(service).getFooter({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ footer: { id: "1", enabled: true } });
  });
  it("updateFooter passes body and returns { footer }", async () => {
    const service = { updateFooter: vi.fn().mockResolvedValue({ id: "1" }) };
    const res = mockRes();
    await createContentController(service).updateFooter({ body: { enabled: false } }, res, vi.fn());
    expect(service.updateFooter).toHaveBeenCalledWith({ enabled: false });
    expect(res.json).toHaveBeenCalledWith({ footer: { id: "1" } });
  });
  it("getPublicFooter returns { footer }", async () => {
    const service = { getPublicFooter: vi.fn().mockResolvedValue({ enabled: false }) };
    const res = mockRes();
    await createContentController(service).getPublicFooter({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ footer: { enabled: false } });
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- footer.controller`

- [ ] **Step 3: Implement** — inside `createContentController(contentService)` in `content.controller.js`, add three handlers and include them in the returned object:
```js
  async function getFooter(_req, res, next) {
    try { res.json({ footer: await contentService.getFooter() }); } catch (err) { next(err); }
  }
  async function updateFooter(req, res, next) {
    try { res.json({ footer: await contentService.updateFooter(req.body ?? {}) }); } catch (err) { next(err); }
  }
  async function getPublicFooter(_req, res, next) {
    try { res.json({ footer: await contentService.getPublicFooter() }); } catch (err) { next(err); }
  }
```
Add `getFooter, updateFooter, getPublicFooter` to the `return { ... }`.

- [ ] **Step 4: Run → PASS** `npm test --workspace=server -- footer.controller`

- [ ] **Step 5: Commit**
```bash
git add server/src/modules/content/content.controller.js server/src/modules/content/footer.controller.test.js
git commit -m "feat(content): add footer controller handlers"
```

---

## Task 4: Footer routes (admin + public)

**Files:** Modify `server/src/modules/content/content.admin.router.js`, `server/src/modules/content/content.public.router.js`; Test `server/src/modules/content/footer.router.test.js`.

- [ ] **Step 1: Failing test** (mirrors the existing `content.router.test.js` `app.listen(0)` + `fetch` style)

```js
// server/src/modules/content/footer.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentAdminRouter } from "./content.admin.router.js";
import { createContentPublicRouter } from "./content.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import FooterContent from "./footerContent.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await FooterContent.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Authentication is required." } });
    req.admin = { id: "admin-1" }; next();
  };
  app.use("/api/admin/content", createContentAdminRouter({ requireAuth }));
  app.use("/api/content", createContentPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return { server, adminUrl: `${base}/api/admin/content/footer`, publicUrl: `${base}/api/content/footer` };
}
const putJson = (url, body) => fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("footer routers", () => {
  it("rejects unauthenticated admin footer reads", async () => {
    const { server, adminUrl } = buildApp({ authorized: false });
    try { expect((await fetch(adminUrl)).status).toBe(401); } finally { server.close(); }
  });
  it("admin can read then update; public reflects enabled state", async () => {
    const { server, adminUrl, publicUrl } = buildApp();
    try {
      expect((await fetch(adminUrl)).status).toBe(200);
      const upd = await putJson(adminUrl, { enabled: true, columns: [{ title: "Shop", links: [{ label: "Sale", url: "/sale" }] }] });
      expect(upd.status).toBe(200);
      const pub = await (await fetch(publicUrl)).json();
      expect(pub.footer.enabled).toBe(true);
      expect(pub.footer.columns[0].links[0].url).toBe("/sale");
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- footer.router`

- [ ] **Step 3: Implement** — in `content.admin.router.js`, after the promo-banner routes add:
```js
  router.get("/footer", controller.getFooter);
  router.put("/footer", controller.updateFooter);
```
In `content.public.router.js`, after the promo-banner route add:
```js
  router.get("/footer", controller.getPublicFooter);
```

- [ ] **Step 4: Run → PASS** `npm test --workspace=server -- footer.router`

- [ ] **Step 5: Run the whole server suite** `npm run test:server` — Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add server/src/modules/content/content.admin.router.js server/src/modules/content/content.public.router.js server/src/modules/content/footer.router.test.js
git commit -m "feat(content): expose footer admin + public routes"
```

---

## Task 5: NewsletterSubscriber model

**Files:** Create `server/src/modules/newsletter/subscriber.model.js`; Test `server/src/modules/newsletter/subscriber.model.test.js`; Modify `server/src/models/index.js`.

- [ ] **Step 1: Failing test**

```js
// server/src/modules/newsletter/subscriber.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NewsletterSubscriber from "./subscriber.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await NewsletterSubscriber.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NewsletterSubscriber.deleteMany({}); });

describe("NewsletterSubscriber model", () => {
  it("defaults status/source and exposes id (no _id/__v)", async () => {
    const doc = await NewsletterSubscriber.create({ email: "a@b.com" });
    const json = doc.toJSON();
    expect(json.status).toBe("subscribed");
    expect(json.source).toBe("footer");
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
  });
  it("enforces unique email", async () => {
    await NewsletterSubscriber.create({ email: "dup@b.com" });
    await expect(NewsletterSubscriber.create({ email: "dup@b.com" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- subscriber.model`

- [ ] **Step 3: Implement**

```js
// server/src/modules/newsletter/subscriber.model.js
import mongoose from "mongoose";

/**
 * NewsletterSubscriber — emails captured by the footer signup. Collection-only
 * (no campaigns/sending). Email is unique (dedup). ipAddress/userAgent are
 * optional, captured at subscribe time, admin-only (never in public output).
 */
const { Schema } = mongoose;

const subscriberSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ["subscribed", "unsubscribed"], default: "subscribed" },
    source: { type: String, default: "footer" },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const NewsletterSubscriber =
  mongoose.models.NewsletterSubscriber || mongoose.model("NewsletterSubscriber", subscriberSchema);

export default NewsletterSubscriber;
```

- [ ] **Step 4: Register** — in `server/src/models/index.js` add:
```js
export { default as NewsletterSubscriber } from "../modules/newsletter/subscriber.model.js";
```

- [ ] **Step 5: Run → PASS** `npm test --workspace=server -- subscriber.model`

- [ ] **Step 6: Commit**
```bash
git add server/src/modules/newsletter/subscriber.model.js server/src/modules/newsletter/subscriber.model.test.js server/src/models/index.js
git commit -m "feat(newsletter): add NewsletterSubscriber model"
```

---

## Task 6: Newsletter service

**Files:** Create `server/src/modules/newsletter/newsletter.service.js`; Test `server/src/modules/newsletter/newsletter.service.test.js`.

- [ ] **Step 1: Failing test**

```js
// server/src/modules/newsletter/newsletter.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createNewsletterService, NewsletterValidationError } from "./newsletter.service.js";
import NewsletterSubscriber from "./subscriber.model.js";

let mongod; const service = createNewsletterService();
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await NewsletterSubscriber.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NewsletterSubscriber.deleteMany({}); });

describe("newsletter service", () => {
  it("rejects an invalid email", async () => {
    await expect(service.subscribe({ email: "nope" })).rejects.toBeInstanceOf(NewsletterValidationError);
  });
  it("normalizes and stores; dedup is idempotent", async () => {
    const a = await service.subscribe({ email: "  USER@Example.com ", ipAddress: "1.1.1.1", userAgent: "ua" });
    expect(a.email).toBe("user@example.com");
    expect(a.already).toBe(false);
    const b = await service.subscribe({ email: "user@example.com" });
    expect(b.already).toBe(true);
    expect(await NewsletterSubscriber.countDocuments()).toBe(1);
  });
  it("re-subscribes a previously unsubscribed email", async () => {
    const a = await service.subscribe({ email: "x@y.com" });
    await service.unsubscribe(a.id);
    const c = await service.subscribe({ email: "x@y.com" });
    expect(c.already).toBe(false);
    const doc = await NewsletterSubscriber.findById(a.id);
    expect(doc.status).toBe("subscribed");
  });
  it("lists with search + pagination and exports CSV", async () => {
    await service.subscribe({ email: "alpha@x.com" });
    await service.subscribe({ email: "beta@x.com" });
    const list = await service.listSubscribers({ search: "alpha", page: 1, limit: 10 });
    expect(list.total).toBe(1);
    expect(list.subscribers[0].email).toBe("alpha@x.com");
    const csv = await service.exportCsv({});
    expect(csv).toContain("email,status,source");
    expect(csv).toContain("beta@x.com");
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- newsletter.service`

- [ ] **Step 3: Implement**

```js
// server/src/modules/newsletter/newsletter.service.js
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
```

- [ ] **Step 4: Run → PASS** `npm test --workspace=server -- newsletter.service`

- [ ] **Step 5: Commit**
```bash
git add server/src/modules/newsletter/newsletter.service.js server/src/modules/newsletter/newsletter.service.test.js
git commit -m "feat(newsletter): add subscription service (subscribe/dedup/list/unsubscribe/csv)"
```

---

## Task 7: Newsletter controller + routers

**Files:** Create `server/src/modules/newsletter/newsletter.controller.js`, `newsletter.public.router.js`, `newsletter.admin.router.js`; Test `server/src/modules/newsletter/newsletter.router.test.js`.

- [ ] **Step 1: Failing test**

```js
// server/src/modules/newsletter/newsletter.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createNewsletterPublicRouter } from "./newsletter.public.router.js";
import { createNewsletterAdminRouter } from "./newsletter.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import NewsletterSubscriber from "./subscriber.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await NewsletterSubscriber.init(); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NewsletterSubscriber.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Authentication is required." } });
    req.admin = { id: "admin-1" }; next();
  };
  app.use("/api/newsletter", createNewsletterPublicRouter());
  app.use("/api/admin/newsletter", createNewsletterAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}
const postJson = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("newsletter routers", () => {
  it("public subscribe: 400 invalid, 200 valid", async () => {
    const { server, base } = buildApp();
    try {
      expect((await postJson(`${base}/api/newsletter/subscribe`, { email: "bad" })).status).toBe(400);
      const ok = await postJson(`${base}/api/newsletter/subscribe`, { email: "ok@x.com" });
      expect(ok.status).toBe(200);
      expect((await ok.json()).ok).toBe(true);
    } finally { server.close(); }
  });
  it("admin list requires auth and returns subscribers; export is CSV", async () => {
    const { server, base } = buildApp();
    try {
      await postJson(`${base}/api/newsletter/subscribe`, { email: "ok@x.com" });
      expect((await fetch(`${base}/api/admin/newsletter/subscribers`)).status).toBe(200);
      const list = await (await fetch(`${base}/api/admin/newsletter/subscribers`)).json();
      expect(list.total).toBe(1);
      const csvRes = await fetch(`${base}/api/admin/newsletter/subscribers/export`);
      expect(csvRes.headers.get("content-type")).toContain("text/csv");
      expect(await csvRes.text()).toContain("ok@x.com");
    } finally { server.close(); }
  });
  it("admin list is rejected without auth", async () => {
    const { server, base } = buildApp({ authorized: false });
    try { expect((await fetch(`${base}/api/admin/newsletter/subscribers`)).status).toBe(401); } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=server -- newsletter.router`

- [ ] **Step 3: Controller**

```js
// server/src/modules/newsletter/newsletter.controller.js
export function createNewsletterController(newsletterService) {
  /** POST /subscribe — public. Captures ip/userAgent; never leaks them back. */
  async function subscribe(req, res, next) {
    try {
      const { email, source } = req.body ?? {};
      const result = await newsletterService.subscribe({
        email, source,
        ipAddress: req.ip ?? null,
        userAgent: req.get?.("user-agent") ?? null,
      });
      res.json({ ok: true, already: result.already });
    } catch (err) { next(err); }
  }
  /** GET /subscribers — admin list. */
  async function list(req, res, next) {
    try {
      const { search, status, page, limit } = req.query ?? {};
      res.json(await newsletterService.listSubscribers({ search, status, page, limit }));
    } catch (err) { next(err); }
  }
  /** GET /subscribers/export — admin CSV download. */
  async function exportCsv(req, res, next) {
    try {
      const { search, status } = req.query ?? {};
      const csv = await newsletterService.exportCsv({ search, status });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="subscribers.csv"');
      res.send(csv);
    } catch (err) { next(err); }
  }
  /** PATCH /subscribers/:id/unsubscribe — admin. */
  async function unsubscribe(req, res, next) {
    try { res.json({ subscriber: await newsletterService.unsubscribe(req.params.id) }); } catch (err) { next(err); }
  }
  return { subscribe, list, exportCsv, unsubscribe };
}
export default createNewsletterController;
```

- [ ] **Step 4: Public router**

```js
// server/src/modules/newsletter/newsletter.public.router.js
import { Router } from "express";
import { createNewsletterService } from "./newsletter.service.js";
import { createNewsletterController } from "./newsletter.controller.js";

/** Public newsletter router. Mounted at `/api/newsletter`. */
export function createNewsletterPublicRouter({ newsletterService = createNewsletterService() } = {}) {
  const router = Router();
  const controller = createNewsletterController(newsletterService);
  router.post("/subscribe", controller.subscribe);
  return router;
}
export default createNewsletterPublicRouter;
```

- [ ] **Step 5: Admin router**

```js
// server/src/modules/newsletter/newsletter.admin.router.js
import { Router } from "express";
import { createNewsletterService } from "./newsletter.service.js";
import { createNewsletterController } from "./newsletter.controller.js";

/** Admin newsletter router. Mounted at `/api/admin/newsletter`, auth-guarded. */
export function createNewsletterAdminRouter({
  requireAuth = (req, res, next) => next(),
  newsletterService = createNewsletterService(),
} = {}) {
  const router = Router();
  const controller = createNewsletterController(newsletterService);
  router.use(requireAuth);
  router.get("/subscribers", controller.list);
  router.get("/subscribers/export", controller.exportCsv);
  router.patch("/subscribers/:id/unsubscribe", controller.unsubscribe);
  return router;
}
export default createNewsletterAdminRouter;
```

- [ ] **Step 6: Run → PASS** `npm test --workspace=server -- newsletter.router`

- [ ] **Step 7: Commit**
```bash
git add server/src/modules/newsletter/newsletter.controller.js server/src/modules/newsletter/newsletter.public.router.js server/src/modules/newsletter/newsletter.admin.router.js server/src/modules/newsletter/newsletter.router.test.js
git commit -m "feat(newsletter): add controller + public/admin routers"
```

---

## Task 8: Wire newsletter mounts

**Files:** Modify `server/src/shared/constants/routerMounts.js`, `server/src/index.js`; Test extend `server/src/shared/constants/routerMounts.test.js`.

- [ ] **Step 1: Add mounts** — in `ROUTER_MOUNTS` (after `content: "/api/content"`):
```js
  newsletter: "/api/newsletter",
  newsletterAdmin: "/api/admin/newsletter",
```

- [ ] **Step 2: Extend mount test** — append to `server/src/shared/constants/routerMounts.test.js`:
```js
import { describe as describeNl, it as itNl, expect as expectNl } from "vitest";
import { ROUTER_MOUNTS as MOUNTS_NL } from "./routerMounts.js";
describeNl("ROUTER_MOUNTS — newsletter", () => {
  itNl("declares newsletter mounts", () => {
    expectNl(MOUNTS_NL.newsletter).toBe("/api/newsletter");
    expectNl(MOUNTS_NL.newsletterAdmin).toBe("/api/admin/newsletter");
  });
});
```

- [ ] **Step 3: Run → PASS** `npm test --workspace=server -- routerMounts`

- [ ] **Step 4: Wire in `server/src/index.js`** — add imports near the content router imports:
```js
import { createNewsletterPublicRouter } from "./modules/newsletter/newsletter.public.router.js";
import { createNewsletterAdminRouter } from "./modules/newsletter/newsletter.admin.router.js";
import rateLimit from "express-rate-limit";
```
Add a tight subscribe limiter before `const app = createApp(`:
```js
// Tight limiter for the public newsletter subscribe endpoint (abuse protection).
const newsletterLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
```
In the `createApp({ ... routeLimiters: { ... } })` call, add `newsletter: newsletterLimiter,` to `routeLimiters`, and in `routers: { ... }` (after `content:`):
```js
    // Newsletter: public subscribe + admin subscriber management.
    newsletter: createNewsletterPublicRouter(),
    newsletterAdmin: createNewsletterAdminRouter({ requireAuth }),
```

- [ ] **Step 5: Run the whole server suite** `npm run test:server` — Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add server/src/shared/constants/routerMounts.js server/src/shared/constants/routerMounts.test.js server/src/index.js
git commit -m "feat(newsletter): mount newsletter routers with subscribe rate limiter"
```

---

## Task 9: Shared `FooterView` component

**Files:** Create `packages/shared-web/src/footer/FooterView.jsx`; Modify `packages/shared-web/src/index.js`. (Tested via storefront in Task 10.)

- [ ] **Step 1: Implement the component**

```jsx
// packages/shared-web/src/footer/FooterView.jsx
import { useState } from "react";

/**
 * Pure presentational storefront footer. Props are the public footer shape plus
 * an optional `onSubscribe(email)` and newsletter `status`/`message`. No data
 * fetching. All icons inline SVG. Colors are token-driven via class names; the
 * consuming app supplies the CSS. Renders null when there is no content.
 */
const SOCIAL_ICON = {
  facebook: <path d="M14 9h2V6h-2c-1.7 0-3 1.3-3 3v2H9v3h2v5h3v-5h2.1l.4-3H14v-1.5c0-.3.2-.5.5-.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  instagram: <><rect x="4" y="4" width="16" height="16" rx="4.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="16.5" cy="7.5" r="1" fill="currentColor" /></>,
  youtube: <><rect x="3" y="6" width="18" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 9.5l4 2.5-4 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>,
  whatsapp: <path d="M5 19l1.2-3.4A6.5 6.5 0 1118 18.6 6.5 6.5 0 015 19zm5-9c-.3 0-.6.1-.8.5-.2.4-.7 1-.7 1.8s.6 1.7.9 2.1c.3.4 1.4 1.8 3.1 2.4 1.5.6 1.8.5 2.2.4.4-.1 1-.5 1.1-.9.1-.4.1-.8 0-.9-.1-.1-.3-.2-.6-.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  twitter: <path d="M18 6l-5.2 6.3L18.5 19h-3.3l-3-3.9L8.7 19H6l5.5-6.6L6 6h3.3l2.7 3.6L15.3 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />,
};
const TRUST_ICON = {
  shield: <path d="M12 3l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  truck: <><path d="M3 7h10v8H3zM13 10h4l3 3v2h-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="7" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.5" /><circle cx="17" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.5" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.5" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M4 13h16M12 9v11M9 9a2 2 0 110-4c2 0 3 4 3 4M15 9a2 2 0 100-4c-2 0-3 4-3 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>,
  star: <path d="M12 4l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 15.8 7.3 18.2l.9-5.1L4.5 9.5l5.2-.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  heart: <path d="M12 20s-7-4.3-9-8c-1.5-3 .5-6 3.5-6 2 0 3.5 1.3 5.5 3.5C16 4.3 17.5 3 19.5 3c3 0 5 3 3.5 6-2 3.7-9 8-9 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
};
const svg = (child) => (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">{child}</svg>);

export default function FooterView({
  columns = [], newsletter, membershipPromo, social = [], contact = {},
  trustHighlights = [], bottomLinks = [], copyrightText = "",
  onSubscribe, status = "idle", message = "",
}) {
  const [email, setEmail] = useState("");
  const hasContact = contact && Object.values(contact).some(Boolean);
  const nothing =
    columns.length === 0 && !newsletter && !membershipPromo && social.length === 0 &&
    !hasContact && trustHighlights.length === 0 && bottomLinks.length === 0 && !copyrightText;
  if (nothing) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (onSubscribe) onSubscribe(email);
  }

  return (
    <footer className="pot-footer">
      <div className="pot-footer__main">
        <div className="pot-footer__left">
          {columns.length > 0 && (
            <div className="pot-footer__columns">
              {columns.map((col) => (
                <nav key={col.id} className="pot-footer__col" aria-label={col.title || "Footer"}>
                  {col.title && <h3 className="pot-footer__col-title">{col.title}</h3>}
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.id}><a href={l.url} className="pot-footer__link">{l.label}</a></li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          )}
          {trustHighlights.length > 0 && (
            <ul className="pot-footer__trust">
              {trustHighlights.map((t) => (
                <li key={t.id} className="pot-footer__trust-item">
                  <span className="pot-footer__trust-icon">{svg(TRUST_ICON[t.iconKey] || TRUST_ICON.shield)}</span>
                  <span><strong>{t.title}</strong>{t.subtitle && <span className="pot-footer__trust-sub">{t.subtitle}</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {hasContact && (
            <address className="pot-footer__contact">
              {contact.companyName && <div className="pot-footer__contact-name">{contact.companyName}</div>}
              {contact.address && <div>{contact.address}</div>}
              {contact.phone && <div>Phone: {contact.phone}</div>}
              {contact.whatsapp && <div>WhatsApp: {contact.whatsapp}</div>}
              {contact.email && <div>Email: {contact.email}</div>}
              {contact.supportHours && <div>{contact.supportHours}</div>}
            </address>
          )}
        </div>

        <aside className="pot-footer__community">
          {newsletter && (
            <div className="pot-footer__newsletter">
              {newsletter.title && <h3 className="pot-footer__community-title">{newsletter.title}</h3>}
              {newsletter.subtitle && <p className="pot-footer__community-sub">{newsletter.subtitle}</p>}
              <form className="pot-footer__form" onSubmit={handleSubmit}>
                <input
                  type="email" className="pot-footer__input" aria-label="Email address"
                  placeholder={newsletter.placeholder || "Enter your email"}
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                />
                <button type="submit" className="pot-footer__subscribe" disabled={status === "loading"}>
                  {status === "loading" ? "…" : (newsletter.buttonLabel || "Subscribe")}
                </button>
              </form>
              {message && (
                <p className={`pot-footer__msg pot-footer__msg--${status}`} role="status">{message}</p>
              )}
            </div>
          )}
          {membershipPromo && (membershipPromo.title || membershipPromo.description) && (
            <div className="pot-footer__membership">
              {membershipPromo.title && <h4 className="pot-footer__membership-title">{membershipPromo.title}</h4>}
              {membershipPromo.description && <p>{membershipPromo.description}</p>}
              {membershipPromo.buttonLabel && (
                <a href={membershipPromo.buttonUrl || "#"} className="pot-footer__membership-btn">{membershipPromo.buttonLabel}</a>
              )}
            </div>
          )}
          {social.length > 0 && (
            <div className="pot-footer__social">
              {social.map((s) => (
                <a key={s.id} href={s.url} className="pot-footer__social-link" aria-label={s.platform}
                  target="_blank" rel="noopener noreferrer">
                  {svg(SOCIAL_ICON[s.platform])}
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>

      {(bottomLinks.length > 0 || copyrightText) && (
        <div className="pot-footer__bottom">
          {copyrightText && <span className="pot-footer__copyright">{copyrightText}</span>}
          {bottomLinks.length > 0 && (
            <nav className="pot-footer__bottom-links" aria-label="Legal">
              {bottomLinks.map((l) => (<a key={l.id} href={l.url} className="pot-footer__link">{l.label}</a>))}
            </nav>
          )}
        </div>
      )}
    </footer>
  );
}
```

- [ ] **Step 2: Export** — append to `packages/shared-web/src/index.js`:
```js
// Storefront footer presentational component (consumed by storefront + admin preview).
export { default as FooterView } from "./footer/FooterView.jsx";
```

- [ ] **Step 3: Verify shared-web tests still pass** `npm run test:shared` — Expected: PASS (no new test here; exercised in Task 10).

- [ ] **Step 4: Commit**
```bash
git add packages/shared-web/src/footer/FooterView.jsx packages/shared-web/src/index.js
git commit -m "feat(shared-web): add presentational FooterView"
```

---

## Task 10: Storefront Footer wrapper + mount

**Files:** Create `apps/client/src/components/Footer.jsx`, `Footer.css`; Modify `apps/client/src/components/CustomerLayout.jsx`; Test `apps/client/src/components/Footer.test.jsx`.

- [ ] **Step 1: Failing test**

```jsx
// apps/client/src/components/Footer.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Footer from "./Footer.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe("Footer", () => {
  it("renders nothing when disabled", async () => {
    apiMock.get.mockResolvedValue({ footer: { enabled: false } });
    const { container } = render(<Footer />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container.querySelector(".pot-footer")).toBeNull();
  });
  it("renders columns and submits the newsletter", async () => {
    apiMock.get.mockResolvedValue({ footer: {
      enabled: true,
      columns: [{ id: "c", title: "Shop", links: [{ id: "l", label: "Sale", url: "/sale" }] }],
      newsletter: { enabled: true, title: "Join", placeholder: "Enter your email", buttonLabel: "Subscribe" },
      social: [], bottomLinks: [], copyrightText: "© 2026",
    }});
    apiMock.post.mockResolvedValue({ ok: true });
    render(<Footer />);
    expect(await screen.findByText("Shop")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "me@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/newsletter/subscribe", { email: "me@x.com" }));
    expect(await screen.findByText(/thanks/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=@planet-of-toys/client -- Footer`

- [ ] **Step 3: Wrapper**

```jsx
// apps/client/src/components/Footer.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { FooterView } from "@planet-of-toys/shared-web";
import "./Footer.css";

/**
 * Storefront footer: fetches the public footer, owns the newsletter submit, and
 * renders the shared FooterView. Renders nothing when disabled/empty or on
 * fetch failure — never blocks the page.
 */
export default function Footer() {
  const [footer, setFooter] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.get("/api/content/footer")
      .then((res) => { if (active) setFooter(res?.footer ?? null); })
      .catch(() => { if (active) setFooter(null); });
    return () => { active = false; };
  }, []);

  if (!footer || !footer.enabled) return null;

  async function handleSubscribe(email) {
    setStatus("loading");
    setMessage("");
    try {
      await apiClient.post("/api/newsletter/subscribe", { email });
      setStatus("success");
      setMessage("Thanks for subscribing!");
    } catch {
      setStatus("error");
      setMessage("Sorry, that didn't work. Please try again.");
    }
  }

  return (
    <FooterView
      columns={footer.columns}
      newsletter={footer.newsletter}
      membershipPromo={footer.membershipPromo}
      social={footer.social}
      contact={footer.contact}
      trustHighlights={footer.trustHighlights}
      bottomLinks={footer.bottomLinks}
      copyrightText={footer.copyrightText}
      onSubscribe={handleSubscribe}
      status={status}
      message={message}
    />
  );
}
```

- [ ] **Step 4: Stylesheet** (token-driven; left light, right brand blue, red button, yellow accents)

```css
/* apps/client/src/components/Footer.css */
.pot-footer { font-family: var(--font-body); color: var(--color-text-primary); }
.pot-footer__main { display: grid; grid-template-columns: 1.6fr 1fr; gap: 0; }
.pot-footer__left { background: #f4f6fb; padding: var(--space-7) var(--space-6); }
.pot-footer__columns { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-5); }
.pot-footer__col-title { font-family: var(--font-heading); color: var(--color-secondary); font-size: 0.95rem; margin: 0 0 var(--space-3); }
.pot-footer__col ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.pot-footer__link { text-decoration: none; color: #4b5563; font-size: 0.9rem; }
.pot-footer__link:hover { color: var(--color-secondary); }
.pot-footer__trust { list-style: none; margin: var(--space-6) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-5); }
.pot-footer__trust-item { display: flex; align-items: center; gap: var(--space-2); font-size: 0.85rem; color: #4b5563; }
.pot-footer__trust-icon { color: var(--color-accent-strong, #C9A100); display: inline-flex; }
.pot-footer__trust-sub { display: block; color: #6b7280; font-size: 0.78rem; }
.pot-footer__contact { font-style: normal; margin-top: var(--space-6); font-size: 0.85rem; color: #4b5563; display: grid; gap: 2px; }
.pot-footer__contact-name { font-weight: 700; color: var(--color-secondary); }

.pot-footer__community { background: var(--color-secondary); color: #fff; padding: var(--space-7) var(--space-6); display: grid; gap: var(--space-5); align-content: start; }
.pot-footer__community-title { font-family: var(--font-heading); font-size: 1.3rem; margin: 0 0 var(--space-2); }
.pot-footer__community-sub { margin: 0 0 var(--space-3); opacity: 0.9; font-size: 0.9rem; }
.pot-footer__form { display: flex; gap: var(--space-2); }
.pot-footer__input { flex: 1; border: 0; border-radius: 999px; padding: 0 var(--space-4); height: 46px; background: #fff; color: var(--color-text-primary); font: inherit; }
.pot-footer__subscribe { border: 0; border-radius: 999px; padding: 0 var(--space-5); height: 46px; background: var(--color-primary); color: #fff; font-weight: 700; cursor: pointer; }
.pot-footer__subscribe:disabled { opacity: 0.7; cursor: default; }
.pot-footer__msg { margin: var(--space-2) 0 0; font-size: 0.85rem; }
.pot-footer__msg--success { color: var(--color-accent); }
.pot-footer__msg--error { color: #ffd0d0; }
.pot-footer__membership { border: 1px solid rgba(255,255,255,0.3); border-radius: var(--radius-card); padding: var(--space-4); }
.pot-footer__membership-title { margin: 0 0 var(--space-2); color: var(--color-accent); font-family: var(--font-heading); }
.pot-footer__membership-btn { display: inline-block; margin-top: var(--space-3); background: var(--color-primary); color: #fff; text-decoration: none; padding: var(--space-2) var(--space-4); border-radius: var(--radius-button); font-weight: 700; }
.pot-footer__social { display: flex; gap: var(--space-3); }
.pot-footer__social-link { color: #fff; display: inline-flex; }

.pot-footer__bottom { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; padding: var(--space-3) var(--space-6); background: #0f1a4d; color: #fff; font-size: 0.82rem; }
.pot-footer__bottom .pot-footer__link { color: #d7ddf3; }
.pot-footer__bottom-links { display: flex; gap: var(--space-4); flex-wrap: wrap; }

@media (max-width: 900px) {
  .pot-footer__main { grid-template-columns: 1fr; }
  .pot-footer__columns { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .pot-footer__columns { grid-template-columns: 1fr; }
  .pot-footer__form { flex-direction: column; }
  .pot-footer__subscribe { width: 100%; }
  .pot-footer__bottom { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 5: Mount** — in `apps/client/src/components/CustomerLayout.jsx` import and render `<Footer />` after `<Outlet />`:
```jsx
import Footer from "./Footer.jsx";
```
```jsx
      <PromoBanner />
      <Header />
      <Outlet />
      <Footer />
```

- [ ] **Step 6: Run → PASS** `npm test --workspace=@planet-of-toys/client -- Footer`

- [ ] **Step 7: Full client suite** `npm run test:client` — Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add apps/client/src/components/Footer.jsx apps/client/src/components/Footer.css apps/client/src/components/Footer.test.jsx apps/client/src/components/CustomerLayout.jsx
git commit -m "feat(client): render dynamic footer site-wide with newsletter signup"
```

---

## Task 11: Admin Footer editor + Content sub-route

**Files:** Create `apps/admin/src/pages/admin/content/FooterPage.jsx`, `FooterEditor.jsx`, `FooterEditor.css`; Modify `apps/admin/src/components/AdminLayout.jsx`, `apps/admin/src/App.jsx`; Test `apps/admin/src/pages/admin/content/FooterEditor.test.jsx`.

- [ ] **Step 1: Failing test**

```jsx
// apps/admin/src/pages/admin/content/FooterEditor.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import FooterEditor from "./FooterEditor.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

const EMPTY = { footer: { id: "1", enabled: true, columns: [], newsletter: { enabled: true, title: "", subtitle: "", placeholder: "", buttonLabel: "" }, membershipPromo: { enabled: true, title: "", description: "", buttonLabel: "", buttonUrl: "" }, social: [], contact: {}, trustHighlights: [], bottomLinks: [], copyrightText: "" } };

beforeEach(() => { apiMock.get.mockReset(); apiMock.put.mockReset(); globalThis.matchMedia ??= vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }); });
afterEach(() => vi.restoreAllMocks());

describe("FooterEditor", () => {
  it("loads, adds a column + link, and saves the payload", async () => {
    apiMock.get.mockResolvedValue(EMPTY);
    apiMock.put.mockResolvedValue(EMPTY);
    render(<FooterEditor />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/api/admin/content/footer", { token: "t" }));
    fireEvent.click(screen.getByRole("button", { name: /add column/i }));
    fireEvent.change(screen.getByLabelText(/column 1 title/i), { target: { value: "Shop" } });
    fireEvent.click(screen.getByRole("button", { name: /add link to column 1/i }));
    fireEvent.change(screen.getByLabelText(/column 1 link 1 label/i), { target: { value: "Sale" } });
    fireEvent.change(screen.getByLabelText(/column 1 link 1 url/i), { target: { value: "/sale" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const payload = apiMock.put.mock.calls[0][1];
    expect(payload.columns[0].title).toBe("Shop");
    expect(payload.columns[0].links[0]).toMatchObject({ label: "Sale", url: "/sale" });
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=@planet-of-toys/admin -- FooterEditor`

- [ ] **Step 3: Editor** — create `apps/admin/src/pages/admin/content/FooterEditor.jsx`:

```jsx
// apps/admin/src/pages/admin/content/FooterEditor.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { FooterView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import "./FooterEditor.css";

const API_PATH = "/api/admin/content/footer";
const PLATFORMS = ["facebook", "instagram", "youtube", "whatsapp", "twitter"];
const ICON_KEYS = ["shield", "truck", "lock", "gift", "star", "heart"];
const rid = () => `n-${Math.random().toString(36).slice(2)}`;

function toForm(f) {
  return {
    enabled: f?.enabled !== false,
    columns: (f?.columns ?? []).map((c) => ({ id: c.id || rid(), title: c.title || "", enabled: c.enabled !== false,
      links: (c.links ?? []).map((l) => ({ id: l.id || rid(), label: l.label || "", url: l.url || "", enabled: l.enabled !== false })) })),
    newsletter: { enabled: f?.newsletter?.enabled !== false, title: f?.newsletter?.title || "", subtitle: f?.newsletter?.subtitle || "", placeholder: f?.newsletter?.placeholder || "", buttonLabel: f?.newsletter?.buttonLabel || "" },
    membershipPromo: { enabled: f?.membershipPromo?.enabled !== false, title: f?.membershipPromo?.title || "", description: f?.membershipPromo?.description || "", buttonLabel: f?.membershipPromo?.buttonLabel || "", buttonUrl: f?.membershipPromo?.buttonUrl || "" },
    social: PLATFORMS.map((p) => ({ platform: p, url: (f?.social ?? []).find((s) => s.platform === p)?.url || "" })),
    contact: { companyName: f?.contact?.companyName || "", address: f?.contact?.address || "", phone: f?.contact?.phone || "", email: f?.contact?.email || "", whatsapp: f?.contact?.whatsapp || "", supportHours: f?.contact?.supportHours || "" },
    trustHighlights: (f?.trustHighlights ?? []).map((t) => ({ id: t.id || rid(), iconKey: t.iconKey || "shield", title: t.title || "", subtitle: t.subtitle || "" })),
    bottomLinks: (f?.bottomLinks ?? []).map((l) => ({ id: l.id || rid(), label: l.label || "", url: l.url || "", enabled: l.enabled !== false })),
    copyrightText: f?.copyrightText || "",
  };
}
function toPayload(form) {
  return {
    enabled: form.enabled,
    columns: form.columns.map((c) => ({ title: c.title, enabled: c.enabled, links: c.links.map((l) => ({ label: l.label, url: l.url, enabled: l.enabled })) })),
    newsletter: form.newsletter,
    membershipPromo: form.membershipPromo,
    social: form.social.filter((s) => s.url.trim()).map((s) => ({ platform: s.platform, url: s.url })),
    contact: form.contact,
    trustHighlights: form.trustHighlights.map((t) => ({ iconKey: t.iconKey, title: t.title, subtitle: t.subtitle })),
    bottomLinks: form.bottomLinks.map((l) => ({ label: l.label, url: l.url, enabled: l.enabled })),
    copyrightText: form.copyrightText,
  };
}

export default function FooterEditor() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const res = await apiClient.get(API_PATH, { token: getToken() }); setForm(toForm(res?.footer)); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { notifyUnauthorized(); return; } setErr("Could not load the footer."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setColumns = (columns) => setForm((f) => ({ ...f, columns }));
  function addColumn() { setColumns([...form.columns, { id: rid(), title: "", enabled: true, links: [] }]); }
  function removeColumn(i) { setColumns(form.columns.filter((_, x) => x !== i)); }
  function moveColumn(from, to) { if (to < 0 || to >= form.columns.length) return; const cs = form.columns.slice(); const [m] = cs.splice(from, 1); cs.splice(to, 0, m); setColumns(cs); }
  function updColumn(i, patch) { const cs = form.columns.slice(); cs[i] = { ...cs[i], ...patch }; setColumns(cs); }
  function addLink(ci) { updColumn(ci, { links: [...form.columns[ci].links, { id: rid(), label: "", url: "", enabled: true }] }); }
  function removeLink(ci, li) { updColumn(ci, { links: form.columns[ci].links.filter((_, x) => x !== li) }); }
  function updLink(ci, li, patch) { const links = form.columns[ci].links.slice(); links[li] = { ...links[li], ...patch }; updColumn(ci, { links }); }

  async function save(e) {
    e.preventDefault(); setSaving(true); setMsg(null); setErr(null);
    try { const res = await apiClient.put(API_PATH, toPayload(form), { token: getToken() }); setForm(toForm(res?.footer)); setMsg("Saved."); }
    catch (e2) { if (e2 instanceof ApiError && e2.status === 401) { notifyUnauthorized(); return; } setErr(e2 instanceof ApiError ? e2.message : "Could not save the footer."); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="footer-editor__status">Loading…</p>;
  if (!form) return <p className="footer-editor__status">{err || "Unavailable."}</p>;

  const previewSocial = form.social.filter((s) => s.url.trim());
  return (
    <form className="footer-editor" onSubmit={save}>
      <header className="footer-editor__head">
        <h1>Footer Content</h1>
        <div className="footer-editor__actions">
          <button type="submit" className="footer-editor__save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          {msg && <span className="footer-editor__ok">{msg}</span>}
          {err && <span className="footer-editor__err">{err}</span>}
        </div>
      </header>

      <section className="footer-card"><div className="footer-card__head"><h2>Live preview</h2></div>
        <div className="footer-editor__preview">
          <FooterView columns={form.columns.filter((c)=>c.enabled).map((c)=>({ id:c.id, title:c.title, links:c.links.filter((l)=>l.enabled).map((l)=>({id:l.id,label:l.label,url:l.url})) }))}
            newsletter={form.newsletter.enabled ? form.newsletter : undefined}
            membershipPromo={form.membershipPromo.enabled ? form.membershipPromo : undefined}
            social={previewSocial} contact={form.contact} trustHighlights={form.trustHighlights}
            bottomLinks={form.bottomLinks.filter((l)=>l.enabled)} copyrightText={form.copyrightText} />
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Settings</h2></div>
        <label className="footer-editor__check"><input type="checkbox" checked={form.enabled} onChange={(e)=>set({enabled:e.target.checked})} /> Enable footer</label>
      </section>

      <section className="footer-card">
        <div className="footer-card__head"><h2>Navigation columns</h2><button type="button" className="footer-editor__add" onClick={addColumn}>Add column</button></div>
        <div className="footer-editor__cols">
          {form.columns.map((c, ci) => (
            <div key={c.id} className="footer-editor__col">
              <div className="footer-editor__col-bar">
                <button type="button" aria-label={`Move up column ${ci+1}`} onClick={()=>moveColumn(ci, ci-1)} disabled={ci===0}>↑</button>
                <button type="button" aria-label={`Move down column ${ci+1}`} onClick={()=>moveColumn(ci, ci+1)} disabled={ci===form.columns.length-1}>↓</button>
                <button type="button" aria-label={`Remove column ${ci+1}`} onClick={()=>removeColumn(ci)}>✕</button>
              </div>
              <label className="footer-editor__field"><span>Column {ci+1} title</span>
                <input type="text" value={c.title} onChange={(e)=>updColumn(ci, { title: e.target.value })} /></label>
              <ul className="footer-editor__links">
                {c.links.map((l, li) => (
                  <li key={l.id} className="footer-editor__link-row">
                    <label className="footer-editor__field"><span>Column {ci+1} link {li+1} label</span>
                      <input type="text" value={l.label} onChange={(e)=>updLink(ci, li, { label: e.target.value })} /></label>
                    <label className="footer-editor__field"><span>Column {ci+1} link {li+1} url</span>
                      <input type="text" value={l.url} onChange={(e)=>updLink(ci, li, { url: e.target.value })} /></label>
                    <button type="button" aria-label={`Remove column ${ci+1} link ${li+1}`} onClick={()=>removeLink(ci, li)}>✕</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="footer-editor__add" aria-label={`Add link to column ${ci+1}`} onClick={()=>addLink(ci)}>Add link</button>
            </div>
          ))}
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Newsletter</h2></div>
        <div className="footer-editor__grid">
          <label className="footer-editor__check"><input type="checkbox" checked={form.newsletter.enabled} onChange={(e)=>set({newsletter:{...form.newsletter,enabled:e.target.checked}})} /> Enabled</label>
          <label className="footer-editor__field"><span>Title</span><input value={form.newsletter.title} onChange={(e)=>set({newsletter:{...form.newsletter,title:e.target.value}})} /></label>
          <label className="footer-editor__field footer-editor__field--wide"><span>Subtitle</span><input value={form.newsletter.subtitle} onChange={(e)=>set({newsletter:{...form.newsletter,subtitle:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Placeholder</span><input value={form.newsletter.placeholder} onChange={(e)=>set({newsletter:{...form.newsletter,placeholder:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Button label</span><input value={form.newsletter.buttonLabel} onChange={(e)=>set({newsletter:{...form.newsletter,buttonLabel:e.target.value}})} /></label>
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Membership promo</h2></div>
        <div className="footer-editor__grid">
          <label className="footer-editor__check"><input type="checkbox" checked={form.membershipPromo.enabled} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,enabled:e.target.checked}})} /> Enabled</label>
          <label className="footer-editor__field"><span>Title</span><input value={form.membershipPromo.title} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,title:e.target.value}})} /></label>
          <label className="footer-editor__field footer-editor__field--wide"><span>Description</span><input value={form.membershipPromo.description} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,description:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Button label</span><input value={form.membershipPromo.buttonLabel} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,buttonLabel:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Button URL</span><input value={form.membershipPromo.buttonUrl} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,buttonUrl:e.target.value}})} /></label>
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Social links</h2></div>
        <div className="footer-editor__grid">
          {form.social.map((s, i) => (
            <label key={s.platform} className="footer-editor__field"><span>{s.platform}</span>
              <input value={s.url} placeholder="https://…" onChange={(e)=>{ const social=form.social.slice(); social[i]={...s,url:e.target.value}; set({social}); }} /></label>
          ))}
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Contact</h2></div>
        <div className="footer-editor__grid">
          {["companyName","address","phone","email","whatsapp","supportHours"].map((k) => (
            <label key={k} className="footer-editor__field"><span>{k}</span>
              <input value={form.contact[k]} onChange={(e)=>set({contact:{...form.contact,[k]:e.target.value}})} /></label>
          ))}
        </div>
      </section>

      <section className="footer-card">
        <div className="footer-card__head"><h2>Trust highlights</h2>
          <button type="button" className="footer-editor__add" onClick={()=>set({trustHighlights:[...form.trustHighlights,{id:rid(),iconKey:"shield",title:"",subtitle:""}]})}>Add highlight</button></div>
        <ul className="footer-editor__list">
          {form.trustHighlights.map((t, i) => (
            <li key={t.id} className="footer-editor__grid footer-editor__item">
              <label className="footer-editor__field"><span>Icon</span>
                <select value={t.iconKey} onChange={(e)=>{ const ts=form.trustHighlights.slice(); ts[i]={...t,iconKey:e.target.value}; set({trustHighlights:ts}); }}>
                  {ICON_KEYS.map((k)=>(<option key={k} value={k}>{k}</option>))}</select></label>
              <label className="footer-editor__field"><span>Title</span><input value={t.title} onChange={(e)=>{ const ts=form.trustHighlights.slice(); ts[i]={...t,title:e.target.value}; set({trustHighlights:ts}); }} /></label>
              <label className="footer-editor__field"><span>Subtitle</span><input value={t.subtitle} onChange={(e)=>{ const ts=form.trustHighlights.slice(); ts[i]={...t,subtitle:e.target.value}; set({trustHighlights:ts}); }} /></label>
              <button type="button" aria-label={`Remove highlight ${i+1}`} onClick={()=>set({trustHighlights:form.trustHighlights.filter((_,x)=>x!==i)})}>✕</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="footer-card">
        <div className="footer-card__head"><h2>Bottom bar</h2>
          <button type="button" className="footer-editor__add" onClick={()=>set({bottomLinks:[...form.bottomLinks,{id:rid(),label:"",url:"",enabled:true}]})}>Add link</button></div>
        <ul className="footer-editor__list">
          {form.bottomLinks.map((l, i) => (
            <li key={l.id} className="footer-editor__grid footer-editor__item">
              <label className="footer-editor__field"><span>Label</span><input value={l.label} onChange={(e)=>{ const bl=form.bottomLinks.slice(); bl[i]={...l,label:e.target.value}; set({bottomLinks:bl}); }} /></label>
              <label className="footer-editor__field"><span>URL</span><input value={l.url} onChange={(e)=>{ const bl=form.bottomLinks.slice(); bl[i]={...l,url:e.target.value}; set({bottomLinks:bl}); }} /></label>
              <button type="button" aria-label={`Remove bottom link ${i+1}`} onClick={()=>set({bottomLinks:form.bottomLinks.filter((_,x)=>x!==i)})}>✕</button>
            </li>
          ))}
        </ul>
        <label className="footer-editor__field"><span>Copyright text</span>
          <input value={form.copyrightText} onChange={(e)=>set({copyrightText:e.target.value})} placeholder="© 2026 Planet of Toys. All rights reserved." /></label>
      </section>
    </form>
  );
}
```

- [ ] **Step 4: Styles** — create `apps/admin/src/pages/admin/content/FooterEditor.css` (reuses the light admin tokens like ContentPage.css):

```css
.footer-editor { max-width: 980px; }
.footer-editor__status { padding: 1rem; opacity: 0.8; }
.footer-editor__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.footer-editor__head h1 { margin: 0; }
.footer-editor__actions { display: flex; align-items: center; gap: .75rem; }
.footer-editor__save { padding: .55rem 1.4rem; border: 0; border-radius: 8px; background: var(--admin-accent,#2E3192); color: #fff; font-weight: 700; cursor: pointer; }
.footer-editor__save:disabled { opacity: .6; cursor: default; }
.footer-editor__ok { color: var(--admin-accent,#2E3192); font-weight: 600; }
.footer-editor__err { color: var(--color-error,#EF4444); font-weight: 600; }
.footer-card { border: 1px solid var(--admin-elevated,#D9E2F2); border-radius: 12px; margin-bottom: 1.25rem; overflow: hidden; background: var(--admin-surface,#F4F7FE); }
.footer-card__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .85rem 1rem; border-bottom: 1px solid var(--admin-elevated,#D9E2F2); }
.footer-card__head h2 { margin: 0; font-size: 1rem; }
.footer-editor__preview { padding: 1rem; background: var(--admin-hover,#EAF1FF); }
.footer-editor__grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: .85rem; padding: 1rem; }
.footer-editor__field { display: flex; flex-direction: column; gap: .3rem; font-size: .85rem; color: var(--admin-text-muted,#64748B); }
.footer-editor__field--wide { grid-column: 1 / -1; }
.footer-editor__field input, .footer-editor__field select { padding: .5rem .65rem; border: 1px solid var(--admin-elevated,#D9E2F2); border-radius: 8px; background: #fff; color: var(--admin-text,#1E293B); font: inherit; }
.footer-editor__check { display: flex; align-items: center; gap: .5rem; padding: 1rem; font-size: .9rem; color: var(--admin-text,#1E293B); }
.footer-editor__add { border: 1px solid var(--admin-accent,#2E3192); background: #fff; color: var(--admin-accent,#2E3192); border-radius: 8px; padding: .35rem .85rem; cursor: pointer; font-weight: 700; }
.footer-editor__cols { display: grid; gap: 1rem; padding: 1rem; }
.footer-editor__col { border: 1px solid var(--admin-elevated,#D9E2F2); border-radius: 10px; padding: .85rem; background: #fff; display: grid; gap: .6rem; }
.footer-editor__col-bar { display: flex; gap: .35rem; justify-content: flex-end; }
.footer-editor__links { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem; }
.footer-editor__link-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: .5rem; align-items: end; }
.footer-editor__list { list-style: none; margin: 0; padding: 1rem; display: grid; gap: .75rem; }
.footer-editor__item { grid-template-columns: 1fr 1fr 1fr auto; align-items: end; padding: 0; }
@media (max-width: 640px) { .footer-editor__grid, .footer-editor__item, .footer-editor__link-row { grid-template-columns: 1fr; } }
```

- [ ] **Step 5: Page wrapper** — create `apps/admin/src/pages/admin/content/FooterPage.jsx`:
```jsx
import FooterEditor from "./FooterEditor.jsx";
export default function FooterPage() { return <FooterEditor />; }
```

- [ ] **Step 6: Nav + route** — in `AdminLayout.jsx` add to the Content group `children` (after Promotional Banner):
```jsx
      { to: "/admin/content/footer", label: "Footer Content" },
```
In `apps/admin/src/App.jsx` add the import and the nested route under `content`:
```jsx
import FooterPage from "./pages/admin/content/FooterPage.jsx";
```
```jsx
            <Route path="footer" element={<FooterPage />} />
```

- [ ] **Step 7: Run → PASS** `npm test --workspace=@planet-of-toys/admin -- FooterEditor`

- [ ] **Step 8: Full admin suite** `npm run test:admin` — Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add apps/admin/src/pages/admin/content/FooterPage.jsx apps/admin/src/pages/admin/content/FooterEditor.jsx apps/admin/src/pages/admin/content/FooterEditor.css apps/admin/src/components/AdminLayout.jsx apps/admin/src/App.jsx apps/admin/src/pages/admin/content/FooterEditor.test.jsx
git commit -m "feat(admin): add Footer Content editor with live preview"
```

---

## Task 12: Admin Marketing — Subscribers page

**Files:** Create `apps/admin/src/pages/admin/marketing/SubscribersPage.jsx`, `SubscribersPage.css`; Modify `apps/admin/src/components/AdminLayout.jsx`, `apps/admin/src/App.jsx`; Test `apps/admin/src/pages/admin/marketing/SubscribersPage.test.jsx`.

- [ ] **Step 1: Failing test**

```jsx
// apps/admin/src/pages/admin/marketing/SubscribersPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SubscribersPage from "./SubscribersPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.patch.mockReset(); });
afterEach(() => vi.restoreAllMocks());

const PAGE = { subscribers: [{ id: "s1", email: "a@x.com", status: "subscribed", source: "footer", subscribedAt: "2026-06-15T00:00:00Z" }], total: 1, page: 1, limit: 20 };

describe("SubscribersPage", () => {
  it("loads subscribers and can unsubscribe one", async () => {
    apiMock.get.mockResolvedValue(PAGE);
    apiMock.patch.mockResolvedValue({ subscriber: { ...PAGE.subscribers[0], status: "unsubscribed" } });
    render(<SubscribersPage />);
    expect(await screen.findByText("a@x.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /unsubscribe a@x.com/i }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      "/api/admin/newsletter/subscribers/s1/unsubscribe", undefined, { token: "t" }
    ));
  });
  it("searches by email", async () => {
    apiMock.get.mockResolvedValue(PAGE);
    render(<SubscribersPage />);
    await screen.findByText("a@x.com");
    fireEvent.change(screen.getByLabelText(/search subscribers/i), { target: { value: "beta" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(apiMock.get).toHaveBeenLastCalledWith(
      expect.stringContaining("search=beta"), { token: "t" }
    ));
  });
});
```

- [ ] **Step 2: Run → FAIL** `npm test --workspace=@planet-of-toys/admin -- SubscribersPage`

- [ ] **Step 3: Page**

```jsx
// apps/admin/src/pages/admin/marketing/SubscribersPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError, API_BASE_URL } from "@planet-of-toys/shared-web/apiClient";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import "./SubscribersPage.css";

const PER_PAGE = 20;

export default function SubscribersPage() {
  const [data, setData] = useState({ subscribers: [], total: 0, page: 1, limit: PER_PAGE });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async (searchValue, pageValue) => {
    setLoading(true); setErr(null);
    const qs = new URLSearchParams({ search: searchValue, page: String(pageValue), limit: String(PER_PAGE) }).toString();
    try { setData(await apiClient.get(`/api/admin/newsletter/subscribers?${qs}`, { token: getToken() })); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { notifyUnauthorized(); return; } setErr("Could not load subscribers."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(search, page); }, [load, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(e) { e.preventDefault(); setPage(1); load(search, 1); }
  async function unsubscribe(id) {
    try { await apiClient.patch(`/api/admin/newsletter/subscribers/${id}/unsubscribe`, undefined, { token: getToken() }); load(search, page); }
    catch (e) { if (e instanceof ApiError && e.status === 401) notifyUnauthorized(); }
  }
  function exportCsv() {
    const qs = new URLSearchParams({ search }).toString();
    // Authenticated CSV: fetch as blob then trigger a download.
    fetch(`${API_BASE_URL}/api/admin/newsletter/subscribers/export?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "subscribers.csv"; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setErr("Export failed."));
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  return (
    <section className="subs-page">
      <header className="subs-page__head">
        <h1>Newsletter Subscribers</h1>
        <button type="button" className="subs-page__export" onClick={exportCsv}>Export CSV</button>
      </header>
      <form role="search" className="subs-page__search" onSubmit={onSearch}>
        <input type="search" aria-label="Search subscribers" placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit">Search</button>
      </form>
      {err && <p className="subs-page__err">{err}</p>}
      {loading ? <p>Loading…</p> : (
        <>
          <table className="subs-page__table">
            <thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Subscribed</th><th></th></tr></thead>
            <tbody>
              {data.subscribers.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td><td>{s.status}</td><td>{s.source}</td>
                  <td>{s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString() : ""}</td>
                  <td>{s.status === "subscribed" && (
                    <button type="button" aria-label={`Unsubscribe ${s.email}`} onClick={() => unsubscribe(s.id)}>Unsubscribe</button>
                  )}</td>
                </tr>
              ))}
              {data.subscribers.length === 0 && <tr><td colSpan="5">No subscribers.</td></tr>}
            </tbody>
          </table>
          <div className="subs-page__pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {data.page} of {totalPages} ({data.total})</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Styles** — create `apps/admin/src/pages/admin/marketing/SubscribersPage.css`:
```css
.subs-page { padding: 1.5rem; max-width: 980px; color: var(--admin-text,#1E293B); }
.subs-page__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.subs-page__head h1 { margin: 0; }
.subs-page__export { border: 1px solid var(--admin-accent,#2E3192); background: #fff; color: var(--admin-accent,#2E3192); border-radius: 8px; padding: .45rem 1rem; cursor: pointer; font-weight: 700; }
.subs-page__search { display: flex; gap: .5rem; margin-bottom: 1rem; }
.subs-page__search input { flex: 1; padding: .5rem .65rem; border: 1px solid var(--admin-elevated,#D9E2F2); border-radius: 8px; background: #fff; color: var(--admin-text,#1E293B); }
.subs-page__search button, .subs-page__pager button { padding: .45rem 1rem; border: 1px solid var(--admin-elevated,#D9E2F2); background: #fff; border-radius: 8px; cursor: pointer; }
.subs-page__err { color: var(--color-error,#EF4444); }
.subs-page__table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--admin-elevated,#D9E2F2); border-radius: 10px; overflow: hidden; }
.subs-page__table th, .subs-page__table td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid var(--admin-elevated,#D9E2F2); font-size: .9rem; }
.subs-page__table th { background: var(--admin-surface,#F4F7FE); }
.subs-page__table td button { border: 1px solid var(--color-error,#EF4444); color: var(--color-error,#EF4444); background: #fff; border-radius: 6px; padding: .25rem .6rem; cursor: pointer; }
.subs-page__pager { display: flex; align-items: center; gap: .75rem; margin-top: 1rem; }
```

- [ ] **Step 5: Marketing nav group + route** — in `AdminLayout.jsx` add a new group to `NAV_ITEMS` (after the Content group):
```jsx
  {
    label: "Marketing",
    Icon: IconContent,
    basePath: "/admin/marketing",
    children: [{ to: "/admin/marketing/subscribers", label: "Newsletter Subscribers" }],
  },
```
In `apps/admin/src/App.jsx` add the import and a route inside the guarded block:
```jsx
import SubscribersPage from "./pages/admin/marketing/SubscribersPage.jsx";
```
```jsx
          <Route path="marketing">
            <Route index element={<Navigate to="subscribers" replace />} />
            <Route path="subscribers" element={<SubscribersPage />} />
          </Route>
```

- [ ] **Step 6: Run → PASS** `npm test --workspace=@planet-of-toys/admin -- SubscribersPage`

- [ ] **Step 7: Full admin suite** `npm run test:admin` — Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add apps/admin/src/pages/admin/marketing/SubscribersPage.jsx apps/admin/src/pages/admin/marketing/SubscribersPage.css apps/admin/src/components/AdminLayout.jsx apps/admin/src/App.jsx apps/admin/src/pages/admin/marketing/SubscribersPage.test.jsx
git commit -m "feat(admin): add Marketing > Newsletter Subscribers (search, CSV export, unsubscribe)"
```

---

## Task 13: Full-suite verification

- [ ] **Step 1: All suites** `npm test` — Expected: PASS (server + client + admin + shared-web).
- [ ] **Step 2: Builds** `npm run build:client && npm run build:admin` — Expected: both succeed (confirms `FooterView` resolves through Vite in both apps).
- [ ] **Step 3: Manual smoke (optional):** admin → Content → Footer Content: add columns/links, newsletter copy, membership, social, trust, bottom bar; Save; storefront shows the footer; subscribe an email; admin → Marketing → Newsletter Subscribers shows it, search works, Export CSV downloads, Unsubscribe flips status.

---

## Self-Review Notes

- **Spec coverage:** FooterContent model (T1) + ipAddress/userAgent on NewsletterSubscriber (T5); footer service/controller/routers + public projection no-leak (T2–T4); newsletter model/service/controller/routers/wiring incl. dedup, list, CSV, unsubscribe, rate limiter (T5–T8); shared FooterView (T9); storefront Footer + real subscribe + mount + responsive CSS (T10); admin FooterEditor + live preview + Content sub-route/nav (T11); Marketing subscribers page + group/route (T12); verification (T13). Colors token-driven (T10 CSS); inline SVG only (T9). Membership = promo-only (T1/T9/T11).
- **Type/name consistency:** response shapes `{ footer }`, `{ subscribers,total,page,limit }`, `{ ok, already }`, `{ subscriber }` consistent across controller/tests/pages; `FooterView` props identical in storefront (T10) and admin preview (T11); service methods `getFooter/updateFooter/getPublicFooter`, `subscribe/listSubscribers/unsubscribe/exportCsv` consistent across service/controller/routers/tests; `decodeEntities` reused in footer service (T2).
- **No placeholders:** every step has complete code + exact commands. Reorder controls use ↑/↓/✕ glyphs in the admin editor (consistent with the current PromoBannerEditor controls); not storefront-facing.
- **Dependency note:** T8 imports `express-rate-limit` (already a server dependency, used by `rateLimiters.js`).
