# Hero Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, admin-managed homepage Hero Engine — slide *types* rendered in selectable *display modes*, with scheduling, priority, Draft/Published + soft-delete/restore, analytics-ready fields, a shared storefront/admin render path, and a real `HomePage` wrapper.

**Architecture:** New `server/src/modules/hero/` module (HeroSlide model + service + controller + public/admin routers, mounted via `ROUTER_MOUNTS`). Shared `packages/shared-web/src/hero/` components (carousel engine + per-displayMode layouts) consumed by the storefront homepage and the admin live preview. CTA hrefs + collection_grid items resolved server-side. No changes to checkout, orders, payments, shipping, WhatsApp, auth.

**Tech Stack:** Node + Express + Mongoose (ESM), Vitest + mongodb-memory-server, React 18 + Vite + react-router-dom, Testing Library (jsdom), npm workspaces.

**Reference patterns (mirror exactly):**
- Catalog module from prior sub-projects: `server/src/modules/catalog/*` (model `toJSON`, `CatalogValidationError`, controller `wrap`, router factories, `app.listen(0)`+`fetch` router tests).
- Scope-generic product query: `queryProductsForScope` in `server/src/modules/catalog/collectionQuery.service.js`.
- Shared View contract + barrels: `packages/shared-web/src/catalog/*`, `index.js`, `../index.js`, `catalog-views.css`.
- Client page/section + fetch: `apps/client/src/components/CatalogBrowse.jsx`, `apps/client/src/pages/CollectionPage.jsx`.
- Admin editor + preview + content sidebar: `apps/admin/src/pages/admin/content/FooterEditor.jsx`, `apps/admin/src/pages/admin/catalog/DevicePreview.jsx`, `apps/admin/src/App.jsx`.
- Format helpers: `mediaUrl`, `formatINR` from `@planet-of-toys/shared-web/format`.

**Conventions:** server `npm test --workspace server -- <file>`; shared-web `npm test --workspace @planet-of-toys/shared-web -- <file>`; admin `npm test --workspace @planet-of-toys/admin -- <file>`; client `npm test --workspace @planet-of-toys/client -- <file>`. Commit per task with the message shown; `git add` only the listed files. CRLF warnings are normal.

---

## File Structure

**Server — new `server/src/modules/hero/`:**
- `heroSlide.model.js` — schema (type, displayMode, ctaType, links, media, gridProductIds, status, active, deletedAt, startDate/endDate, priority, sortOrder, impressions, clicks, meta).
- `hero.service.js` — admin CRUD + `getPublicSlides` (visibility + ordering + resolved ctaHref + gridItems); `softDelete`/`restore`/`setActive`/`reorder`.
- `hero.controller.js`, `hero.public.router.js`, `hero.admin.router.js`, `*.test.js`.

**Server — modified:** `models/index.js` (register HeroSlide), `shared/constants/routerMounts.js` (`hero`, `heroAdmin`), `index.js` (wire), `package.json` (`seed:hero`), new `scripts/seed-hero.js`.

**Shared — new `packages/shared-web/src/hero/`:**
- `HeroEngineView.jsx` (carousel), `HeroSlideView.jsx` (dispatch by displayMode), `layouts/HeroFullBanner.jsx`, `layouts/HeroSplit.jsx`, `layouts/HeroVideo.jsx`, `layouts/HeroCollectionGrid.jsx`, `layouts/HeroEvent.jsx`, `hero-views.css`, `index.js` (+ tests). Main barrel `src/index.js` re-exports `HeroEngineView`.

**Client — new/modified:** `apps/client/src/components/HeroEngine.jsx` (section), `apps/client/src/pages/HomePage.jsx` + `HomePage.css`, `apps/client/src/App.jsx` (index route → HomePage).

**Admin — modified:** `apps/admin/src/pages/admin/content/HeroBannerPage.jsx` (real editor).

---

## Task 1: HeroSlide model + registry

**Files:**
- Create: `server/src/modules/hero/heroSlide.model.js`
- Modify: `server/src/models/index.js`
- Test: `server/src/modules/hero/heroSlide.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/hero/heroSlide.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import HeroSlide from "./heroSlide.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await HeroSlide.deleteMany({}); });

describe("HeroSlide model", () => {
  it("applies defaults and maps _id to id", async () => {
    const json = (await HeroSlide.create({ type: "campaign", displayMode: "full_banner", title: "Summer Sale" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.status).toBe("draft");
    expect(json.active).toBe(true);
    expect(json.deletedAt).toBeNull();
    expect(json.ctaType).toBe("none");
    expect(json.priority).toBe(0);
    expect(json.sortOrder).toBe(0);
    expect(json.impressions).toBe(0);
    expect(json.clicks).toBe(0);
    expect(json.gridProductIds).toEqual([]);
  });

  it("rejects invalid type / displayMode / status", async () => {
    await expect(HeroSlide.create({ type: "bogus", displayMode: "full_banner" })).rejects.toThrow();
    await expect(HeroSlide.create({ type: "campaign", displayMode: "bogus" })).rejects.toThrow();
    await expect(HeroSlide.create({ type: "campaign", displayMode: "full_banner", status: "bogus" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- heroSlide.model.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/hero/heroSlide.model.js
import mongoose from "mongoose";

/**
 * HeroSlide — one homepage hero slide. `type` is the semantic purpose; `displayMode`
 * is the layout (decoupled, so the same campaign can render in different layouts).
 * Scheduling (startDate/endDate), priority/sortOrder, Draft/Published status,
 * soft-delete (deletedAt), and analytics counters apply to all slide types.
 * Media are filenames served via /api/media. `meta` reserves room for future types.
 */
const { Schema } = mongoose;

export const HERO_TYPES = Object.freeze(["campaign", "product", "video", "collection", "category", "seasonal"]);
export const HERO_DISPLAY_MODES = Object.freeze(["full_banner", "video", "split", "collection_grid", "event"]);
export const HERO_CTA_TYPES = Object.freeze(["product", "collection", "category", "customUrl", "none"]);
export const HERO_STATUSES = Object.freeze(["draft", "published"]);

const heroSlideSchema = new Schema(
  {
    type: { type: String, enum: HERO_TYPES, required: true },
    displayMode: { type: String, enum: HERO_DISPLAY_MODES, required: true },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    ctaText: { type: String, default: "" },
    ctaType: { type: String, enum: HERO_CTA_TYPES, default: "none" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    customUrl: { type: String, default: "" },
    desktopMedia: { type: String, default: null },
    mobileMedia: { type: String, default: null },
    video: { type: String, default: null },
    posterImage: { type: String, default: null },
    gridProductIds: { type: [{ type: Schema.Types.ObjectId, ref: "Product" }], default: [] },
    status: { type: String, enum: HERO_STATUSES, default: "draft", index: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null, index: true },
    startDate: { type: Date, default: null, index: true },
    endDate: { type: Date, default: null, index: true },
    priority: { type: Number, default: 0 },
    sortOrder: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed, default: {} },
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

heroSlideSchema.index({ priority: -1, sortOrder: 1 });

const HeroSlide = mongoose.models.HeroSlide || mongoose.model("HeroSlide", heroSlideSchema);
export default HeroSlide;
```

- [ ] **Step 4: Register the model**

Append to `server/src/models/index.js`:

```js
export { default as HeroSlide, HERO_TYPES, HERO_DISPLAY_MODES, HERO_CTA_TYPES, HERO_STATUSES } from "../modules/hero/heroSlide.model.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- heroSlide.model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/hero/heroSlide.model.js server/src/modules/hero/heroSlide.model.test.js server/src/models/index.js
git commit -m "feat(hero): add HeroSlide model"
```

---

## Task 2: Hero service (admin CRUD + public resolution)

**Files:**
- Create: `server/src/modules/hero/hero.service.js`
- Test: `server/src/modules/hero/hero.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/hero/hero.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import HeroSlide from "./heroSlide.model.js";
import { Product, Collection, Category } from "../../models/index.js";
import * as svc from "./hero.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await HeroSlide.deleteMany({}); await Product.deleteMany({});
  await Collection.deleteMany({}); await Category.deleteMany({});
});

describe("hero.service", () => {
  it("creates a slide and validates enums", async () => {
    const s = await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Sale" });
    expect(s.id).toBeDefined();
    await expect(svc.createSlide({ type: "campaign", displayMode: "nope" })).rejects.toBeInstanceOf(svc.HeroValidationError);
  });

  it("public slides exclude draft, inactive, soft-deleted, and out-of-window", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 86400000);
    const future = new Date(now.getTime() + 86400000);
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Published", status: "published" });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Draft", status: "draft" });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Inactive", status: "published", active: false });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Expired", status: "published", startDate: past, endDate: past });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Future", status: "published", startDate: future });
    const slides = await svc.getPublicSlides(now);
    expect(slides.map((s) => s.title)).toEqual(["Published"]);
  });

  it("orders by priority desc then sortOrder asc", async () => {
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Low", status: "published", priority: 20 });
    await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "High", status: "published", priority: 100 });
    const slides = await svc.getPublicSlides();
    expect(slides.map((s) => s.title)).toEqual(["High", "Low"]);
  });

  it("resolves ctaHref from the linked entity", async () => {
    const col = await Collection.create({ name: "STEM", slug: "stem" });
    await svc.createSlide({ type: "collection", displayMode: "full_banner", title: "C", status: "published", ctaType: "collection", collectionId: col._id });
    const [slide] = await svc.getPublicSlides();
    expect(slide.ctaHref).toBe("/collections/stem");
  });

  it("collection_grid uses manual gridProductIds when set, else derives from the collection", async () => {
    const col = await Collection.create({ name: "STEM", slug: "stem" });
    const p1 = await Product.create({ name: "A", slug: "a", price: 10, stock: 1, active: true, collectionIds: [col._id] });
    const p2 = await Product.create({ name: "B", slug: "b", price: 20, stock: 1, active: true, collectionIds: [col._id] });
    // manual selection
    await svc.createSlide({ type: "collection", displayMode: "collection_grid", title: "Manual", status: "published", collectionId: col._id, gridProductIds: [p2._id] });
    // derived
    await svc.createSlide({ type: "collection", displayMode: "collection_grid", title: "Derived", status: "published", collectionId: col._id, priority: -1 });
    const slides = await svc.getPublicSlides();
    const manual = slides.find((s) => s.title === "Manual");
    const derived = slides.find((s) => s.title === "Derived");
    expect(manual.gridItems.map((g) => g.slug)).toEqual(["b"]);
    expect(derived.gridItems.map((g) => g.slug).sort()).toEqual(["a", "b"]);
  });

  it("soft-deletes, restores, and toggles active", async () => {
    const s = await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "X", status: "published" });
    await svc.softDelete(s.id);
    expect(await svc.listSlides({ includeDeleted: false })).toHaveLength(0);
    expect(await svc.listSlides({ includeDeleted: true })).toHaveLength(1);
    await svc.restore(s.id);
    expect(await svc.listSlides({ includeDeleted: false })).toHaveLength(1);
    await svc.setActive(s.id, false);
    expect((await svc.getSlideById(s.id)).active).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- hero.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/hero/hero.service.js
import HeroSlide, { HERO_TYPES, HERO_DISPLAY_MODES, HERO_CTA_TYPES, HERO_STATUSES } from "./heroSlide.model.js";
import { Product, Collection, Category } from "../../models/index.js";
import { queryProductsForScope } from "../catalog/collectionQuery.service.js";
import { AppError } from "../../shared/errors/index.js";

/** Operational 400-class validation error for the hero module (client-safe message). */
export class HeroValidationError extends AppError {
  constructor(message, statusCode = 400) {
    super(message, statusCode, { clientMessage: message });
    this.name = "HeroValidationError";
  }
}

const WRITABLE = [
  "type", "displayMode", "title", "subtitle", "ctaText", "ctaType",
  "productId", "collectionId", "categoryId", "customUrl",
  "desktopMedia", "mobileMedia", "video", "posterImage", "gridProductIds",
  "status", "active", "startDate", "endDate", "priority", "sortOrder", "meta",
];

function pick(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validate(data, { creating } = {}) {
  if (creating) {
    if (!HERO_TYPES.includes(data.type)) throw new HeroValidationError(`type must be one of: ${HERO_TYPES.join(", ")}.`);
    if (!HERO_DISPLAY_MODES.includes(data.displayMode)) throw new HeroValidationError(`displayMode must be one of: ${HERO_DISPLAY_MODES.join(", ")}.`);
  } else {
    if (data.type !== undefined && !HERO_TYPES.includes(data.type)) throw new HeroValidationError("Invalid type.");
    if (data.displayMode !== undefined && !HERO_DISPLAY_MODES.includes(data.displayMode)) throw new HeroValidationError("Invalid displayMode.");
  }
  if (data.ctaType !== undefined && !HERO_CTA_TYPES.includes(data.ctaType)) throw new HeroValidationError("Invalid ctaType.");
  if (data.status !== undefined && !HERO_STATUSES.includes(data.status)) throw new HeroValidationError("Invalid status.");
}

// ---- admin CRUD ----

export async function createSlide(input = {}) {
  const data = pick(input);
  validate(data, { creating: true });
  const doc = await HeroSlide.create(data);
  return doc.toJSON();
}

export async function updateSlide(id, input = {}) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  const data = pick(input);
  validate(data, { creating: false });
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function getSlideById(id) {
  const doc = await HeroSlide.findById(id);
  return doc ? doc.toJSON() : null;
}

export async function listSlides({ includeDeleted = false } = {}) {
  const query = includeDeleted ? {} : { deletedAt: null };
  const docs = await HeroSlide.find(query).sort({ priority: -1, sortOrder: 1, createdAt: -1 });
  return docs.map((d) => d.toJSON());
}

export async function setActive(id, active) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  doc.active = Boolean(active);
  await doc.save();
  return doc.toJSON();
}

export async function softDelete(id) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restore(id) {
  const doc = await HeroSlide.findById(id);
  if (!doc) throw new HeroValidationError("Hero slide not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorder(items = []) {
  if (!Array.isArray(items)) throw new HeroValidationError("Reorder payload must be an array.");
  await Promise.all(items.map((it) => {
    const set = { sortOrder: Number(it.sortOrder) || 0 };
    if (it.priority !== undefined) set.priority = Number(it.priority) || 0;
    return HeroSlide.updateOne({ _id: it.id }, { $set: set });
  }));
  return listSlides({ includeDeleted: false });
}

// ---- public resolution ----

const cardOf = (j) => ({ id: j.id, slug: j.slug, name: j.name, price: j.price, images: j.images });

/** Up to 4 product cards for a collection_grid slide: manual gridProductIds, else derived. */
async function gridItemsFor(slide) {
  if (Array.isArray(slide.gridProductIds) && slide.gridProductIds.length) {
    const docs = await Product.find({ _id: { $in: slide.gridProductIds }, active: true });
    const byId = new Map(docs.map((d) => [String(d._id), cardOf(d.toJSON())]));
    return slide.gridProductIds.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 4);
  }
  if (slide.collectionId) {
    const { products } = await queryProductsForScope({ field: "collectionIds", id: slide.collectionId }, { limit: 4 });
    return products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, images: p.images }));
  }
  if (slide.categoryId) {
    const { products } = await queryProductsForScope({ field: "categoryIds", id: slide.categoryId }, { limit: 4 });
    return products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, images: p.images }));
  }
  return [];
}

/** Visible, ordered, fully-resolved slides for the storefront. */
export async function getPublicSlides(now = new Date()) {
  const docs = await HeroSlide.find({
    deletedAt: null, status: "published", active: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  }).sort({ priority: -1, sortOrder: 1, createdAt: -1 });

  // Batch-load CTA targets to resolve hrefs without N+1.
  const pIds = [], colIds = [], catIds = [];
  for (const d of docs) {
    if (d.ctaType === "product" && d.productId) pIds.push(d.productId);
    if (d.ctaType === "collection" && d.collectionId) colIds.push(d.collectionId);
    if (d.ctaType === "category" && d.categoryId) catIds.push(d.categoryId);
  }
  const [prods, cols, cats] = await Promise.all([
    pIds.length ? Product.find({ _id: { $in: pIds } }) : [],
    colIds.length ? Collection.find({ _id: { $in: colIds } }) : [],
    catIds.length ? Category.find({ _id: { $in: catIds } }) : [],
  ]);
  const pSlug = new Map(prods.map((p) => [String(p._id), p.slug]));
  const colSlug = new Map(cols.map((c) => [String(c._id), c.slug]));
  const catSlug = new Map(cats.map((c) => [String(c._id), c.slug]));
  const hrefOf = (d) => {
    if (d.ctaType === "product") { const s = pSlug.get(String(d.productId)); return s ? `/product/${s}` : null; }
    if (d.ctaType === "collection") { const s = colSlug.get(String(d.collectionId)); return s ? `/collections/${s}` : null; }
    if (d.ctaType === "category") { const s = catSlug.get(String(d.categoryId)); return s ? `/category/${s}` : null; }
    if (d.ctaType === "customUrl") return d.customUrl || null;
    return null;
  };

  const out = [];
  for (const d of docs) {
    const j = d.toJSON();
    const slide = {
      id: j.id, type: j.type, displayMode: j.displayMode, title: j.title, subtitle: j.subtitle,
      ctaText: j.ctaText, ctaHref: hrefOf(j),
      desktopMedia: j.desktopMedia, mobileMedia: j.mobileMedia, video: j.video, posterImage: j.posterImage,
    };
    if (j.displayMode === "collection_grid") {
      // eslint-disable-next-line no-await-in-loop
      slide.gridItems = await gridItemsFor(j);
    }
    out.push(slide);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- hero.service.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/hero/hero.service.js server/src/modules/hero/hero.service.test.js
git commit -m "feat(hero): add hero service (CRUD + public resolution)"
```

---

## Task 3: Hero controller + public router

**Files:**
- Create: `server/src/modules/hero/hero.controller.js`
- Create: `server/src/modules/hero/hero.public.router.js`
- Test: `server/src/modules/hero/hero.public.router.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/hero/hero.public.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createHeroPublicRouter } from "./hero.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import HeroSlide from "./heroSlide.model.js";
import * as svc from "./hero.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await HeroSlide.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/hero", createHeroPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/hero` };
}

describe("hero public router", () => {
  it("returns only published+active slides", async () => {
    const { server, base } = buildApp();
    try {
      await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Live", status: "published" });
      await svc.createSlide({ type: "campaign", displayMode: "full_banner", title: "Draft", status: "draft" });
      const body = await (await fetch(base)).json();
      expect(body.slides.map((s) => s.title)).toEqual(["Live"]);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- hero.public.router.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the controller + public router**

```js
// server/src/modules/hero/hero.controller.js
import * as hero from "./hero.service.js";

/** Thin HTTP layer over the hero service. Errors forwarded to the central handler. */
export function createHeroController() {
  const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };
  return {
    publicSlides: wrap(async (_req, res) => res.json({ slides: await hero.getPublicSlides(new Date()) })),

    list: wrap(async (req, res) => res.json({ slides: await hero.listSlides({ includeDeleted: req.query.includeDeleted === "true" }) })),
    get: wrap(async (req, res) => res.json({ slide: await hero.getSlideById(req.params.id) })),
    create: wrap(async (req, res) => res.status(201).json({ slide: await hero.createSlide(req.body ?? {}) })),
    update: wrap(async (req, res) => res.json({ slide: await hero.updateSlide(req.params.id, req.body ?? {}) })),
    setActive: wrap(async (req, res) => res.json({ slide: await hero.setActive(req.params.id, req.body?.active) })),
    softDelete: wrap(async (req, res) => res.json({ slide: await hero.softDelete(req.params.id) })),
    restore: wrap(async (req, res) => res.json({ slide: await hero.restore(req.params.id) })),
    reorder: wrap(async (req, res) => res.json({ slides: await hero.reorder(req.body?.items ?? req.body ?? []) })),
  };
}

export default createHeroController;
```

```js
// server/src/modules/hero/hero.public.router.js
import { Router } from "express";
import { createHeroController } from "./hero.controller.js";

/** Public hero router. Mounted at `/api/hero` (see ROUTER_MOUNTS). */
export function createHeroPublicRouter() {
  const router = Router();
  const c = createHeroController();
  router.get("/", c.publicSlides);
  return router;
}

export default createHeroPublicRouter;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- hero.public.router.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/hero/hero.controller.js server/src/modules/hero/hero.public.router.js server/src/modules/hero/hero.public.router.test.js
git commit -m "feat(hero): add controller + public router"
```

---

## Task 4: Hero admin router

**Files:**
- Create: `server/src/modules/hero/hero.admin.router.js`
- Test: `server/src/modules/hero/hero.admin.router.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/hero/hero.admin.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createHeroAdminRouter } from "./hero.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import HeroSlide from "./heroSlide.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await HeroSlide.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Auth required", status: 401 } });
    req.admin = { id: "a" }; next();
  };
  app.use("/api/admin/hero", createHeroAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/hero` };
}
const send = (url, method, body) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe("hero admin router", () => {
  it("rejects unauthenticated requests", async () => {
    const { server, base } = buildApp({ authorized: false });
    try { expect((await fetch(base)).status).toBe(401); } finally { server.close(); }
  });

  it("creates, soft-deletes, restores, and lists with includeDeleted", async () => {
    const { server, base } = buildApp();
    try {
      const created = (await (await send(base, "POST", { type: "campaign", displayMode: "full_banner", title: "X" })).json()).slide;
      expect(created.title).toBe("X");
      await send(`${base}/${created.id}/soft-delete`, "POST");
      expect((await (await fetch(base)).json()).slides).toHaveLength(0);
      expect((await (await fetch(`${base}?includeDeleted=true`)).json()).slides).toHaveLength(1);
      await send(`${base}/${created.id}/restore`, "POST");
      expect((await (await fetch(base)).json()).slides).toHaveLength(1);
    } finally { server.close(); }
  });

  it("400s an invalid displayMode", async () => {
    const { server, base } = buildApp();
    try {
      const r = await send(base, "POST", { type: "campaign", displayMode: "bogus" });
      expect(r.status).toBe(400);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- hero.admin.router.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the admin router**

```js
// server/src/modules/hero/hero.admin.router.js
import { Router } from "express";
import { createHeroController } from "./hero.controller.js";

/**
 * Admin hero router. Mounted at `/api/admin/hero` (see ROUTER_MOUNTS), behind the
 * injected JWT auth guard. Soft delete + restore (no hard delete).
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 */
export function createHeroAdminRouter({ requireAuth = (req, res, next) => next() } = {}) {
  const router = Router();
  const c = createHeroController();
  router.use(requireAuth);
  router.get("/", c.list);
  router.post("/", c.create);
  router.put("/reorder", c.reorder);
  router.get("/:id", c.get);
  router.put("/:id", c.update);
  router.patch("/:id/active", c.setActive);
  router.post("/:id/soft-delete", c.softDelete);
  router.post("/:id/restore", c.restore);
  return router;
}

export default createHeroAdminRouter;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- hero.admin.router.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/hero/hero.admin.router.js server/src/modules/hero/hero.admin.router.test.js
git commit -m "feat(hero): add admin router"
```

---

## Task 5: Router mounts + app wiring

**Files:**
- Modify: `server/src/shared/constants/routerMounts.js`
- Modify: `server/src/index.js`
- Modify: `server/src/shared/constants/routerMounts.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/src/shared/constants/routerMounts.test.js`:

```js
import { describe as describeHero, it as itHero, expect as expectHero } from "vitest";
import { ROUTER_MOUNTS as MOUNTS_HERO } from "./routerMounts.js";
describeHero("ROUTER_MOUNTS — hero", () => {
  itHero("declares hero admin + public mount paths", () => {
    expectHero(MOUNTS_HERO.heroAdmin).toBe("/api/admin/hero");
    expectHero(MOUNTS_HERO.hero).toBe("/api/hero");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- routerMounts.test.js`
Expected: FAIL — `hero`/`heroAdmin` undefined.

- [ ] **Step 3: Add the mounts**

In `server/src/shared/constants/routerMounts.js`, add inside `Object.freeze({ ... })` after the
`catalog` line:

```js
  hero: "/api/hero",
  heroAdmin: "/api/admin/hero",
```

- [ ] **Step 4: Wire the routers in `server/src/index.js`**

Add imports near the other catalog/content router imports:

```js
import { createHeroPublicRouter } from "./modules/hero/hero.public.router.js";
import { createHeroAdminRouter } from "./modules/hero/hero.admin.router.js";
```

Add to the `routers: { ... }` object (after the `catalog` entry):

```js
    // Public storefront hero slides: /api/hero.
    hero: createHeroPublicRouter(),
    // Admin hero management: /api/admin/hero, guarded.
    heroAdmin: createHeroAdminRouter({ requireAuth }),
```

- [ ] **Step 5: Run tests to verify**

Run: `npm test --workspace server -- routerMounts.test.js app.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/shared/constants/routerMounts.js server/src/shared/constants/routerMounts.test.js server/src/index.js
git commit -m "feat(hero): mount hero public + admin routers"
```

---

## Task 6: Shared slide layouts + dispatch + CSS + exports

**Files:**
- Create: `packages/shared-web/src/hero/layouts/HeroFullBanner.jsx`, `HeroSplit.jsx`, `HeroVideo.jsx`, `HeroCollectionGrid.jsx`, `HeroEvent.jsx`
- Create: `packages/shared-web/src/hero/HeroSlideView.jsx`
- Create: `packages/shared-web/src/hero/hero-views.css`
- Create: `packages/shared-web/src/hero/index.js`
- Modify: `packages/shared-web/src/index.js`, `packages/shared-web/package.json`
- Test: `packages/shared-web/src/hero/HeroSlideView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/hero/HeroSlideView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HeroSlideView from "./HeroSlideView.jsx";

afterEach(cleanup);
const base = { id: "s", title: "Summer Sale", subtitle: "Up to 50% off", ctaText: "Shop Now", ctaHref: "/collections/sale" };

describe("HeroSlideView (dispatch by displayMode)", () => {
  it("full_banner renders title, subtitle, and CTA link", () => {
    render(<HeroSlideView slide={{ ...base, displayMode: "full_banner", desktopMedia: "d.webp" }} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(screen.getByText("Summer Sale")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop Now" })).toHaveAttribute("href", "/collections/sale");
  });

  it("split renders the media and the text block", () => {
    const { container } = render(<HeroSlideView slide={{ ...base, displayMode: "split", desktopMedia: "d.webp" }} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(container.querySelector(".pot-hero-split")).not.toBeNull();
    expect(screen.getByText("Summer Sale")).toBeInTheDocument();
  });

  it("video renders a <video> with poster and an unmute toggle", () => {
    const { container } = render(<HeroSlideView slide={{ ...base, displayMode: "video", video: "v.mp4", posterImage: "p.webp" }} resolveImageUrl={(f) => `/m/${f}`} active />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.getByRole("button", { name: /unmute|mute/i })).toBeInTheDocument();
  });

  it("collection_grid renders the grid product cards", () => {
    render(<HeroSlideView slide={{ ...base, displayMode: "collection_grid", gridItems: [{ id: "p", slug: "x", name: "Blocks", price: 99, images: [] }] }} resolveImageUrl={(f) => `/m/${f}`} formatPrice={(n) => `Rs ${n}`} />);
    expect(screen.getByText("Blocks")).toBeInTheDocument();
  });

  it("event renders as a banner with the event class", () => {
    const { container } = render(<HeroSlideView slide={{ ...base, displayMode: "event", desktopMedia: "d.webp" }} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(container.querySelector(".pot-hero--event")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- HeroSlideView`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the layout components**

```jsx
// packages/shared-web/src/hero/layouts/HeroFullBanner.jsx
/** Full-width banner: responsive media + overlaid title/subtitle + CTA. `eventClass`
 *  lets the event layout reuse this with an extra class. */
export default function HeroFullBanner({ slide, resolveImageUrl = (x) => x, eager = false, eventClass = "" }) {
  const { title, subtitle, ctaText, ctaHref, desktopMedia, mobileMedia } = slide;
  const desktop = desktopMedia ? resolveImageUrl(desktopMedia) : null;
  const mobile = mobileMedia ? resolveImageUrl(mobileMedia) : desktop;
  return (
    <div className={`pot-hero pot-hero--full ${eventClass}`.trim()}>
      {desktop && (
        <picture className="pot-hero__media">
          {mobile && <source media="(max-width: 768px)" srcSet={mobile} />}
          <img src={desktop} alt={title || ""} loading={eager ? "eager" : "lazy"} className="pot-hero__img" />
        </picture>
      )}
      <div className="pot-hero__overlay">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
    </div>
  );
}
```

```jsx
// packages/shared-web/src/hero/layouts/HeroEvent.jsx
import HeroFullBanner from "./HeroFullBanner.jsx";
/** Event layout = full banner with an event style hook. */
export default function HeroEvent(props) {
  return <HeroFullBanner {...props} eventClass="pot-hero--event" />;
}
```

```jsx
// packages/shared-web/src/hero/layouts/HeroSplit.jsx
/** Split layout: media on one side, text + CTA on the other. */
export default function HeroSplit({ slide, resolveImageUrl = (x) => x, eager = false }) {
  const { title, subtitle, ctaText, ctaHref, desktopMedia, mobileMedia } = slide;
  const desktop = desktopMedia ? resolveImageUrl(desktopMedia) : null;
  const mobile = mobileMedia ? resolveImageUrl(mobileMedia) : desktop;
  return (
    <div className="pot-hero pot-hero-split">
      <div className="pot-hero-split__media">
        {desktop && (
          <picture>
            {mobile && <source media="(max-width: 768px)" srcSet={mobile} />}
            <img src={desktop} alt={title || ""} loading={eager ? "eager" : "lazy"} className="pot-hero__img" />
          </picture>
        )}
      </div>
      <div className="pot-hero-split__text">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
    </div>
  );
}
```

```jsx
// packages/shared-web/src/hero/layouts/HeroVideo.jsx
import { useEffect, useRef, useState } from "react";

/** Video layout: muted autoplay loop video (plays only when `active`) + unmute toggle + CTA. */
export default function HeroVideo({ slide, resolveImageUrl = (x) => x, active = true }) {
  const { title, subtitle, ctaText, ctaHref, video, posterImage } = slide;
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) { const p = el.play?.(); if (p && p.catch) p.catch(() => {}); }
    else { el.pause?.(); }
  }, [active]);

  return (
    <div className="pot-hero pot-hero--video">
      {video && (
        <video ref={ref} className="pot-hero__video" muted={muted} loop playsInline preload="none"
          poster={posterImage ? resolveImageUrl(posterImage) : undefined} autoPlay={active}>
          <source src={resolveImageUrl(video)} type="video/mp4" />
        </video>
      )}
      <button type="button" className="pot-hero__mute" onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute video" : "Mute video"}>{muted ? "Unmute" : "Mute"}</button>
      <div className="pot-hero__overlay">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
    </div>
  );
}
```

```jsx
// packages/shared-web/src/hero/layouts/HeroCollectionGrid.jsx
import ProductCard from "../../catalog/ProductCard.jsx";

/** Collection-grid layout: heading + CTA + a small product grid (gridItems). */
export default function HeroCollectionGrid({ slide, resolveImageUrl = (x) => x, formatPrice = (n) => String(n) }) {
  const { title, subtitle, ctaText, ctaHref, gridItems = [] } = slide;
  return (
    <div className="pot-hero pot-hero-grid">
      <div className="pot-hero-grid__head">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
      <div className="pot-hero-grid__items">
        {gridItems.map((p) => (
          <ProductCard key={p.id} product={p} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} />
        ))}
      </div>
    </div>
  );
}
```

```jsx
// packages/shared-web/src/hero/HeroSlideView.jsx
import HeroFullBanner from "./layouts/HeroFullBanner.jsx";
import HeroSplit from "./layouts/HeroSplit.jsx";
import HeroVideo from "./layouts/HeroVideo.jsx";
import HeroCollectionGrid from "./layouts/HeroCollectionGrid.jsx";
import HeroEvent from "./layouts/HeroEvent.jsx";

/**
 * HeroSlideView — renders ONE slide by its `displayMode`. Pure; the consumer
 * supplies CSS, `resolveImageUrl`, `formatPrice`. `active` (video play/pause) and
 * `eager` (LCP image) are passed through by the carousel engine.
 */
export default function HeroSlideView({ slide, resolveImageUrl, formatPrice, active = true, eager = false }) {
  if (!slide) return null;
  const props = { slide, resolveImageUrl, formatPrice, active, eager };
  switch (slide.displayMode) {
    case "split": return <HeroSplit {...props} />;
    case "video": return <HeroVideo {...props} />;
    case "collection_grid": return <HeroCollectionGrid {...props} />;
    case "event": return <HeroEvent {...props} />;
    case "full_banner":
    default: return <HeroFullBanner {...props} />;
  }
}
```

- [ ] **Step 4: Write the CSS + exports**

```css
/* packages/shared-web/src/hero/hero-views.css */
.pot-hero { position: relative; width: 100%; overflow: hidden; border-radius: 16px; background: #f1f5fb; }
.pot-hero__media, .pot-hero__img, .pot-hero__video { display: block; width: 100%; height: 100%; object-fit: cover; }
.pot-hero--full, .pot-hero--video, .pot-hero--event { min-height: 360px; }
.pot-hero--full .pot-hero__img, .pot-hero--video .pot-hero__video { position: absolute; inset: 0; }
.pot-hero__overlay { position: relative; z-index: 1; padding: 40px; max-width: 620px; color: #fff;
  text-shadow: 0 1px 12px rgba(0,0,0,.35); display: grid; gap: 12px; align-content: center; min-height: 360px; }
.pot-hero__title { margin: 0; font-size: 2rem; font-weight: 800; }
.pot-hero__subtitle { margin: 0; font-size: 1.05rem; opacity: 0.95; }
.pot-hero__cta { justify-self: start; display: inline-block; background: #f81424; color: #fff; text-decoration: none;
  padding: 12px 26px; border-radius: 999px; font-weight: 700; }
.pot-hero__mute { position: absolute; right: 16px; bottom: 16px; z-index: 2; border: 0; border-radius: 999px;
  padding: 8px 14px; background: rgba(0,0,0,.55); color: #fff; cursor: pointer; }
.pot-hero--event { outline: 3px solid #ffe600; outline-offset: -3px; }
/* split */
.pot-hero-split { display: grid; grid-template-columns: 1fr 1fr; min-height: 360px; }
.pot-hero-split__media { overflow: hidden; }
.pot-hero-split__text { padding: 40px; display: grid; gap: 12px; align-content: center; }
.pot-hero-split .pot-hero__title { color: #1e293b; }
/* collection grid */
.pot-hero-grid { padding: 28px; }
.pot-hero-grid__head { display: grid; gap: 8px; margin-bottom: 18px; }
.pot-hero-grid__items { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
/* carousel chrome (used by HeroEngineView) */
.pot-hero-carousel { position: relative; }
.pot-hero-carousel__slide { display: none; }
.pot-hero-carousel__slide--active { display: block; }
.pot-hero-carousel__arrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; border: 0;
  width: 44px; height: 44px; border-radius: 999px; background: rgba(255,255,255,.85); cursor: pointer; font-size: 1.2rem; }
.pot-hero-carousel__arrow--prev { left: 12px; } .pot-hero-carousel__arrow--next { right: 12px; }
.pot-hero-carousel__dots { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }
.pot-hero-carousel__dot { width: 10px; height: 10px; border-radius: 999px; border: 0; background: #cbd5e1; cursor: pointer; }
.pot-hero-carousel__dot--active { background: #2e3192; }
@media (max-width: 768px) {
  .pot-hero-split { grid-template-columns: 1fr; }
  .pot-hero__overlay, .pot-hero--full, .pot-hero--video, .pot-hero--event, .pot-hero-split { min-height: 280px; }
  .pot-hero__title { font-size: 1.4rem; }
}
```

Create `packages/shared-web/src/hero/index.js`:

```js
export { default as HeroSlideView } from "./HeroSlideView.jsx";
export { default as HeroEngineView } from "./HeroEngineView.jsx";
```

Append to `packages/shared-web/src/index.js`:

```js
// Hero engine (storefront homepage + admin preview).
export { default as HeroEngineView } from "./hero/HeroEngineView.jsx";
export { default as HeroSlideView } from "./hero/HeroSlideView.jsx";
```

Add to the `exports` map in `packages/shared-web/package.json` (after the
`./catalog/catalog-views.css` entry, with a comma):

```json
    "./hero": "./src/hero/index.js",
    "./hero/hero-views.css": "./src/hero/hero-views.css"
```

(`index.js` re-exports `HeroEngineView` which is created in Task 7; run this task's test with the
`HeroSlideView` filter so it doesn't import the engine yet — the engine file lands in Task 7
before any full-suite run.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- HeroSlideView`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-web/src/hero/layouts packages/shared-web/src/hero/HeroSlideView.jsx packages/shared-web/src/hero/hero-views.css packages/shared-web/src/hero/index.js packages/shared-web/src/index.js packages/shared-web/package.json packages/shared-web/src/hero/HeroSlideView.test.jsx
git commit -m "feat(shared-web): add hero slide layouts + dispatch"
```

---

## Task 7: HeroEngineView carousel

**Files:**
- Create: `packages/shared-web/src/hero/HeroEngineView.jsx`
- Test: `packages/shared-web/src/hero/HeroEngineView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/hero/HeroEngineView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import HeroEngineView from "./HeroEngineView.jsx";

afterEach(cleanup);
const slides = [
  { id: "1", displayMode: "full_banner", title: "First", ctaText: "Go", ctaHref: "/a", desktopMedia: "1.webp" },
  { id: "2", displayMode: "full_banner", title: "Second", ctaText: "Go", ctaHref: "/b", desktopMedia: "2.webp" },
];

describe("HeroEngineView", () => {
  it("renders nothing when there are no slides", () => {
    const { container } = render(<HeroEngineView slides={[]} />);
    expect(container.querySelector(".pot-hero-carousel")).toBeNull();
  });

  it("renders all slides in the DOM (SEO) and marks the first active", () => {
    const { container } = render(<HeroEngineView slides={slides} autoPlay={false} resolveImageUrl={(f) => `/m/${f}`} />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    const active = container.querySelectorAll(".pot-hero-carousel__slide--active");
    expect(active).toHaveLength(1);
  });

  it("advances to the next slide on the next control", () => {
    const { container } = render(<HeroEngineView slides={slides} autoPlay={false} resolveImageUrl={(f) => `/m/${f}`} />);
    fireEvent.click(screen.getByRole("button", { name: /next slide/i }));
    const active = container.querySelector(".pot-hero-carousel__slide--active");
    expect(active.textContent).toContain("Second");
  });

  it("jumps to a slide via its dot", () => {
    const { container } = render(<HeroEngineView slides={slides} autoPlay={false} resolveImageUrl={(f) => `/m/${f}`} />);
    fireEvent.click(screen.getByRole("button", { name: /go to slide 2/i }));
    expect(container.querySelector(".pot-hero-carousel__slide--active").textContent).toContain("Second");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- HeroEngineView`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the engine**

```jsx
// packages/shared-web/src/hero/HeroEngineView.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import HeroSlideView from "./HeroSlideView.jsx";

/**
 * HeroEngineView — accessible hero carousel. Pure/presentational: takes resolved
 * `slides` + `resolveImageUrl`/`formatPrice`. Autoplay (default 4s) pauses on
 * hover and when the tab is hidden, and is disabled under prefers-reduced-motion.
 * All slides stay in the DOM (SEO); only the active one is shown (CSS). Supports
 * dots, prev/next, left/right keys, and touch swipe.
 */
export default function HeroEngineView({ slides = [], resolveImageUrl, formatPrice, autoPlay = true, intervalMs = 4000 }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const count = slides.length;

  const go = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  const reduced = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!autoPlay || reduced || paused || count <= 1) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [autoPlay, reduced, paused, count, intervalMs]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (count === 0) return null;

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  };
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -40) next(); else if (dx > 40) prev();
    touchX.current = null;
  };

  return (
    <section className="pot-hero-carousel" aria-roledescription="carousel" aria-label="Promotions"
      tabIndex={0} onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {count > 1 && <button type="button" className="pot-hero-carousel__arrow pot-hero-carousel__arrow--prev" aria-label="Previous slide" onClick={prev}>‹</button>}
      {slides.map((slide, i) => (
        <div key={slide.id} className={`pot-hero-carousel__slide${i === index ? " pot-hero-carousel__slide--active" : ""}`}
          aria-hidden={i === index ? undefined : true} aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
          <HeroSlideView slide={slide} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} active={i === index} eager={i === 0} />
        </div>
      ))}
      {count > 1 && <button type="button" className="pot-hero-carousel__arrow pot-hero-carousel__arrow--next" aria-label="Next slide" onClick={next}>›</button>}
      {count > 1 && (
        <div className="pot-hero-carousel__dots" role="tablist">
          {slides.map((slide, i) => (
            <button key={slide.id} type="button" role="tab" aria-selected={i === index}
              className={`pot-hero-carousel__dot${i === index ? " pot-hero-carousel__dot--active" : ""}`}
              aria-label={`Go to slide ${i + 1}`} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- HeroEngineView`
Expected: PASS (4 tests). Then run the full shared-web suite to confirm the hero barrel + exports resolve: `npm test --workspace @planet-of-toys/shared-web`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/hero/HeroEngineView.jsx packages/shared-web/src/hero/HeroEngineView.test.jsx
git commit -m "feat(shared-web): add HeroEngineView carousel"
```

---

## Task 8: Storefront HeroEngine section

**Files:**
- Create: `apps/client/src/components/HeroEngine.jsx`
- Test: `apps/client/src/components/HeroEngine.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/components/HeroEngine.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HeroEngine from "./HeroEngine.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

describe("HeroEngine", () => {
  it("fetches /api/hero and renders the slides", async () => {
    apiMock.get.mockResolvedValue({ slides: [{ id: "1", displayMode: "full_banner", title: "Summer Sale", ctaText: "Shop", ctaHref: "/a", desktopMedia: "d.webp" }] });
    render(<HeroEngine />);
    expect(await screen.findByText("Summer Sale")).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/api/hero");
  });

  it("renders nothing when there are no slides", async () => {
    apiMock.get.mockResolvedValue({ slides: [] });
    const { container } = render(<HeroEngine />);
    await Promise.resolve();
    expect(container.querySelector(".pot-hero-carousel")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- HeroEngine`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the section**

```jsx
// apps/client/src/components/HeroEngine.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { HeroEngineView } from "@planet-of-toys/shared-web";
import "@planet-of-toys/shared-web/hero/hero-views.css";

/**
 * Homepage Hero section — fetches the public hero slides and renders the shared
 * HeroEngineView. Renders nothing when there are no active slides.
 */
export default function HeroEngine() {
  const [slides, setSlides] = useState([]);
  useEffect(() => {
    let active = true;
    apiClient.get("/api/hero")
      .then((res) => { if (active) setSlides(res.slides || []); })
      .catch(() => { if (active) setSlides([]); });
    return () => { active = false; };
  }, []);
  if (!slides.length) return null;
  return <HeroEngineView slides={slides} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- HeroEngine`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/HeroEngine.jsx apps/client/src/components/HeroEngine.test.jsx
git commit -m "feat(client): add homepage HeroEngine section"
```

---

## Task 9: HomePage + index route

**Files:**
- Create: `apps/client/src/pages/HomePage.jsx`
- Create: `apps/client/src/pages/HomePage.css`
- Modify: `apps/client/src/App.jsx`
- Test: `apps/client/src/pages/HomePage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/pages/HomePage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HomePage from "./HomePage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.get.mockResolvedValue({ slides: [] }); });
afterEach(cleanup);

describe("HomePage", () => {
  it("renders the hero section and the future-section placeholders", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Best Sellers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shop By Age" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- HomePage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write HomePage + CSS**

```jsx
// apps/client/src/pages/HomePage.jsx
import HeroEngine from "../components/HeroEngine.jsx";
import "./HomePage.css";

/**
 * Storefront homepage. The Hero Engine is ONE section; the remaining sections are
 * placeholders today and will be built in later sub-projects (homepage
 * merchandising). Keeping this wrapper lets the homepage grow without touching
 * the hero.
 */
const FUTURE_SECTIONS = [
  "Shop By Age", "Shop By Category", "Best Sellers", "New Arrivals",
  "Featured Collections", "Reviews", "Why Choose Us",
];

export default function HomePage() {
  return (
    <main className="home">
      <section className="home__section home__hero" aria-label="Highlights">
        <HeroEngine />
      </section>
      {FUTURE_SECTIONS.map((label) => (
        <section key={label} className="home__section home__placeholder" aria-label={label}>
          <h2 className="home__heading">{label}</h2>
          <p className="home__soon">Coming soon</p>
        </section>
      ))}
    </main>
  );
}
```

```css
/* apps/client/src/pages/HomePage.css */
.home { max-width: 1320px; margin: 0 auto; padding: var(--space-5, 24px); display: grid; gap: var(--space-7, 48px); }
.home__hero:empty { display: none; }
.home__heading { margin: 0 0 8px; font-family: var(--font-heading, inherit); font-size: 1.4rem; font-weight: 800; color: var(--color-text-primary, #1e293b); }
.home__soon { margin: 0; color: var(--color-text-secondary, #64748b); }
.home__placeholder { border: 1px dashed var(--color-border, #e6ebf5); border-radius: 14px; padding: 28px; }
```

- [ ] **Step 4: Wire the index route**

In `apps/client/src/App.jsx`, add the import:

```jsx
import HomePage from "./pages/HomePage.jsx";
```

and replace the index route

```jsx
        <Route index element={<Placeholder title="Planet of Toys" />} />
```

with

```jsx
        <Route index element={<HomePage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- HomePage`
Expected: PASS (1 test). Run `npm test --workspace @planet-of-toys/client -- App` to confirm the route swap didn't break the app/router test.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/pages/HomePage.jsx apps/client/src/pages/HomePage.css apps/client/src/App.jsx apps/client/src/pages/HomePage.test.jsx
git commit -m "feat(client): add HomePage wrapper + index route"
```

---

## Task 10: Admin Hero editor (Content → Hero Banner)

**Files:**
- Modify: `apps/admin/src/pages/admin/content/HeroBannerPage.jsx` (replace placeholder)
- Test: `apps/admin/src/pages/admin/content/HeroBannerPage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/content/HeroBannerPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import HeroBannerPage from "./HeroBannerPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); apiMock.patch.mockReset(); });
afterEach(cleanup);

function mock() {
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/admin/hero")) return Promise.resolve({ slides: [{ id: "h1", type: "campaign", displayMode: "full_banner", title: "Summer Sale", status: "published", active: true, sortOrder: 0, priority: 0 }] });
    if (url.includes("/categories")) return Promise.resolve({ categories: [] });
    if (url.includes("/collections")) return Promise.resolve({ collections: [] });
    return Promise.resolve({});
  });
}

describe("HeroBannerPage", () => {
  it("loads hero slides", async () => {
    mock();
    render(<HeroBannerPage />);
    expect((await screen.findAllByText("Summer Sale")).length).toBeGreaterThan(0);
  });

  it("creates a slide", async () => {
    mock();
    apiMock.post.mockResolvedValue({ slide: { id: "h2", title: "New Campaign" } });
    render(<HeroBannerPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/slide title/i), { target: { value: "New Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /add slide/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/hero", expect.objectContaining({ title: "New Campaign", type: expect.any(String), displayMode: expect.any(String) }), expect.any(Object)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- HeroBannerPage`
Expected: FAIL — the placeholder has no list/form.

- [ ] **Step 3: Write the editor**

```jsx
// apps/admin/src/pages/admin/content/HeroBannerPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { HeroEngineView } from "@planet-of-toys/shared-web";
import "@planet-of-toys/shared-web/hero/hero-views.css";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "../catalog/DevicePreview.jsx";
import "../catalog/CatalogPage.css";

const HERO = "/api/admin/hero";
const TYPES = ["campaign", "product", "video", "collection", "category", "seasonal"];
const MODES = ["full_banner", "video", "split", "collection_grid", "event"];
const CTA_TYPES = ["none", "product", "collection", "category", "customUrl"];
const empty = {
  type: "campaign", displayMode: "full_banner", title: "", subtitle: "", ctaText: "",
  ctaType: "none", productId: "", collectionId: "", categoryId: "", customUrl: "",
  desktopMedia: null, mobileMedia: null, video: null, posterImage: null,
  status: "draft", priority: 0, startDate: "", endDate: "", active: true,
};

export default function HeroBannerPage() {
  const [slides, setSlides] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [cols, setCols] = useState([]);
  const [cats, setCats] = useState([]);
  const [err, setErr] = useState(null);
  const auth = () => ({ token: getToken() });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async (deleted) => {
    setErr(null);
    try {
      const [h, k, c] = await Promise.all([
        apiClient.get(`${HERO}?includeDeleted=${deleted ? "true" : "false"}`, auth()),
        apiClient.get(`/api/admin/catalog/collections`, auth()),
        apiClient.get(`/api/admin/catalog/categories`, auth()),
      ]);
      setSlides(h?.slides ?? []);
      setCols((k?.collections ?? []).map((x) => ({ id: x.id, name: x.name })));
      setCats((c?.categories ?? []).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load hero slides."); }
  }, []);
  useEffect(() => { load(showDeleted); }, [load, showDeleted]);

  function bodyFromForm(f) {
    const body = {
      type: f.type, displayMode: f.displayMode, title: f.title.trim(), subtitle: f.subtitle, ctaText: f.ctaText,
      ctaType: f.ctaType, customUrl: f.ctaType === "customUrl" ? f.customUrl : "",
      productId: f.ctaType === "product" ? (f.productId || null) : null,
      collectionId: f.collectionId || null, categoryId: f.categoryId || null,
      desktopMedia: f.desktopMedia, mobileMedia: f.mobileMedia, video: f.video, posterImage: f.posterImage,
      status: f.status, priority: Number(f.priority) || 0, active: f.active,
      startDate: f.startDate || null, endDate: f.endDate || null,
    };
    return body;
  }

  async function save() {
    if (!form.title.trim()) return;
    setErr(null);
    try {
      if (editingId) await apiClient.put(`${HERO}/${editingId}`, bodyFromForm(form), auth());
      else await apiClient.post(HERO, bodyFromForm(form), auth());
      setForm(empty); setEditingId(null); await load(showDeleted);
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save slide."); }
  }
  function editSlide(s) {
    setEditingId(s.id);
    setForm({ ...empty, ...s, productId: s.productId || "", collectionId: s.collectionId || "", categoryId: s.categoryId || "",
      startDate: s.startDate ? String(s.startDate).slice(0, 10) : "", endDate: s.endDate ? String(s.endDate).slice(0, 10) : "" });
  }
  async function toggleActive(s) {
    try { await apiClient.patch(`${HERO}/${s.id}/active`, { active: !s.active }, auth()); await load(showDeleted); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not update."); }
  }
  async function act(id, action) {
    try { await apiClient.post(`${HERO}/${id}/${action}`, {}, auth()); await load(showDeleted); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not update."); }
  }
  async function move(id, delta) {
    const list = slides.filter((x) => !x.deletedAt);
    const i = list.findIndex((x) => x.id === id);
    if (i + delta < 0 || i + delta >= list.length) return;
    const r = list.slice(); const [m] = r.splice(i, 1); r.splice(i + delta, 0, m);
    try { await apiClient.put(`${HERO}/reorder`, { items: r.map((x, idx) => ({ id: x.id, sortOrder: idx, priority: x.priority })) }, auth()); await load(showDeleted); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not reorder."); }
  }
  async function upload(field, file) {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
    const data = await res.json();
    set({ [field]: data.filename });
  }

  // Preview: published-style render of the in-progress form slide + existing active slides.
  const previewSlides = useMemo(() => {
    const draft = { id: "draft", ...bodyFromForm(form), ctaHref: form.ctaType === "customUrl" ? form.customUrl : "#",
      desktopMedia: form.desktopMedia, mobileMedia: form.mobileMedia, video: form.video, posterImage: form.posterImage, gridItems: [] };
    return [draft];
  }, [form]);

  if (slides === null) return <p className="catalog-page__status">Loading…</p>;
  const entity = form.ctaType === "category" ? cats : cols;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Hero Banner</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><HeroEngineView slides={previewSlides} autoPlay={false} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>{editingId ? "Edit slide" : "Add slide"}</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>Slide title</span>
            <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="catalog-page__field"><span>Type</span>
            <select value={form.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="catalog-page__field"><span>Display mode</span>
            <select value={form.displayMode} onChange={(e) => set({ displayMode: e.target.value })}>{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="catalog-page__field"><span>Subtitle</span>
            <input type="text" value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></label>
          <label className="catalog-page__field"><span>CTA text</span>
            <input type="text" value={form.ctaText} onChange={(e) => set({ ctaText: e.target.value })} /></label>
          <label className="catalog-page__field"><span>CTA type</span>
            <select value={form.ctaType} onChange={(e) => set({ ctaType: e.target.value })}>{CTA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          {form.ctaType === "product" && (
            <label className="catalog-page__field"><span>Product id</span>
              <input type="text" value={form.productId} onChange={(e) => set({ productId: e.target.value })} placeholder="product _id" /></label>
          )}
          {(form.ctaType === "collection" || form.displayMode === "collection_grid") && (
            <label className="catalog-page__field"><span>Collection</span>
              <select value={form.collectionId} onChange={(e) => set({ collectionId: e.target.value })}>
                <option value="">Select…</option>{cols.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          )}
          {form.ctaType === "category" && (
            <label className="catalog-page__field"><span>Category</span>
              <select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">Select…</option>{cats.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          )}
          {form.ctaType === "customUrl" && (
            <label className="catalog-page__field"><span>Custom URL</span>
              <input type="text" value={form.customUrl} onChange={(e) => set({ customUrl: e.target.value })} /></label>
          )}
          <label className="catalog-page__field"><span>Status</span>
            <select value={form.status} onChange={(e) => set({ status: e.target.value })}><option value="draft">draft</option><option value="published">published</option></select></label>
          <label className="catalog-page__field"><span>Priority</span>
            <input type="number" value={form.priority} onChange={(e) => set({ priority: e.target.value })} /></label>
          <label className="catalog-page__field"><span>Start date</span>
            <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
          <label className="catalog-page__field"><span>End date</span>
            <input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
          <label className="catalog-page__upload" aria-label="Upload desktop media">Desktop<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload("desktopMedia", e.target.files[0])} /></label>
          <label className="catalog-page__upload" aria-label="Upload mobile media">Mobile<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload("mobileMedia", e.target.files[0])} /></label>
          {form.displayMode === "video" && (
            <>
              <label className="catalog-page__upload" aria-label="Upload video">Video<input type="file" accept="video/*" hidden onChange={(e) => e.target.files[0] && upload("video", e.target.files[0])} /></label>
              <label className="catalog-page__upload" aria-label="Upload poster">Poster<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload("posterImage", e.target.files[0])} /></label>
            </>
          )}
          <label className="catalog-page__check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
          <button type="button" onClick={save}>{editingId ? "Save slide" : "Add slide"}</button>
          {editingId && <button type="button" onClick={() => { setForm(empty); setEditingId(null); }}>Cancel</button>}
        </div>
      </section>

      <section class="catalog-card" className="catalog-card">
        <div className="catalog-page__add" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Slides</h2>
          <label className="catalog-page__check"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted</label>
        </div>
        <ul className="catalog-page__list">
          {slides.map((s) => (
            <li key={s.id} className="catalog-page__row">
              <span className="catalog-page__row-name">{s.title || "(untitled)"} <small>· {s.type}/{s.displayMode} · {s.status}{s.deletedAt ? " · deleted" : ""}</small></span>
              <span className="catalog-page__row-actions">
                {s.deletedAt ? (
                  <button type="button" onClick={() => act(s.id, "restore")}>Restore</button>
                ) : (
                  <>
                    <label className="catalog-page__check"><input type="checkbox" checked={!!s.active} onChange={() => toggleActive(s)} /> Active</label>
                    <button type="button" aria-label={`Move up ${s.title}`} onClick={() => move(s.id, -1)}>↑</button>
                    <button type="button" aria-label={`Move down ${s.title}`} onClick={() => move(s.id, 1)}>↓</button>
                    <button type="button" onClick={() => editSlide(s)}>Edit</button>
                    <button type="button" aria-label={`Delete ${s.title}`} onClick={() => act(s.id, "soft-delete")}>Delete</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

(Note: remove the stray `class="catalog-card"` — keep only the `className`. It is shown here so
the engineer deletes the duplicate attribute when typing.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- HeroBannerPage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/admin/content/HeroBannerPage.jsx apps/admin/src/pages/admin/content/HeroBannerPage.test.jsx
git commit -m "feat(admin): build Hero Banner editor (CRUD, status, soft-delete, preview)"
```

---

## Task 11: Hero seed script

**Files:**
- Create: `server/src/scripts/seed-hero.js`
- Modify: `server/package.json` (`seed:hero`)

- [ ] **Step 1: Write the seed script**

```js
// server/src/scripts/seed-hero.js
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../shared/config/database.js";
import HeroSlide from "../modules/hero/heroSlide.model.js";
import Collection from "../modules/catalog/collection.model.js";

/**
 * Seed a few sample published hero slides so the homepage renders immediately.
 * Idempotent: skips a slide if one with the same title already exists. Everything
 * is editable afterwards in Admin → Content → Hero Banner.
 *
 *   npm run seed:hero --workspace=server
 */
async function ensure(title, doc) {
  if (await HeroSlide.exists({ title })) return;
  await HeroSlide.create({ title, ...doc });
}

async function main() {
  await connectDatabase();
  try {
    const stem = await Collection.findOne({ name: "STEM Toys" }) || await Collection.findOne({});
    await ensure("Summer Sale", {
      type: "campaign", displayMode: "full_banner", subtitle: "Up to 50% off everything",
      ctaText: "Shop the Sale", ctaType: "customUrl", customUrl: "/sale",
      status: "published", active: true, priority: 100, sortOrder: 0,
    });
    if (stem) {
      await ensure("STEM Picks", {
        type: "collection", displayMode: "collection_grid", subtitle: "Hand-picked learning toys",
        ctaText: "Explore STEM", ctaType: "collection", collectionId: stem._id,
        status: "published", active: true, priority: 50, sortOrder: 1,
      });
    }
    await ensure("New Arrivals", {
      type: "campaign", displayMode: "split", subtitle: "Fresh toys, just landed",
      ctaText: "See what's new", ctaType: "customUrl", customUrl: "/collections/new-arrivals",
      status: "published", active: true, priority: 20, sortOrder: 2,
    });
    // eslint-disable-next-line no-console
    console.log("Hero slides seeded.");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `server/package.json`, add to `scripts` after `seed:navigation` (with a comma):

```json
    "seed:hero": "node src/scripts/seed-hero.js"
```

- [ ] **Step 3: Verify it loads cleanly**

Run: `node server/src/scripts/seed-hero.js`
Expected: fails only at `connectDatabase()` ("MONGODB_URI is not configured" when run from the
repo root) — proving the module imports cleanly. With a dev DB + `server/.env`, run
`npm run seed:hero --workspace=server` and expect "Hero slides seeded."

- [ ] **Step 4: Commit**

```bash
git add server/src/scripts/seed-hero.js server/package.json
git commit -m "feat(hero): add hero seed script"
```

---

## Task 12: Full-suite verification + final review

**Files:** none (verification only).

- [ ] **Step 1: Run each workspace suite individually** (avoid concurrent property-test timeouts)

```bash
npm test --workspace server
npm test --workspace @planet-of-toys/shared-web
npm test --workspace @planet-of-toys/admin
npm test --workspace @planet-of-toys/client
```
Expected: all green. Re-run any fast-check property file alone if it times out under load.

- [ ] **Step 2: Manual smoke (optional, dev DB)**

`npm run seed:hero --workspace=server`, then open the storefront homepage: hero autoplays every
4s, pauses on hover, arrows/dots/keys/swipe work, video slide plays muted + unmutes, the
collection_grid shows product cards, and CTAs navigate. In Admin → Content → Hero Banner, create
a draft, publish it, schedule it, soft-delete + restore, reorder — preview reflects each.

- [ ] **Step 3: Final review checklist (inline)**

Confirm: type vs displayMode decoupling (layout keys off displayMode); scheduling + priority +
Draft/Published + soft-delete/restore on all types; analytics fields present (unused); HomePage
wraps the hero as one section; shared `HeroEngineView` powers storefront + admin preview;
manual `gridProductIds` override with collection/category fallback; video muted-autoplay-loop-
playsInline + unmute; **no changes to checkout, orders, payments, shipping, WhatsApp, or auth**.

---

## Plan Self-Review

**Spec coverage:** six slide types + five displayModes (T1 enums, T6 layouts) · scheduling on all
types + priority + sortOrder + Draft/Published + soft-delete/restore + analytics fields (T1/T2) ·
admin CRUD/reorder/active/soft-delete/restore/preview (T2/T4/T10) · public visibility+ordering+
ctaHref+gridItems (T2/T3) · manual collection_grid products with fallback (T2/T10) · shared render
path (T6/T7) · HomePage wrapper + index route (T9) · video requirements (T6) · seed + migration
(T11) · routerMounts/wiring (T5). All spec sections map to tasks.

**Placeholder scan:** none. Future homepage sections are intentional placeholders (HomePage);
analytics implementation is deferred by design. The one stray-attribute note in T10 is flagged
for deletion, not a real placeholder.

**Type/name consistency:** enums (`HERO_TYPES`/`HERO_DISPLAY_MODES`/`HERO_CTA_TYPES`/
`HERO_STATUSES`) defined in T1 and used in T2; service fn names (`createSlide`, `getPublicSlides`,
`softDelete`, `restore`, `setActive`, `reorder`, `listSlides`) consistent across T2→T3→T4→T10;
public slide shape (`{id,type,displayMode,title,subtitle,ctaText,ctaHref,desktopMedia,mobileMedia,
video,posterImage,gridItems?}`) consistent across T2, the layouts (T6), the engine (T7), and the
client (T8). API paths consistent across routers (T3/T4), wiring (T5), and clients (T8/T10).

**Ordering:** model (T1) → service (T2) → controller/routers (T3/T4) → wiring (T5) → shared
layouts (T6) before the engine (T7) before the client section (T8) and HomePage (T9); admin (T10)
after the shared views; seed (T11) after the model; verification (T12) last.

