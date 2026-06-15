# Catalog Taxonomy (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the catalog taxonomy data layer (Category, Collection, Attribute, AttributeValue, NavigationItem-foundation), admin management UI with shared-component live preview, product integration (incl. bulk-assign), and a minimal `/collections/:slug` storefront proof.

**Architecture:** A new storefront-agnostic `server/src/modules/catalog/` module (model → service → controller → admin/public routers, mounted via `ROUTER_MOUNTS`), the existing `products` module extended to reference taxonomy, shared presentational `*View` components in `packages/shared-web/src/catalog/` consumed by both the admin live preview and the storefront, and admin pages under a new **Catalog** sidebar group. Archive (soft delete) everywhere; media as filename references; nothing hardcoded; no Brands.

**Tech Stack:** Node + Express + Mongoose (ESM), Vitest, mongodb-memory-server, React 18 + Vite + react-router-dom, Testing Library (jsdom), npm workspaces.

**Reference patterns to mirror exactly:**
- Model: `server/src/modules/content/promoBanner.model.js` (`toJSON` `_id`→`id`, drop `__v`).
- Service errors: `ContentValidationError` in `server/src/modules/content/content.service.js`.
- Module-level service exports + slug generation: `server/src/modules/products/product.service.js`.
- Router factory with injected `requireAuth`: `server/src/modules/content/content.admin.router.js`.
- Server router test (`app.listen(0)` + `fetch`): `server/src/modules/content/content.router.test.js`.
- Admin editor + live preview: `apps/admin/src/pages/admin/content/FooterEditor.jsx`.
- Shared View contract: `packages/shared-web/src/footer/FooterView.jsx` + `packages/shared-web/src/index.js`.
- Admin sidebar group + routes: `apps/admin/src/components/AdminLayout.jsx`, `apps/admin/src/App.jsx`.
- Storefront route + data fetch: `apps/client/src/App.jsx`, `apps/client/src/components/Footer.jsx`.

**Conventions for every task:** run server tests with `npm test --workspace server -- <file>`; admin tests with `npm test --workspace @planet-of-toys/admin -- <file>`; client tests with `npm test --workspace @planet-of-toys/client -- <file>`; shared-web with `npm test --workspace @planet-of-toys/shared-web -- <file>`. (If a workspace name differs, use the package `name` from its `package.json`.) Commit after each task with the message shown. Never `git add -A`; add only the listed files.

---

## File Structure

**Server — new `server/src/modules/catalog/`:**
- `category.model.js` — Category schema (tree, content fields, archive).
- `collection.model.js` — Collection schema (mode, merchandising/nav flags, content fields, archive).
- `attribute.model.js` — Attribute schema (displayType, isFilterable, archive).
- `attributeValue.model.js` — AttributeValue schema (attributeId, swatchHex, compound unique index, archive).
- `navigationItem.model.js` — NavigationItem schema (foundation only).
- `catalog.errors.js` — `CatalogValidationError`.
- `catalog.slug.js` — `slugify`, `uniqueSlug` helpers.
- `category.service.js`, `collection.service.js`, `attribute.service.js`, `navigation.service.js` — module-level CRUD/tree/reorder/archive functions.
- `productAssign.service.js` — bulk-assign (`updateMany` + `$addToSet`/`$pull`).
- `catalog.controller.js` — thin HTTP layer over the services.
- `catalog.admin.router.js`, `catalog.public.router.js` — router factories.
- `*.test.js` beside each.

**Server — modified:**
- `server/src/shared/constants/routerMounts.js` — add `catalogAdmin`, `catalog`.
- `server/src/index.js` — wire the two routers.
- `server/src/models/index.js` — re-export new models.
- `server/src/modules/products/product.model.js` — add `categoryIds`, `collectionIds`, `attributeValueIds`.
- `server/src/modules/products/product.service.js` — include new fields in `WRITABLE_FIELDS` + `PUBLIC_FIELDS`.
- `server/package.json` — add `seed:catalog` script.
- `server/src/scripts/seed-catalog.js` — seed sample taxonomy.

**Shared — new `packages/shared-web/src/catalog/`:**
- `CategoryView.jsx`, `CollectionView.jsx`, `AttributeFilterView.jsx`, `index.js` (+ tests).
- `packages/shared-web/src/index.js` — re-export the three views.
- `packages/shared-web/package.json` — add `./catalog` export.

**Admin — new under `apps/admin/src/pages/admin/catalog/`:**
- `DevicePreview.jsx` (+ `.css`) — desktop+mobile frame wrapper (admin-only chrome).
- `CategoriesPage.jsx`, `CollectionsPage.jsx`, `AttributesPage.jsx` (+ `.css`, + tests).
- `apps/admin/src/components/AdminLayout.jsx` — add Catalog nav group + `IconCatalog`.
- `apps/admin/src/App.jsx` — add `/admin/catalog/*` routes.
- `apps/admin/src/pages/admin/ProductsPage.jsx` — add taxonomy assignment UI.

**Client — modified/new:**
- `apps/client/src/pages/CollectionPage.jsx` (+ `.css`, + test) — `/collections/:slug` proof.
- `apps/client/src/App.jsx` — add the route.

---

## Task 1: Category model

**Files:**
- Create: `server/src/modules/catalog/category.model.js`
- Test: `server/src/modules/catalog/category.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/category.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); });

describe("Category model", () => {
  it("applies defaults and maps _id to id in toJSON", async () => {
    const doc = await Category.create({ name: "Educational Toys", slug: "educational-toys" });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.parentId).toBeNull();
    expect(json.isActive).toBe(true);
    expect(json.sortOrder).toBe(0);
    expect(json.deletedAt).toBeNull();
    expect(json.image).toBeNull();
    expect(json.heroImage).toBeNull();
  });

  it("enforces a unique slug", async () => {
    await Category.syncIndexes();
    await Category.create({ name: "A", slug: "dup" });
    await expect(Category.create({ name: "B", slug: "dup" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- category.model.test.js`
Expected: FAIL — cannot resolve `./category.model.js`.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/catalog/category.model.js
import mongoose from "mongoose";

/**
 * Category model — product organization as a self-referential tree (unlimited
 * depth via `parentId`). Carries card/hero media references (filenames served
 * from /api/media) and long-form content fields that later sub-projects (landing
 * pages) build on. Soft-deleted via `deletedAt` (archive/restore); archived rows
 * are excluded from public reads by the service. `toJSON` maps `_id`->`id`.
 */
const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    image: { type: String, default: null },
    heroTitle: { type: String, default: "" },
    heroSubtitle: { type: String, default: "" },
    heroImage: { type: String, default: null },
    seoContent: { type: String, default: "" },
    description: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
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

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
export default Category;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- category.model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/category.model.js server/src/modules/catalog/category.model.test.js
git commit -m "feat(catalog): add Category model"
```

---

## Task 2: Collection model

**Files:**
- Create: `server/src/modules/catalog/collection.model.js`
- Test: `server/src/modules/catalog/collection.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/collection.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Collection from "./collection.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Collection.deleteMany({}); });

describe("Collection model", () => {
  it("applies defaults incl. mode=manual and merchandising flags", async () => {
    const json = (await Collection.create({ name: "STEM Toys", slug: "stem-toys" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.mode).toBe("manual");
    expect(json.featuredOnHome).toBe(false);
    expect(json.showInNavigation).toBe(false);
    expect(json.navigationLabel).toBe("");
    expect(json.navigationOrder).toBe(0);
    expect(json.isActive).toBe(true);
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid mode", async () => {
    await expect(Collection.create({ name: "X", slug: "x", mode: "bogus" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- collection.model.test.js`
Expected: FAIL — cannot resolve `./collection.model.js`.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/catalog/collection.model.js
import mongoose from "mongoose";

/**
 * Collection model — dynamic product groups (New Arrivals, STEM Toys, 0-12
 * Months …). `mode` reserves manual/rules/hybrid membership (rule evaluation is
 * Sub-project B). Merchandising/navigation flags and content fields are
 * foundation for later sub-projects. Archived via `deletedAt`. `toJSON` maps
 * `_id`->`id`.
 */
const { Schema } = mongoose;

const collectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, default: "" },
    mode: { type: String, enum: ["manual", "rules", "hybrid"], default: "manual" },
    featuredOnHome: { type: Boolean, default: false },
    showInNavigation: { type: Boolean, default: false },
    navigationLabel: { type: String, default: "" },
    navigationOrder: { type: Number, default: 0 },
    heroTitle: { type: String, default: "" },
    heroSubtitle: { type: String, default: "" },
    heroImage: { type: String, default: null },
    seoContent: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
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

const Collection = mongoose.models.Collection || mongoose.model("Collection", collectionSchema);
export default Collection;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- collection.model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/collection.model.js server/src/modules/catalog/collection.model.test.js
git commit -m "feat(catalog): add Collection model"
```

---

## Task 3: Attribute model

**Files:**
- Create: `server/src/modules/catalog/attribute.model.js`
- Test: `server/src/modules/catalog/attribute.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/attribute.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); });

describe("Attribute model", () => {
  it("defaults displayType usable and flags set", async () => {
    const json = (await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json.isFilterable).toBe(true);
    expect(json.isActive).toBe(true);
    expect(json.sortOrder).toBe(0);
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid displayType", async () => {
    await expect(Attribute.create({ name: "X", slug: "x", displayType: "bogus" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- attribute.model.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/catalog/attribute.model.js
import mongoose from "mongoose";

/**
 * Attribute model — powers the dynamic filter system (Age Group, Skill, Theme …).
 * `displayType` selects the storefront control; `isFilterable` gates exposure to
 * the public filter list. Values live in the AttributeValue model. Archived via
 * `deletedAt`. `toJSON` maps `_id`->`id`.
 */
const { Schema } = mongoose;

export const DISPLAY_TYPES = Object.freeze(["checkbox", "radio", "dropdown", "color", "button", "range"]);

const attributeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    displayType: { type: String, enum: DISPLAY_TYPES, required: true },
    sortOrder: { type: Number, default: 0 },
    isFilterable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
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

const Attribute = mongoose.models.Attribute || mongoose.model("Attribute", attributeSchema);
export default Attribute;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- attribute.model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/attribute.model.js server/src/modules/catalog/attribute.model.test.js
git commit -m "feat(catalog): add Attribute model"
```

---

## Task 4: AttributeValue model

**Files:**
- Create: `server/src/modules/catalog/attributeValue.model.js`
- Test: `server/src/modules/catalog/attributeValue.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/attributeValue.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import AttributeValue from "./attributeValue.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await AttributeValue.deleteMany({}); });

describe("AttributeValue model", () => {
  it("requires attributeId and applies defaults", async () => {
    const attributeId = new mongoose.Types.ObjectId();
    const json = (await AttributeValue.create({ attributeId, name: "0-12 Months", slug: "0-12-months" })).toJSON();
    expect(json.id).toBeDefined();
    expect(String(json.attributeId)).toBe(String(attributeId));
    expect(json.swatchHex).toBeNull();
    expect(json.isActive).toBe(true);
    expect(json.deletedAt).toBeNull();
  });

  it("enforces unique (attributeId, slug) but allows same slug under different attributes", async () => {
    await AttributeValue.syncIndexes();
    const a1 = new mongoose.Types.ObjectId();
    const a2 = new mongoose.Types.ObjectId();
    await AttributeValue.create({ attributeId: a1, name: "Red", slug: "red" });
    await expect(AttributeValue.create({ attributeId: a1, name: "Red", slug: "red" })).rejects.toThrow();
    await expect(AttributeValue.create({ attributeId: a2, name: "Red", slug: "red" })).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- attributeValue.model.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/catalog/attributeValue.model.js
import mongoose from "mongoose";

/**
 * AttributeValue model — an individual option under an Attribute (e.g. "0-12
 * Months" under "Age Group"). `swatchHex` is only meaningful when the parent
 * Attribute's displayType is "color". Unique per (attributeId, slug) so the same
 * slug may exist under different attributes. Archived via `deletedAt`.
 */
const { Schema } = mongoose;

const attributeValueSchema = new Schema(
  {
    attributeId: { type: Schema.Types.ObjectId, ref: "Attribute", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    swatchHex: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
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

attributeValueSchema.index({ attributeId: 1, slug: 1 }, { unique: true });

const AttributeValue =
  mongoose.models.AttributeValue || mongoose.model("AttributeValue", attributeValueSchema);
export default AttributeValue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- attributeValue.model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/attributeValue.model.js server/src/modules/catalog/attributeValue.model.test.js
git commit -m "feat(catalog): add AttributeValue model"
```

---

## Task 5: NavigationItem model (foundation)

**Files:**
- Create: `server/src/modules/catalog/navigationItem.model.js`
- Test: `server/src/modules/catalog/navigationItem.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/navigationItem.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NavigationItem from "./navigationItem.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); });

describe("NavigationItem model", () => {
  it("applies defaults and maps id", async () => {
    const json = (await NavigationItem.create({ label: "New Arrivals", targetType: "collection" })).toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.menu).toBe("header");
    expect(json.url).toBe("");
    expect(json.openInNewTab).toBe(false);
    expect(json.isActive).toBe(true);
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid targetType", async () => {
    await expect(NavigationItem.create({ label: "X", targetType: "bogus" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- navigationItem.model.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/catalog/navigationItem.model.js
import mongoose from "mongoose";

/**
 * NavigationItem model — FOUNDATION ONLY for Sub-project A (no admin UI or
 * storefront rendering yet; those are Sub-project C). A menu entry can point at a
 * Category, a Collection, an internal route, or an external URL. `parentId`
 * reserves nested menus. Archived via `deletedAt`.
 */
const { Schema } = mongoose;

export const NAV_TARGET_TYPES = Object.freeze(["category", "collection", "internalRoute", "externalUrl"]);
export const NAV_MENUS = Object.freeze(["header", "mobile", "footer", "promo"]);

const navigationItemSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    targetType: { type: String, enum: NAV_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    url: { type: String, default: "" },
    menu: { type: String, enum: NAV_MENUS, default: "header" },
    parentId: { type: Schema.Types.ObjectId, ref: "NavigationItem", default: null },
    sortOrder: { type: Number, default: 0 },
    openInNewTab: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
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

const NavigationItem =
  mongoose.models.NavigationItem || mongoose.model("NavigationItem", navigationItemSchema);
export default NavigationItem;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- navigationItem.model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/navigationItem.model.js server/src/modules/catalog/navigationItem.model.test.js
git commit -m "feat(catalog): add NavigationItem model (foundation)"
```

---

## Task 6: Catalog shared helpers (errors + slug)

**Files:**
- Create: `server/src/modules/catalog/catalog.errors.js`
- Create: `server/src/modules/catalog/catalog.slug.js`
- Test: `server/src/modules/catalog/catalog.slug.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.slug.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); });

describe("slugify", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("Éducational Toys! 0-12")).toBe("educational-toys-0-12");
  });
  it("falls back to 'item' for empty input", () => {
    expect(slugify("!!!")).toBe("item");
  });
});

describe("uniqueSlug", () => {
  it("appends -2, -3 on collision within the model", async () => {
    await Category.create({ name: "Toys", slug: "toys" });
    expect(await uniqueSlug(Category, "toys")).toBe("toys-2");
    await Category.create({ name: "Toys2", slug: "toys-2" });
    expect(await uniqueSlug(Category, "toys")).toBe("toys-3");
  });
  it("ignores the excluded id (so updates keep their slug)", async () => {
    const c = await Category.create({ name: "Toys", slug: "toys" });
    expect(await uniqueSlug(Category, "toys", c._id)).toBe("toys");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.slug.test.js`
Expected: FAIL — cannot resolve `./catalog.slug.js`.

- [ ] **Step 3: Write the helpers**

```js
// server/src/modules/catalog/catalog.errors.js
/** Operational 400-class validation error with a client-safe message. */
export class CatalogValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "CatalogValidationError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.clientMessage = message;
  }
}

export default CatalogValidationError;
```

```js
// server/src/modules/catalog/catalog.slug.js

/**
 * Convert arbitrary text to a URL-safe slug: lowercase ASCII words joined by
 * single hyphens, diacritics stripped. Falls back to "item" when nothing remains.
 */
export function slugify(value) {
  const base = String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return base || "item";
}

/**
 * Return a slug unique within `Model`, appending -2, -3, … on collision. An
 * optional `excludeId` lets a record keep its own slug during updates. Only
 * non-archived rows are considered (archived slugs may be reused).
 *
 * @param {import("mongoose").Model} Model
 * @param {string} base already-slugified candidate
 * @param {import("mongoose").Types.ObjectId|string|null} [excludeId]
 * @param {object} [extraQuery] additional uniqueness scope (e.g. { attributeId })
 */
export async function uniqueSlug(Model, base, excludeId = null, extraQuery = {}) {
  let candidate = base;
  let n = 1;
  /* eslint-disable no-await-in-loop */
  while (true) {
    const query = { slug: candidate, deletedAt: null, ...extraQuery };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Model.exists(query);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  /* eslint-enable no-await-in-loop */
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.slug.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/catalog.errors.js server/src/modules/catalog/catalog.slug.js server/src/modules/catalog/catalog.slug.test.js
git commit -m "feat(catalog): add slug + error helpers"
```

---

## Task 7: Extend Product model + registry with taxonomy references

This must precede the services, whose archive-guard tests create Products carrying
`categoryIds` / `collectionIds` / `attributeValueIds`. Mongoose strict mode silently
drops fields absent from the schema, so the fields must exist first. This task also
registers the five new catalog models in `server/src/models/index.js` so service tests can
import `Product` (and later code can populate by name).

**Files:**
- Modify: `server/src/modules/products/product.model.js`
- Modify: `server/src/models/index.js`
- Test: `server/src/modules/products/product.taxonomy.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/products/product.taxonomy.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Product from "./product.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("Product taxonomy references", () => {
  it("defaults the three reference arrays to empty", async () => {
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1 })).toJSON();
    expect(json.categoryIds).toEqual([]);
    expect(json.collectionIds).toEqual([]);
    expect(json.attributeValueIds).toEqual([]);
  });

  it("persists provided reference ids", async () => {
    const cid = new mongoose.Types.ObjectId();
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1, categoryIds: [cid] })).toJSON();
    expect(String(json.categoryIds[0])).toBe(String(cid));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- product.taxonomy.test.js`
Expected: FAIL — `categoryIds` is `undefined` (field dropped by strict mode).

- [ ] **Step 3: Add the fields to the schema**

In `server/src/modules/products/product.model.js`, add these three fields to
`productSchema` immediately after the existing `active: { ... },` line:

```js
    // Catalog taxonomy references (Sub-project A). Flat id arrays; attribute
    // grouping is derived via AttributeValue.attributeId. Indexed for filter
    // queries (Sub-project B).
    categoryIds: { type: [{ type: Schema.Types.ObjectId, ref: "Category" }], default: [], index: true },
    collectionIds: { type: [{ type: Schema.Types.ObjectId, ref: "Collection" }], default: [], index: true },
    attributeValueIds: { type: [{ type: Schema.Types.ObjectId, ref: "AttributeValue" }], default: [], index: true },
```

- [ ] **Step 4: Register the catalog models in the registry**

Append to `server/src/models/index.js`:

```js
export { default as Category } from "../modules/catalog/category.model.js";
export { default as Collection } from "../modules/catalog/collection.model.js";
export { default as Attribute, DISPLAY_TYPES } from "../modules/catalog/attribute.model.js";
export { default as AttributeValue } from "../modules/catalog/attributeValue.model.js";
export { default as NavigationItem, NAV_TARGET_TYPES, NAV_MENUS } from "../modules/catalog/navigationItem.model.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- product.taxonomy.test.js`
Expected: PASS (2 tests). Also run `npm test --workspace server -- product.model` and confirm no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/products/product.model.js server/src/models/index.js server/src/modules/products/product.taxonomy.test.js
git commit -m "feat(products): add category/collection/attribute-value references"
```

---

## Task 8: Category service (CRUD, tree, reorder, archive/restore, guards)

**Files:**
- Create: `server/src/modules/catalog/category.service.js`
- Test: `server/src/modules/catalog/category.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/category.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import * as svc from "./category.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); await Product.deleteMany({}); });

describe("category.service", () => {
  it("creates with a generated unique slug", async () => {
    const a = await svc.createCategory({ name: "Educational Toys" });
    expect(a.slug).toBe("educational-toys");
    const b = await svc.createCategory({ name: "Educational Toys" });
    expect(b.slug).toBe("educational-toys-2");
  });

  it("builds an active tree (children nested, archived excluded)", async () => {
    const parent = await svc.createCategory({ name: "Toys" });
    await svc.createCategory({ name: "Blocks", parentId: parent.id });
    const archived = await svc.createCategory({ name: "Old" });
    await svc.archiveCategory(archived.id);
    const tree = await svc.listCategoryTree({ includeArchived: false });
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Toys");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("Blocks");
  });

  it("refuses to archive a category that has children", async () => {
    const parent = await svc.createCategory({ name: "Toys" });
    await svc.createCategory({ name: "Blocks", parentId: parent.id });
    await expect(svc.archiveCategory(parent.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("refuses to archive a category assigned to a product", async () => {
    const c = await svc.createCategory({ name: "Toys" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, categoryIds: [c.id] });
    await expect(svc.archiveCategory(c.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("archives then restores a leaf category", async () => {
    const c = await svc.createCategory({ name: "Toys" });
    await svc.archiveCategory(c.id);
    expect((await svc.listCategoryTree({ includeArchived: false }))).toHaveLength(0);
    await svc.restoreCategory(c.id);
    expect((await svc.listCategoryTree({ includeArchived: false }))).toHaveLength(1);
  });

  it("reorders and reparents", async () => {
    const a = await svc.createCategory({ name: "A" });
    const b = await svc.createCategory({ name: "B" });
    await svc.reorderCategories([
      { id: b.id, parentId: null, sortOrder: 0 },
      { id: a.id, parentId: b.id, sortOrder: 0 },
    ]);
    const tree = await svc.listCategoryTree({ includeArchived: false });
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("B");
    expect(tree[0].children[0].name).toBe("A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- category.service.test.js`
Expected: FAIL — cannot resolve `./category.service.js`.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/category.service.js
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

/** Fields an admin may set on a category. slug is derived from name. */
const WRITABLE = [
  "name", "parentId", "image", "heroTitle", "heroSubtitle", "heroImage",
  "seoContent", "description", "sortOrder", "isActive", "seoTitle", "seoDescription",
];

/** Pick only writable keys that are present on the input. */
function pickWritable(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function requireName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new CatalogValidationError("Category name is required.");
  }
  return name.trim();
}

/** Assemble a nested tree (children[]) from a flat, sorted list of plain docs. */
export function buildTree(docs) {
  const byId = new Map();
  const roots = [];
  for (const d of docs) byId.set(String(d.id), { ...d, children: [] });
  for (const node of byId.values()) {
    const pid = node.parentId ? String(node.parentId) : null;
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  }
  const sortRec = (list) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Full tree. Active-only by default; pass includeArchived to include deletedAt rows. */
export async function listCategoryTree({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const docs = (await Category.find(query)).map((d) => d.toJSON());
  return buildTree(docs);
}

export async function getCategoryById(id) {
  const doc = await Category.findById(id);
  return doc ? doc.toJSON() : null;
}

/** Public read by slug — active and not archived only. */
export async function getCategoryBySlug(slug) {
  const doc = await Category.findOne({ slug, isActive: true, deletedAt: null });
  return doc ? doc.toJSON() : null;
}

export async function createCategory(input = {}) {
  const name = requireName(input.name);
  const data = pickWritable(input);
  data.name = name;
  data.slug = await uniqueSlug(Category, slugify(input.slug || name));
  const doc = await Category.create(data);
  return doc.toJSON();
}

export async function updateCategory(id, input = {}) {
  const doc = await Category.findById(id);
  if (!doc) throw new CatalogValidationError("Category not found.", 404);
  const data = pickWritable(input);
  if (data.name !== undefined) data.name = requireName(data.name);
  if (input.slug !== undefined || data.name !== undefined) {
    const base = slugify(input.slug || data.name || doc.name);
    data.slug = await uniqueSlug(Category, base, doc._id);
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveCategory(id) {
  const doc = await Category.findById(id);
  if (!doc) throw new CatalogValidationError("Category not found.", 404);
  const childCount = await Category.countDocuments({ parentId: id, deletedAt: null });
  if (childCount > 0) {
    throw new CatalogValidationError("Reassign or archive child categories first.");
  }
  const productCount = await Product.countDocuments({ categoryIds: id });
  if (productCount > 0) {
    throw new CatalogValidationError("Remove this category from its products before archiving.");
  }
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreCategory(id) {
  const doc = await Category.findById(id);
  if (!doc) throw new CatalogValidationError("Category not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

/** Apply [{ id, parentId, sortOrder }] in one pass. */
export async function reorderCategories(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(
    items.map((it) =>
      Category.updateOne(
        { _id: it.id },
        { $set: { parentId: it.parentId ?? null, sortOrder: Number(it.sortOrder) || 0 } }
      )
    )
  );
  return listCategoryTree({ includeArchived: false });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- category.service.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/category.service.js server/src/modules/catalog/category.service.test.js
git commit -m "feat(catalog): add category service"
```

---

## Task 9: Collection service (CRUD, reorder, archive/restore)

**Files:**
- Create: `server/src/modules/catalog/collection.service.js`
- Test: `server/src/modules/catalog/collection.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/collection.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Collection from "./collection.model.js";
import { Product } from "../../models/index.js";
import * as svc from "./collection.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Collection.deleteMany({}); await Product.deleteMany({}); });

describe("collection.service", () => {
  it("creates with generated slug and validates mode", async () => {
    const c = await svc.createCollection({ name: "New Arrivals" });
    expect(c.slug).toBe("new-arrivals");
    expect(c.mode).toBe("manual");
    await expect(svc.createCollection({ name: "X", mode: "bogus" })).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("lists active sorted, excludes archived by default", async () => {
    await svc.createCollection({ name: "B", sortOrder: 2 });
    await svc.createCollection({ name: "A", sortOrder: 1 });
    const arch = await svc.createCollection({ name: "Z" });
    await svc.archiveCollection(arch.id);
    const list = await svc.listCollections({ includeArchived: false });
    expect(list.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("refuses to archive a collection assigned to a product", async () => {
    const c = await svc.createCollection({ name: "Sale" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, collectionIds: [c.id] });
    await expect(svc.archiveCollection(c.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("returns a public collection by slug or null when archived/inactive", async () => {
    const c = await svc.createCollection({ name: "STEM" });
    expect((await svc.getPublicCollectionBySlug("stem")).name).toBe("STEM");
    await svc.archiveCollection(c.id);
    expect(await svc.getPublicCollectionBySlug("stem")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- collection.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/collection.service.js
import Collection from "./collection.model.js";
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

const MODES = ["manual", "rules", "hybrid"];
const WRITABLE = [
  "name", "description", "mode", "featuredOnHome", "showInNavigation",
  "navigationLabel", "navigationOrder", "heroTitle", "heroSubtitle", "heroImage",
  "seoContent", "sortOrder", "isActive", "seoTitle", "seoDescription",
];

function pickWritable(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validate(data) {
  if (data.mode !== undefined && !MODES.includes(data.mode)) {
    throw new CatalogValidationError("Collection mode must be manual, rules, or hybrid.");
  }
}

export async function listCollections({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const docs = await Collection.find(query).sort({ sortOrder: 1, name: 1 });
  return docs.map((d) => d.toJSON());
}

export async function getCollectionById(id) {
  const doc = await Collection.findById(id);
  return doc ? doc.toJSON() : null;
}

/** Public read by slug — active, not archived. */
export async function getPublicCollectionBySlug(slug) {
  const doc = await Collection.findOne({ slug, isActive: true, deletedAt: null });
  return doc ? doc.toJSON() : null;
}

export async function createCollection(input = {}) {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new CatalogValidationError("Collection name is required.");
  }
  const data = pickWritable(input);
  validate(data);
  data.name = input.name.trim();
  data.slug = await uniqueSlug(Collection, slugify(input.slug || data.name));
  const doc = await Collection.create(data);
  return doc.toJSON();
}

export async function updateCollection(id, input = {}) {
  const doc = await Collection.findById(id);
  if (!doc) throw new CatalogValidationError("Collection not found.", 404);
  const data = pickWritable(input);
  validate(data);
  if (data.name !== undefined) {
    if (data.name.trim() === "") throw new CatalogValidationError("Collection name is required.");
    data.name = data.name.trim();
  }
  if (input.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(Collection, slugify(input.slug || data.name || doc.name), doc._id);
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveCollection(id) {
  const doc = await Collection.findById(id);
  if (!doc) throw new CatalogValidationError("Collection not found.", 404);
  const productCount = await Product.countDocuments({ collectionIds: id });
  if (productCount > 0) {
    throw new CatalogValidationError("Remove this collection from its products before archiving.");
  }
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreCollection(id) {
  const doc = await Collection.findById(id);
  if (!doc) throw new CatalogValidationError("Collection not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorderCollections(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(
    items.map((it) => Collection.updateOne({ _id: it.id }, { $set: { sortOrder: Number(it.sortOrder) || 0 } }))
  );
  return listCollections({ includeArchived: false });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- collection.service.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/collection.service.js server/src/modules/catalog/collection.service.test.js
git commit -m "feat(catalog): add collection service"
```

---

## Task 10: Attribute service with inline values

**Files:**
- Create: `server/src/modules/catalog/attribute.service.js`
- Test: `server/src/modules/catalog/attribute.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/attribute.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import * as svc from "./attribute.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

describe("attribute.service", () => {
  it("creates an attribute and lists it with its (empty) values", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    expect(a.slug).toBe("age-group");
    const list = await svc.listAttributes({ includeArchived: false });
    expect(list).toHaveLength(1);
    expect(list[0].values).toEqual([]);
  });

  it("rejects an invalid displayType", async () => {
    await expect(svc.createAttribute({ name: "X", displayType: "bogus" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("adds values (unique slug per attribute) and nests them in listAttributes", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    await svc.addValue(a.id, { name: "0-12 Months" });
    await svc.addValue(a.id, { name: "0-12 Months" });
    const list = await svc.listAttributes({ includeArchived: false });
    expect(list[0].values.map((v) => v.slug)).toEqual(["0-12-months", "0-12-months-2"]);
  });

  it("refuses to archive a value assigned to a product", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    const v = await svc.addValue(a.id, { name: "0-12 Months" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, attributeValueIds: [v.id] });
    await expect(svc.archiveValue(v.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("archives/restores an attribute and excludes archived from default list", async () => {
    const a = await svc.createAttribute({ name: "Theme", displayType: "checkbox" });
    await svc.archiveAttribute(a.id);
    expect(await svc.listAttributes({ includeArchived: false })).toHaveLength(0);
    await svc.restoreAttribute(a.id);
    expect(await svc.listAttributes({ includeArchived: false })).toHaveLength(1);
  });

  it("lists only filterable+active attributes (with active values) for public", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    await svc.addValue(a.id, { name: "0-12 Months" });
    const hidden = await svc.createAttribute({ name: "Internal", displayType: "checkbox", isFilterable: false });
    await svc.addValue(hidden.id, { name: "x" });
    const pub = await svc.listPublicAttributes();
    expect(pub).toHaveLength(1);
    expect(pub[0].name).toBe("Age Group");
    expect(pub[0].values).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- attribute.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/attribute.service.js
import Attribute, { DISPLAY_TYPES } from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";
import { slugify, uniqueSlug } from "./catalog.slug.js";

const ATTR_WRITABLE = ["name", "displayType", "sortOrder", "isFilterable", "isActive"];
const VALUE_WRITABLE = ["name", "swatchHex", "sortOrder", "isActive"];

function pick(keys, input) {
  const out = {};
  for (const k of keys) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validateDisplayType(displayType) {
  if (!DISPLAY_TYPES.includes(displayType)) {
    throw new CatalogValidationError(`displayType must be one of: ${DISPLAY_TYPES.join(", ")}.`);
  }
}

/** Attach each attribute's values (sorted). */
async function withValues(attrDocs, { includeArchived }) {
  const ids = attrDocs.map((a) => a._id);
  const valueQuery = includeArchived
    ? { attributeId: { $in: ids } }
    : { attributeId: { $in: ids }, deletedAt: null };
  const values = await AttributeValue.find(valueQuery).sort({ sortOrder: 1, name: 1 });
  const byAttr = new Map();
  for (const v of values) {
    const key = String(v.attributeId);
    if (!byAttr.has(key)) byAttr.set(key, []);
    byAttr.get(key).push(v.toJSON());
  }
  return attrDocs.map((a) => ({ ...a.toJSON(), values: byAttr.get(String(a._id)) || [] }));
}

export async function listAttributes({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const attrs = await Attribute.find(query).sort({ sortOrder: 1, name: 1 });
  return withValues(attrs, { includeArchived });
}

export async function listPublicAttributes() {
  const attrs = await Attribute.find({ isFilterable: true, isActive: true, deletedAt: null })
    .sort({ sortOrder: 1, name: 1 });
  const full = await withValues(attrs, { includeArchived: false });
  // Public values must also be active.
  return full.map((a) => ({ ...a, values: a.values.filter((v) => v.isActive) }));
}

export async function getAttributeById(id) {
  const doc = await Attribute.findById(id);
  if (!doc) return null;
  const [withVals] = await withValues([doc], { includeArchived: true });
  return withVals;
}

export async function createAttribute(input = {}) {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new CatalogValidationError("Attribute name is required.");
  }
  validateDisplayType(input.displayType);
  const data = pick(ATTR_WRITABLE, input);
  data.name = input.name.trim();
  data.slug = await uniqueSlug(Attribute, slugify(input.slug || data.name));
  const doc = await Attribute.create(data);
  return { ...doc.toJSON(), values: [] };
}

export async function updateAttribute(id, input = {}) {
  const doc = await Attribute.findById(id);
  if (!doc) throw new CatalogValidationError("Attribute not found.", 404);
  const data = pick(ATTR_WRITABLE, input);
  if (data.displayType !== undefined) validateDisplayType(data.displayType);
  if (data.name !== undefined) {
    if (data.name.trim() === "") throw new CatalogValidationError("Attribute name is required.");
    data.name = data.name.trim();
  }
  if (input.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(Attribute, slugify(input.slug || data.name || doc.name), doc._id);
  }
  Object.assign(doc, data);
  await doc.save();
  return getAttributeById(id);
}

export async function archiveAttribute(id) {
  const doc = await Attribute.findById(id);
  if (!doc) throw new CatalogValidationError("Attribute not found.", 404);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreAttribute(id) {
  const doc = await Attribute.findById(id);
  if (!doc) throw new CatalogValidationError("Attribute not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorderAttributes(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(items.map((it) => Attribute.updateOne({ _id: it.id }, { $set: { sortOrder: Number(it.sortOrder) || 0 } })));
  return listAttributes({ includeArchived: false });
}

// ----- inline values -----

export async function addValue(attributeId, input = {}) {
  const attr = await Attribute.findById(attributeId);
  if (!attr) throw new CatalogValidationError("Attribute not found.", 404);
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new CatalogValidationError("Value name is required.");
  }
  const data = pick(VALUE_WRITABLE, input);
  data.attributeId = attributeId;
  data.name = input.name.trim();
  data.slug = await uniqueSlug(AttributeValue, slugify(input.slug || data.name), null, { attributeId });
  const doc = await AttributeValue.create(data);
  return doc.toJSON();
}

export async function updateValue(id, input = {}) {
  const doc = await AttributeValue.findById(id);
  if (!doc) throw new CatalogValidationError("Value not found.", 404);
  const data = pick(VALUE_WRITABLE, input);
  if (data.name !== undefined) {
    if (data.name.trim() === "") throw new CatalogValidationError("Value name is required.");
    data.name = data.name.trim();
  }
  if (input.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(
      AttributeValue, slugify(input.slug || data.name || doc.name), doc._id, { attributeId: doc.attributeId }
    );
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveValue(id) {
  const doc = await AttributeValue.findById(id);
  if (!doc) throw new CatalogValidationError("Value not found.", 404);
  const productCount = await Product.countDocuments({ attributeValueIds: id });
  if (productCount > 0) {
    throw new CatalogValidationError("Remove this value from its products before archiving.");
  }
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreValue(id) {
  const doc = await AttributeValue.findById(id);
  if (!doc) throw new CatalogValidationError("Value not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}

export async function reorderValues(attributeId, items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(
    items.map((it) => AttributeValue.updateOne(
      { _id: it.id, attributeId }, { $set: { sortOrder: Number(it.sortOrder) || 0 } }
    ))
  );
  return getAttributeById(attributeId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- attribute.service.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/attribute.service.js server/src/modules/catalog/attribute.service.test.js
git commit -m "feat(catalog): add attribute service with inline values"
```

---

## Task 11: Navigation service (foundation CRUD)

**Files:**
- Create: `server/src/modules/catalog/navigation.service.js`
- Test: `server/src/modules/catalog/navigation.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/navigation.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NavigationItem from "./navigationItem.model.js";
import * as svc from "./navigation.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); });

describe("navigation.service (foundation)", () => {
  it("creates a nav item and lists active sorted", async () => {
    await svc.createNavigationItem({ label: "B", targetType: "collection", sortOrder: 2 });
    await svc.createNavigationItem({ label: "A", targetType: "category", sortOrder: 1 });
    const list = await svc.listNavigationItems({ includeArchived: false });
    expect(list.map((n) => n.label)).toEqual(["A", "B"]);
  });

  it("validates targetType", async () => {
    await expect(svc.createNavigationItem({ label: "X", targetType: "bogus" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("archives and restores", async () => {
    const n = await svc.createNavigationItem({ label: "Sale", targetType: "internalRoute", url: "/sale" });
    await svc.archiveNavigationItem(n.id);
    expect(await svc.listNavigationItems({ includeArchived: false })).toHaveLength(0);
    await svc.restoreNavigationItem(n.id);
    expect(await svc.listNavigationItems({ includeArchived: false })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- navigation.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/navigation.service.js
import NavigationItem, { NAV_TARGET_TYPES, NAV_MENUS } from "./navigationItem.model.js";
import { CatalogValidationError } from "./catalog.errors.js";

const WRITABLE = ["label", "targetType", "targetId", "url", "menu", "parentId", "sortOrder", "openInNewTab", "isActive"];

function pick(input) {
  const out = {};
  for (const k of WRITABLE) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function validate(data) {
  if (data.targetType !== undefined && !NAV_TARGET_TYPES.includes(data.targetType)) {
    throw new CatalogValidationError(`targetType must be one of: ${NAV_TARGET_TYPES.join(", ")}.`);
  }
  if (data.menu !== undefined && !NAV_MENUS.includes(data.menu)) {
    throw new CatalogValidationError(`menu must be one of: ${NAV_MENUS.join(", ")}.`);
  }
}

export async function listNavigationItems({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  const docs = await NavigationItem.find(query).sort({ sortOrder: 1, label: 1 });
  return docs.map((d) => d.toJSON());
}

export async function createNavigationItem(input = {}) {
  if (typeof input.label !== "string" || input.label.trim() === "") {
    throw new CatalogValidationError("Navigation label is required.");
  }
  const data = pick(input);
  validate(data);
  data.label = input.label.trim();
  const doc = await NavigationItem.create(data);
  return doc.toJSON();
}

export async function updateNavigationItem(id, input = {}) {
  const doc = await NavigationItem.findById(id);
  if (!doc) throw new CatalogValidationError("Navigation item not found.", 404);
  const data = pick(input);
  validate(data);
  if (data.label !== undefined) {
    if (data.label.trim() === "") throw new CatalogValidationError("Navigation label is required.");
    data.label = data.label.trim();
  }
  Object.assign(doc, data);
  await doc.save();
  return doc.toJSON();
}

export async function archiveNavigationItem(id) {
  const doc = await NavigationItem.findById(id);
  if (!doc) throw new CatalogValidationError("Navigation item not found.", 404);
  doc.deletedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function restoreNavigationItem(id) {
  const doc = await NavigationItem.findById(id);
  if (!doc) throw new CatalogValidationError("Navigation item not found.", 404);
  doc.deletedAt = null;
  await doc.save();
  return doc.toJSON();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- navigation.service.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/navigation.service.js server/src/modules/catalog/navigation.service.test.js
git commit -m "feat(catalog): add navigation service (foundation)"
```

---

## Task 12: Product service accepts + returns taxonomy fields

**Files:**
- Modify: `server/src/modules/products/product.service.js` (the `PUBLIC_FIELDS` and `WRITABLE_FIELDS` `Object.freeze([...])` arrays near the top)
- Test: `server/src/modules/products/product.service.taxonomy.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/products/product.service.taxonomy.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Product } from "../../models/index.js";
import * as svc from "./product.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("product.service taxonomy fields", () => {
  it("accepts taxonomy ids on create and returns them in the public projection", async () => {
    const cid = new mongoose.Types.ObjectId();
    const created = await svc.createProduct({ name: "Blocks", price: 100, stock: 5, categoryIds: [cid] });
    expect(created.categoryIds.map(String)).toEqual([String(cid)]);
    const pub = await svc.getActiveProductBySlug(created.slug);
    expect(pub.categoryIds.map(String)).toEqual([String(cid)]);
  });

  it("updates collection and attribute-value references", async () => {
    const created = await svc.createProduct({ name: "Blocks", price: 100, stock: 5 });
    const vid = new mongoose.Types.ObjectId();
    const updated = await svc.updateProduct(created.id, { attributeValueIds: [vid] });
    expect(updated.attributeValueIds.map(String)).toEqual([String(vid)]);
  });
});
```

(If `createProduct`/`updateProduct`/`getActiveProductBySlug` have different exported names, check the file and adjust the test to the real names before running.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- product.service.taxonomy.test.js`
Expected: FAIL — taxonomy fields are stripped (not in `WRITABLE_FIELDS`/`PUBLIC_FIELDS`).

- [ ] **Step 3: Add the fields to both arrays**

In `server/src/modules/products/product.service.js`, append these entries to the
`PUBLIC_FIELDS` array (after `"variants",`):

```js
  "categoryIds",
  "collectionIds",
  "attributeValueIds",
```

and the same three entries to the `WRITABLE_FIELDS` array (after `"variants",`):

```js
  "categoryIds",
  "collectionIds",
  "attributeValueIds",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- product.service.taxonomy.test.js`
Expected: PASS (2 tests). Run `npm test --workspace server -- product.service` and confirm no regressions.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/products/product.service.js server/src/modules/products/product.service.taxonomy.test.js
git commit -m "feat(products): expose taxonomy fields in product service"
```

---

## Task 13: Bulk product-assignment service

**Files:**
- Create: `server/src/modules/catalog/productAssign.service.js`
- Test: `server/src/modules/catalog/productAssign.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/productAssign.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Product } from "../../models/index.js";
import { bulkAssign } from "./productAssign.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("bulkAssign", () => {
  it("adds ids to many products without duplicating (addToSet)", async () => {
    const p1 = await Product.create({ name: "A", slug: "a", price: 1, stock: 1 });
    const p2 = await Product.create({ name: "B", slug: "b", price: 1, stock: 1 });
    const cid = new mongoose.Types.ObjectId();
    const res = await bulkAssign({ productIds: [p1.id, p2.id], add: { categoryIds: [cid] } });
    expect(res.matched).toBe(2);
    await bulkAssign({ productIds: [p1.id], add: { categoryIds: [cid] } }); // idempotent
    const reloaded = await Product.findById(p1.id);
    expect(reloaded.categoryIds.map(String)).toEqual([String(cid)]);
  });

  it("removes ids with pull", async () => {
    const cid = new mongoose.Types.ObjectId();
    const p = await Product.create({ name: "A", slug: "a", price: 1, stock: 1, categoryIds: [cid] });
    await bulkAssign({ productIds: [p.id], remove: { categoryIds: [cid] } });
    const reloaded = await Product.findById(p.id);
    expect(reloaded.categoryIds).toHaveLength(0);
  });

  it("rejects an empty productIds list", async () => {
    await expect(bulkAssign({ productIds: [], add: { categoryIds: [] } }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- productAssign.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/productAssign.service.js
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";

const FIELDS = ["categoryIds", "collectionIds", "attributeValueIds"];

/** Build a $addToSet / $pull sub-document from an {field: [ids]} map. */
function buildSetOp(map = {}, operator) {
  const op = {};
  for (const f of FIELDS) {
    const ids = map[f];
    if (Array.isArray(ids) && ids.length > 0) {
      op[f] = operator === "$addToSet" ? { $each: ids } : { $in: ids };
    }
  }
  return op;
}

/**
 * Bulk add/remove taxonomy references across many products in two updateMany
 * round-trips ($addToSet for add, $pull for remove). Scales to thousands of
 * products without per-document writes.
 *
 * @param {{ productIds: string[], add?: object, remove?: object }} input
 * @returns {{ matched: number, modified: number }}
 */
export async function bulkAssign({ productIds, add = {}, remove = {} } = {}) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new CatalogValidationError("Provide at least one product id.");
  }
  let matched = 0;
  let modified = 0;
  const filter = { _id: { $in: productIds } };

  const addOp = buildSetOp(add, "$addToSet");
  if (Object.keys(addOp).length > 0) {
    const r = await Product.updateMany(filter, { $addToSet: addOp });
    matched = Math.max(matched, r.matchedCount ?? 0);
    modified += r.modifiedCount ?? 0;
  }
  const pullOp = buildSetOp(remove, "$pull");
  if (Object.keys(pullOp).length > 0) {
    const r = await Product.updateMany(filter, { $pull: pullOp });
    matched = Math.max(matched, r.matchedCount ?? 0);
    modified += r.modifiedCount ?? 0;
  }
  return { matched, modified };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- productAssign.service.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/productAssign.service.js server/src/modules/catalog/productAssign.service.test.js
git commit -m "feat(catalog): add bulk product-assignment service"
```

---

## Task 14: Catalog controller

**Files:**
- Create: `server/src/modules/catalog/catalog.controller.js`
- (Tested via the router tests in Tasks 15–16; no standalone test.)

- [ ] **Step 1: Write the controller**

```js
// server/src/modules/catalog/catalog.controller.js
import * as categories from "./category.service.js";
import * as collections from "./collection.service.js";
import * as attributes from "./attribute.service.js";
import * as navigation from "./navigation.service.js";
import { bulkAssign } from "./productAssign.service.js";

/**
 * Catalog controller — thin HTTP layer over the catalog services. Admin handlers
 * expose full (incl. archived when ?archived=true) data; public handlers expose
 * active-only projections. Errors are forwarded to the central error handler.
 */
export function createCatalogController() {
  const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
  };
  const archived = (req) => req.query.archived === "true";

  return {
    // ---- categories (admin) ----
    listCategories: wrap(async (req, res) => res.json({ categories: await categories.listCategoryTree({ includeArchived: archived(req) }) })),
    getCategory: wrap(async (req, res) => res.json({ category: await categories.getCategoryById(req.params.id) })),
    createCategory: wrap(async (req, res) => res.status(201).json({ category: await categories.createCategory(req.body ?? {}) })),
    updateCategory: wrap(async (req, res) => res.json({ category: await categories.updateCategory(req.params.id, req.body ?? {}) })),
    archiveCategory: wrap(async (req, res) => res.json({ category: await categories.archiveCategory(req.params.id) })),
    restoreCategory: wrap(async (req, res) => res.json({ category: await categories.restoreCategory(req.params.id) })),
    reorderCategories: wrap(async (req, res) => res.json({ categories: await categories.reorderCategories(req.body?.items ?? req.body ?? []) })),

    // ---- collections (admin) ----
    listCollections: wrap(async (req, res) => res.json({ collections: await collections.listCollections({ includeArchived: archived(req) }) })),
    getCollection: wrap(async (req, res) => res.json({ collection: await collections.getCollectionById(req.params.id) })),
    createCollection: wrap(async (req, res) => res.status(201).json({ collection: await collections.createCollection(req.body ?? {}) })),
    updateCollection: wrap(async (req, res) => res.json({ collection: await collections.updateCollection(req.params.id, req.body ?? {}) })),
    archiveCollection: wrap(async (req, res) => res.json({ collection: await collections.archiveCollection(req.params.id) })),
    restoreCollection: wrap(async (req, res) => res.json({ collection: await collections.restoreCollection(req.params.id) })),
    reorderCollections: wrap(async (req, res) => res.json({ collections: await collections.reorderCollections(req.body?.items ?? req.body ?? []) })),

    // ---- attributes + values (admin) ----
    listAttributes: wrap(async (req, res) => res.json({ attributes: await attributes.listAttributes({ includeArchived: archived(req) }) })),
    getAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.getAttributeById(req.params.id) })),
    createAttribute: wrap(async (req, res) => res.status(201).json({ attribute: await attributes.createAttribute(req.body ?? {}) })),
    updateAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.updateAttribute(req.params.id, req.body ?? {}) })),
    archiveAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.archiveAttribute(req.params.id) })),
    restoreAttribute: wrap(async (req, res) => res.json({ attribute: await attributes.restoreAttribute(req.params.id) })),
    reorderAttributes: wrap(async (req, res) => res.json({ attributes: await attributes.reorderAttributes(req.body?.items ?? req.body ?? []) })),
    addValue: wrap(async (req, res) => res.status(201).json({ value: await attributes.addValue(req.params.attrId, req.body ?? {}) })),
    updateValue: wrap(async (req, res) => res.json({ value: await attributes.updateValue(req.params.id, req.body ?? {}) })),
    archiveValue: wrap(async (req, res) => res.json({ value: await attributes.archiveValue(req.params.id) })),
    restoreValue: wrap(async (req, res) => res.json({ value: await attributes.restoreValue(req.params.id) })),
    reorderValues: wrap(async (req, res) => res.json({ attribute: await attributes.reorderValues(req.params.attrId, req.body?.items ?? req.body ?? []) })),

    // ---- bulk product assignment (admin) ----
    bulkAssignProducts: wrap(async (req, res) => res.json({ result: await bulkAssign(req.body ?? {}) })),

    // ---- public reads ----
    publicCategories: wrap(async (_req, res) => res.json({ categories: await categories.listCategoryTree({ includeArchived: false }) })),
    publicCategoryBySlug: wrap(async (req, res) => {
      const category = await categories.getCategoryBySlug(req.params.slug);
      if (!category) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json({ category });
    }),
    publicCollections: wrap(async (_req, res) => res.json({ collections: await collections.listCollections({ includeArchived: false }) })),
    publicCollectionBySlug: wrap(async (req, res) => {
      const collection = await collections.getPublicCollectionBySlug(req.params.slug);
      if (!collection) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      const products = await collections.getCollectionProducts(collection.id);
      return res.json({ collection, products });
    }),
    publicAttributes: wrap(async (_req, res) => res.json({ attributes: await attributes.listPublicAttributes() })),
  };
}

export default createCatalogController;
```

- [ ] **Step 2: Add `getCollectionProducts` to the collection service**

The public collection detail returns its manually-assigned active products (for the
storefront proof). Add to `server/src/modules/catalog/collection.service.js`:

```js
import { Product } from "../../models/index.js"; // already imported at top — do not duplicate

/** Active products manually assigned to a collection (public projection-lite). */
export async function getCollectionProducts(collectionId) {
  const docs = await Product.find({ collectionIds: collectionId, active: true }).sort({ createdAt: -1 });
  return docs.map((d) => {
    const j = d.toJSON();
    return { id: j.id, slug: j.slug, name: j.name, price: j.price, compareAtPrice: j.compareAtPrice,
      discountPercent: j.discountPercent, images: j.images };
  });
}
```

Add a test to `server/src/modules/catalog/collection.service.test.js`:

```js
  it("returns active assigned products for a collection", async () => {
    const c = await svc.createCollection({ name: "Sale" });
    const { Product } = await import("../../models/index.js");
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, active: true, collectionIds: [c.id] });
    await Product.create({ name: "Q", slug: "q", price: 10, stock: 1, active: false, collectionIds: [c.id] });
    const products = await svc.getCollectionProducts(c.id);
    expect(products.map((p) => p.slug)).toEqual(["p"]);
  });
```

- [ ] **Step 3: Run the collection service test**

Run: `npm test --workspace server -- collection.service.test.js`
Expected: PASS (5 tests).

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/catalog/catalog.controller.js server/src/modules/catalog/collection.service.js server/src/modules/catalog/collection.service.test.js
git commit -m "feat(catalog): add catalog controller + collection products read"
```

---

## Task 15: Catalog admin router

**Files:**
- Create: `server/src/modules/catalog/catalog.admin.router.js`
- Test: `server/src/modules/catalog/catalog.admin.router.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.admin.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogAdminRouter } from "./catalog.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Category from "./category.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); });

function buildApp({ authorized = true } = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    if (!authorized) return res.status(401).json({ error: { message: "Auth required", status: 401 } });
    req.admin = { id: "admin-1" }; next();
  };
  app.use("/api/admin/catalog", createCatalogAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/catalog` };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("catalog admin router", () => {
  it("rejects unauthenticated requests", async () => {
    const { server, base } = buildApp({ authorized: false });
    try { const r = await fetch(`${base}/categories`); expect(r.status).toBe(401); }
    finally { server.close(); }
  });

  it("creates and lists a category", async () => {
    const { server, base } = buildApp();
    try {
      const created = await (await post(`${base}/categories`, { name: "Toys" })).json();
      expect(created.category.slug).toBe("toys");
      const list = await (await fetch(`${base}/categories`)).json();
      expect(list.categories).toHaveLength(1);
    } finally { server.close(); }
  });

  it("creates an attribute and a value inline", async () => {
    const { server, base } = buildApp();
    try {
      const attr = (await (await post(`${base}/attributes`, { name: "Age Group", displayType: "checkbox" })).json()).attribute;
      const r = await post(`${base}/attributes/${attr.id}/values`, { name: "0-12 Months" });
      expect(r.status).toBe(201);
      const list = await (await fetch(`${base}/attributes`)).json();
      expect(list.attributes[0].values).toHaveLength(1);
    } finally { server.close(); }
  });

  it("returns 400 with a client-safe message when archiving a category with children", async () => {
    const { server, base } = buildApp();
    try {
      const parent = (await (await post(`${base}/categories`, { name: "Toys" })).json()).category;
      await post(`${base}/categories`, { name: "Blocks", parentId: parent.id });
      const r = await post(`${base}/categories/${parent.id}/archive`, {});
      expect(r.status).toBe(400);
      const body = await r.json();
      expect(body.error.message).toMatch(/child categories/i);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.admin.router.test.js`
Expected: FAIL — cannot resolve `./catalog.admin.router.js`.

- [ ] **Step 3: Write the router**

```js
// server/src/modules/catalog/catalog.admin.router.js
import { Router } from "express";
import { createCatalogController } from "./catalog.controller.js";

/**
 * Admin catalog router. Mounted at `/api/admin/catalog` (see ROUTER_MOUNTS),
 * behind the injected JWT auth guard. Manages categories, collections,
 * attributes (with inline values), and bulk product assignment.
 *
 * @param {object} [options]
 * @param {import("express").RequestHandler} [options.requireAuth]
 */
export function createCatalogAdminRouter({ requireAuth = (req, res, next) => next() } = {}) {
  const router = Router();
  const c = createCatalogController();
  router.use(requireAuth);

  // categories
  router.get("/categories", c.listCategories);
  router.post("/categories", c.createCategory);
  router.put("/categories/reorder", c.reorderCategories);
  router.get("/categories/:id", c.getCategory);
  router.put("/categories/:id", c.updateCategory);
  router.post("/categories/:id/archive", c.archiveCategory);
  router.post("/categories/:id/restore", c.restoreCategory);

  // collections
  router.get("/collections", c.listCollections);
  router.post("/collections", c.createCollection);
  router.put("/collections/reorder", c.reorderCollections);
  router.get("/collections/:id", c.getCollection);
  router.put("/collections/:id", c.updateCollection);
  router.post("/collections/:id/archive", c.archiveCollection);
  router.post("/collections/:id/restore", c.restoreCollection);

  // attributes + inline values
  router.get("/attributes", c.listAttributes);
  router.post("/attributes", c.createAttribute);
  router.put("/attributes/reorder", c.reorderAttributes);
  router.get("/attributes/:id", c.getAttribute);
  router.put("/attributes/:id", c.updateAttribute);
  router.post("/attributes/:id/archive", c.archiveAttribute);
  router.post("/attributes/:id/restore", c.restoreAttribute);
  router.post("/attributes/:attrId/values", c.addValue);
  router.put("/attributes/:attrId/values/reorder", c.reorderValues);
  router.put("/values/:id", c.updateValue);
  router.post("/values/:id/archive", c.archiveValue);
  router.post("/values/:id/restore", c.restoreValue);

  // bulk product assignment
  router.post("/products/bulk-assign", c.bulkAssignProducts);

  return router;
}

export default createCatalogAdminRouter;
```

Note the route order: `/categories/reorder` is registered before `/categories/:id` so
the literal path is matched first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.admin.router.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/catalog.admin.router.js server/src/modules/catalog/catalog.admin.router.test.js
git commit -m "feat(catalog): add catalog admin router"
```

---

## Task 16: Catalog public router

**Files:**
- Create: `server/src/modules/catalog/catalog.public.router.js`
- Test: `server/src/modules/catalog/catalog.public.router.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.public.router.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogPublicRouter } from "./catalog.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import * as collectionSvc from "./collection.service.js";
import * as attributeSvc from "./attribute.service.js";
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Collection.deleteMany({}); await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", createCatalogPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/catalog` };
}

describe("catalog public router", () => {
  it("returns a collection with its active products by slug", async () => {
    const { server, base } = buildApp();
    try {
      const c = await collectionSvc.createCollection({ name: "Sale" });
      await Product.create({ name: "P", slug: "p", price: 10, stock: 1, active: true, collectionIds: [c.id] });
      const body = await (await fetch(`${base}/collections/sale`)).json();
      expect(body.collection.name).toBe("Sale");
      expect(body.products).toHaveLength(1);
    } finally { server.close(); }
  });

  it("404s for an archived collection slug", async () => {
    const { server, base } = buildApp();
    try {
      const c = await collectionSvc.createCollection({ name: "Old" });
      await collectionSvc.archiveCollection(c.id);
      const r = await fetch(`${base}/collections/old`);
      expect(r.status).toBe(404);
    } finally { server.close(); }
  });

  it("exposes only filterable active attributes", async () => {
    const { server, base } = buildApp();
    try {
      const a = await attributeSvc.createAttribute({ name: "Age Group", displayType: "checkbox" });
      await attributeSvc.addValue(a.id, { name: "0-12 Months" });
      await attributeSvc.createAttribute({ name: "Hidden", displayType: "checkbox", isFilterable: false });
      const body = await (await fetch(`${base}/attributes`)).json();
      expect(body.attributes).toHaveLength(1);
      expect(body.attributes[0].values).toHaveLength(1);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.public.router.test.js`
Expected: FAIL — cannot resolve `./catalog.public.router.js`.

- [ ] **Step 3: Write the router**

```js
// server/src/modules/catalog/catalog.public.router.js
import { Router } from "express";
import { createCatalogController } from "./catalog.controller.js";

/**
 * Public catalog router. Mounted at `/api/catalog` (see ROUTER_MOUNTS).
 * Unauthenticated, active-only reads consumed by the storefront.
 */
export function createCatalogPublicRouter() {
  const router = Router();
  const c = createCatalogController();
  router.get("/categories", c.publicCategories);
  router.get("/categories/:slug", c.publicCategoryBySlug);
  router.get("/collections", c.publicCollections);
  router.get("/collections/:slug", c.publicCollectionBySlug);
  router.get("/attributes", c.publicAttributes);
  return router;
}

export default createCatalogPublicRouter;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.public.router.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/catalog.public.router.js server/src/modules/catalog/catalog.public.router.test.js
git commit -m "feat(catalog): add catalog public router"
```

---

## Task 17: Router mounts + app wiring

**Files:**
- Modify: `server/src/shared/constants/routerMounts.js`
- Modify: `server/src/index.js`
- Test: `server/src/shared/constants/routerMounts.test.js` (create if absent; otherwise add a case)

- [ ] **Step 1: Write the failing test**

```js
// server/src/shared/constants/routerMounts.test.js
import { describe, it, expect } from "vitest";
import { ROUTER_MOUNTS } from "./routerMounts.js";

describe("ROUTER_MOUNTS catalog", () => {
  it("declares catalog admin + public mount paths", () => {
    expect(ROUTER_MOUNTS.catalogAdmin).toBe("/api/admin/catalog");
    expect(ROUTER_MOUNTS.catalog).toBe("/api/catalog");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- routerMounts.test.js`
Expected: FAIL — `catalogAdmin`/`catalog` are `undefined`.

- [ ] **Step 3: Add the mounts**

In `server/src/shared/constants/routerMounts.js`, add inside the `Object.freeze({ ... })`
after the `newsletterAdmin` line:

```js
  catalogAdmin: "/api/admin/catalog",
  catalog: "/api/catalog",
```

- [ ] **Step 4: Wire the routers in `server/src/index.js`**

Add imports near the other content/newsletter router imports:

```js
import { createCatalogAdminRouter } from "./modules/catalog/catalog.admin.router.js";
import { createCatalogPublicRouter } from "./modules/catalog/catalog.public.router.js";
```

Add to the `routers: { ... }` object (after the `newsletterAdmin` entry):

```js
    // Admin catalog management: /api/admin/catalog, guarded.
    catalogAdmin: createCatalogAdminRouter({ requireAuth }),
    // Public storefront catalog reads: /api/catalog.
    catalog: createCatalogPublicRouter(),
```

- [ ] **Step 5: Run tests to verify**

Run: `npm test --workspace server -- routerMounts.test.js`
Expected: PASS. Also run any existing `app` wiring test (`npm test --workspace server -- app`) to confirm mounting still works.

- [ ] **Step 6: Commit**

```bash
git add server/src/shared/constants/routerMounts.js server/src/index.js server/src/shared/constants/routerMounts.test.js
git commit -m "feat(catalog): mount catalog admin + public routers"
```

---

## Task 18: shared-web `CategoryView` (+ enable jsdom component tests)

`packages/shared-web/vitest.config.js` is currently node-only and only includes `*.test.js`.
This task switches it to jsdom and includes `*.test.jsx` so shared View components can be
tested where they live. `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom`
are already hoisted at the repo root.

**Files:**
- Modify: `packages/shared-web/vitest.config.js`
- Create: `packages/shared-web/src/test/setup.js`
- Create: `packages/shared-web/src/catalog/CategoryView.jsx`
- Test: `packages/shared-web/src/catalog/CategoryView.test.jsx`

- [ ] **Step 1: Reconfigure vitest for jsdom + jsx**

Replace the contents of `packages/shared-web/vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

// JS utilities run in node; JSX View components need jsdom. We use jsdom for the
// whole package (the node-only utility tests pass under jsdom too) and include
// both .js and .jsx test files.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});
```

Create `packages/shared-web/src/test/setup.js`:

```js
import "@testing-library/jest-dom";
```

- [ ] **Step 2: Write the failing test**

```jsx
// packages/shared-web/src/catalog/CategoryView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CategoryView from "./CategoryView.jsx";

afterEach(cleanup);

describe("CategoryView", () => {
  it("renders nothing when there are no categories", () => {
    const { container } = render(<CategoryView categories={[]} />);
    expect(container.querySelector(".pot-cat-grid")).toBeNull();
  });

  it("renders a card per category with name and child count", () => {
    render(<CategoryView categories={[
      { id: "1", name: "Educational Toys", image: "edu.webp", childCount: 3 },
      { id: "2", name: "Puzzles", image: null, childCount: 0 },
    ]} />);
    expect(screen.getByText("Educational Toys")).toBeInTheDocument();
    expect(screen.getByText("Puzzles")).toBeInTheDocument();
    expect(screen.getByText(/3 subcategories/i)).toBeInTheDocument();
  });

  it("resolves image filenames via resolveImageUrl", () => {
    render(<CategoryView
      categories={[{ id: "1", name: "Edu", image: "edu.webp", childCount: 0 }]}
      resolveImageUrl={(f) => `/media/${f}`}
    />);
    expect(screen.getByRole("img", { name: "Edu" })).toHaveAttribute("src", "/media/edu.webp");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- CategoryView`
Expected: FAIL — cannot resolve `./CategoryView.jsx`.

- [ ] **Step 4: Write the component**

```jsx
// packages/shared-web/src/catalog/CategoryView.jsx
/**
 * CategoryView — presentational category card grid. Pure: no fetching, no
 * routing. Used by both the admin live preview and the storefront. The consumer
 * supplies token-driven CSS (class names below) and an optional
 * `resolveImageUrl(filename)` to turn a stored media filename into a URL.
 *
 * @param {object} props
 * @param {Array<{id,name,image,childCount}>} props.categories
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(category:object)=>void} [props.onSelect]
 */
export default function CategoryView({ categories = [], resolveImageUrl = (x) => x, onSelect }) {
  if (!categories || categories.length === 0) return null;
  return (
    <div className="pot-cat-grid">
      {categories.map((c) => {
        const count = c.childCount || 0;
        const card = (
          <>
            <div className="pot-cat-card__media">
              {c.image
                ? <img src={resolveImageUrl(c.image)} alt={c.name} className="pot-cat-card__img" />
                : <span className="pot-cat-card__placeholder" aria-hidden="true" />}
            </div>
            <h3 className="pot-cat-card__name">{c.name}</h3>
            {count > 0 && (
              <p className="pot-cat-card__meta">{count} {count === 1 ? "subcategory" : "subcategories"}</p>
            )}
          </>
        );
        return onSelect
          ? <button key={c.id} type="button" className="pot-cat-card" onClick={() => onSelect(c)}>{card}</button>
          : <div key={c.id} className="pot-cat-card">{card}</div>;
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- CategoryView`
Expected: PASS (3 tests). Run the full shared-web suite (`npm test --workspace @planet-of-toys/shared-web`) to confirm the jsdom switch didn't break existing utility tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-web/vitest.config.js packages/shared-web/src/test/setup.js packages/shared-web/src/catalog/CategoryView.jsx packages/shared-web/src/catalog/CategoryView.test.jsx
git commit -m "feat(shared-web): add CategoryView + jsdom component tests"
```

---

## Task 19: shared-web `CollectionView`

**Files:**
- Create: `packages/shared-web/src/catalog/CollectionView.jsx`
- Test: `packages/shared-web/src/catalog/CollectionView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/CollectionView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CollectionView from "./CollectionView.jsx";

afterEach(cleanup);

describe("CollectionView", () => {
  it("renders nothing without a collection", () => {
    const { container } = render(<CollectionView collection={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders hero title/subtitle and product cards", () => {
    render(<CollectionView
      collection={{ id: "c", name: "STEM Toys", heroTitle: "Learn by Play", heroSubtitle: "Ages 5-8", heroImage: "hero.webp" }}
      products={[{ id: "p", slug: "blocks", name: "Blocks", price: 499 }]}
      resolveImageUrl={(f) => `/media/${f}`}
      formatPrice={(n) => `Rs ${n}`}
    />);
    expect(screen.getByText("Learn by Play")).toBeInTheDocument();
    expect(screen.getByText("Ages 5-8")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Rs 499")).toBeInTheDocument();
  });

  it("falls back to the collection name when heroTitle is absent", () => {
    render(<CollectionView collection={{ id: "c", name: "Best Sellers" }} products={[]} />);
    expect(screen.getByRole("heading", { name: "Best Sellers" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- CollectionView`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component**

```jsx
// packages/shared-web/src/catalog/CollectionView.jsx
/**
 * CollectionView — presentational collection page: a hero band (title/subtitle/
 * image) followed by a product card grid. Pure and responsive (the grid reflows
 * to the container width, so the same component drives desktop + mobile preview
 * and the storefront). Consumer supplies CSS, `resolveImageUrl`, and `formatPrice`.
 *
 * @param {object} props
 * @param {{id,name,heroTitle,heroSubtitle,heroImage,description}|null} props.collection
 * @param {Array<{id,slug,name,price,compareAtPrice,discountPercent,images}>} [props.products]
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(amount:number)=>string} [props.formatPrice]
 */
export default function CollectionView({
  collection, products = [], resolveImageUrl = (x) => x, formatPrice = (n) => String(n),
}) {
  if (!collection) return null;
  const title = collection.heroTitle || collection.name;
  return (
    <section className="pot-collection">
      <header
        className={`pot-collection__hero${collection.heroImage ? " pot-collection__hero--image" : ""}`}
        style={collection.heroImage ? { backgroundImage: `url(${resolveImageUrl(collection.heroImage)})` } : undefined}
      >
        <div className="pot-collection__hero-inner">
          <h1 className="pot-collection__title">{title}</h1>
          {collection.heroSubtitle && <p className="pot-collection__subtitle">{collection.heroSubtitle}</p>}
        </div>
      </header>

      {products.length > 0 ? (
        <div className="pot-collection__grid">
          {products.map((p) => {
            const img = Array.isArray(p.images) && p.images[0] ? resolveImageUrl(p.images[0]) : null;
            return (
              <article key={p.id} className="pot-prod-card">
                <div className="pot-prod-card__media">
                  {img ? <img src={img} alt={p.name} className="pot-prod-card__img" />
                       : <span className="pot-prod-card__placeholder" aria-hidden="true" />}
                </div>
                <h3 className="pot-prod-card__name">{p.name}</h3>
                <p className="pot-prod-card__price">{formatPrice(p.price)}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="pot-collection__empty">No products in this collection yet.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- CollectionView`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/CollectionView.jsx packages/shared-web/src/catalog/CollectionView.test.jsx
git commit -m "feat(shared-web): add CollectionView"
```

---

## Task 20: shared-web `AttributeFilterView` + package exports

**Files:**
- Create: `packages/shared-web/src/catalog/AttributeFilterView.jsx`
- Create: `packages/shared-web/src/catalog/index.js`
- Test: `packages/shared-web/src/catalog/AttributeFilterView.test.jsx`
- Modify: `packages/shared-web/src/index.js`
- Modify: `packages/shared-web/package.json`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/AttributeFilterView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AttributeFilterView from "./AttributeFilterView.jsx";

afterEach(cleanup);

const ageGroup = { id: "a", name: "Age Group", displayType: "checkbox",
  values: [{ id: "v1", name: "0-12 Months" }, { id: "v2", name: "1-2 Years" }] };

describe("AttributeFilterView", () => {
  it("renders nothing without an attribute", () => {
    const { container } = render(<AttributeFilterView attribute={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the attribute name and a checkbox per value for displayType=checkbox", () => {
    render(<AttributeFilterView attribute={ageGroup} />);
    expect(screen.getByText("Age Group")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByLabelText("0-12 Months")).toBeInTheDocument();
  });

  it("renders radios for displayType=radio", () => {
    render(<AttributeFilterView attribute={{ ...ageGroup, displayType: "radio" }} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("renders a select for displayType=dropdown", () => {
    render(<AttributeFilterView attribute={{ ...ageGroup, displayType: "dropdown" }} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3); // placeholder + 2
  });

  it("renders color swatches for displayType=color using swatchHex", () => {
    render(<AttributeFilterView attribute={{ id: "c", name: "Color", displayType: "color",
      values: [{ id: "r", name: "Red", swatchHex: "#ff0000" }] }} />);
    expect(screen.getByLabelText("Red")).toBeInTheDocument();
  });

  it("renders buttons for displayType=button", () => {
    render(<AttributeFilterView attribute={{ ...ageGroup, displayType: "button" }} />);
    // two value buttons
    expect(screen.getByRole("button", { name: "0-12 Months" })).toBeInTheDocument();
  });

  it("renders a range control for displayType=range", () => {
    render(<AttributeFilterView attribute={{ id: "p", name: "Price", displayType: "range", values: [] }} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- AttributeFilterView`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component**

```jsx
// packages/shared-web/src/catalog/AttributeFilterView.jsx
/**
 * AttributeFilterView — renders ONE attribute as its storefront filter control,
 * chosen by `attribute.displayType`. Pure and presentational; this is the seed of
 * the full FilterView in Sub-project B. Controls are uncontrolled here (preview /
 * structural rendering); selection wiring arrives in B. Consumer supplies CSS.
 *
 * @param {object} props
 * @param {{id,name,displayType,values:Array<{id,name,swatchHex}>}|null} props.attribute
 */
export default function AttributeFilterView({ attribute }) {
  if (!attribute) return null;
  const { name, displayType, values = [] } = attribute;
  const groupName = `attr-${attribute.id}`;

  return (
    <fieldset className="pot-filter">
      <legend className="pot-filter__title">{name}</legend>
      <div className={`pot-filter__body pot-filter__body--${displayType}`}>
        {renderControl(displayType, values, groupName)}
      </div>
    </fieldset>
  );
}

function renderControl(displayType, values, groupName) {
  switch (displayType) {
    case "radio":
      return values.map((v) => (
        <label key={v.id} className="pot-filter__opt">
          <input type="radio" name={groupName} value={v.id} /> <span>{v.name}</span>
        </label>
      ));
    case "dropdown":
      return (
        <select className="pot-filter__select" defaultValue="">
          <option value="" disabled>Select…</option>
          {values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      );
    case "color":
      return (
        <div className="pot-filter__swatches">
          {values.map((v) => (
            <button key={v.id} type="button" className="pot-filter__swatch" aria-label={v.name}
              title={v.name} style={{ backgroundColor: v.swatchHex || "#ccc" }} />
          ))}
        </div>
      );
    case "button":
      return values.map((v) => (
        <button key={v.id} type="button" className="pot-filter__pill">{v.name}</button>
      ));
    case "range":
      return <input type="range" className="pot-filter__range" min="0" max="100" defaultValue="50" aria-label="Range" />;
    case "checkbox":
    default:
      return values.map((v) => (
        <label key={v.id} className="pot-filter__opt">
          <input type="checkbox" name={groupName} value={v.id} /> <span>{v.name}</span>
        </label>
      ));
  }
}
```

- [ ] **Step 4: Add the catalog barrel + package exports**

Create `packages/shared-web/src/catalog/index.js`:

```js
export { default as CategoryView } from "./CategoryView.jsx";
export { default as CollectionView } from "./CollectionView.jsx";
export { default as AttributeFilterView } from "./AttributeFilterView.jsx";
```

Append to `packages/shared-web/src/index.js` (after the FooterView export):

```js
// Catalog presentational components (storefront + admin preview).
export { default as CategoryView } from "./catalog/CategoryView.jsx";
export { default as CollectionView } from "./catalog/CollectionView.jsx";
export { default as AttributeFilterView } from "./catalog/AttributeFilterView.jsx";
```

Add to the `exports` map in `packages/shared-web/package.json` (after the `./promoBanner` entry — remember to add the trailing comma to the previous line):

```json
    "./catalog": "./src/catalog/index.js"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- AttributeFilterView`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-web/src/catalog/AttributeFilterView.jsx packages/shared-web/src/catalog/index.js packages/shared-web/src/catalog/AttributeFilterView.test.jsx packages/shared-web/src/index.js packages/shared-web/package.json
git commit -m "feat(shared-web): add AttributeFilterView + catalog exports"
```

---

## Task 21: Admin `DevicePreview` + shared responsive catalog CSS

The View grids use intrinsic responsive layout (`auto-fill`/`minmax`) so they reflow purely
by **container width** — no viewport media queries needed. That makes the narrow mobile
frame produce genuine reflow (the user's hard requirement) without an iframe. The shared CSS
lives in shared-web so the admin preview and the storefront look identical.

**Files:**
- Create: `packages/shared-web/src/catalog/catalog-views.css`
- Create: `apps/admin/src/pages/admin/catalog/DevicePreview.jsx`
- Create: `apps/admin/src/pages/admin/catalog/DevicePreview.css`
- Test: `apps/admin/src/pages/admin/catalog/DevicePreview.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/DevicePreview.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DevicePreview from "./DevicePreview.jsx";

afterEach(cleanup);

describe("DevicePreview", () => {
  it("renders the children in both a desktop and a mobile frame", () => {
    render(<DevicePreview><p>hello</p></DevicePreview>);
    expect(screen.getAllByText("hello")).toHaveLength(2);
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
  });

  it("constrains the mobile viewport width", () => {
    const { container } = render(<DevicePreview mobileWidth={390}><p>x</p></DevicePreview>);
    const mobileViewport = container.querySelector(".device-preview__frame--mobile .device-preview__viewport");
    expect(mobileViewport).toHaveStyle({ width: "390px" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- DevicePreview`
Expected: FAIL — cannot resolve `./DevicePreview.jsx`.

- [ ] **Step 3: Write the component + CSS**

```jsx
// apps/admin/src/pages/admin/catalog/DevicePreview.jsx
import "@planet-of-toys/shared-web/catalog/catalog-views.css";
import "./DevicePreview.css";

/**
 * DevicePreview — admin-only chrome showing the SAME shared View component in a
 * desktop frame and a width-constrained mobile frame, side by side. The View's
 * intrinsic responsive grid reflows to each frame's width, so the mobile frame
 * shows real mobile layout (no scaled screenshot). Pass the shared View as children.
 */
export default function DevicePreview({ children, mobileWidth = 390 }) {
  return (
    <div className="device-preview">
      <div className="device-preview__frame device-preview__frame--desktop">
        <span className="device-preview__label">Desktop</span>
        <div className="device-preview__viewport">{children}</div>
      </div>
      <div className="device-preview__frame device-preview__frame--mobile">
        <span className="device-preview__label">Mobile</span>
        <div className="device-preview__viewport" style={{ width: `${mobileWidth}px` }}>{children}</div>
      </div>
    </div>
  );
}
```

For the CSS import path to resolve, add a `./catalog/catalog-views.css` subpath to
`packages/shared-web/package.json` `exports` (after the `./catalog` entry, with a comma):

```json
    "./catalog/catalog-views.css": "./src/catalog/catalog-views.css"
```

```css
/* apps/admin/src/pages/admin/catalog/DevicePreview.css */
.device-preview { display: flex; gap: var(--space-5, 24px); align-items: flex-start; flex-wrap: wrap; }
.device-preview__frame { border: 1px solid var(--admin-elevated, #d9e2f2); border-radius: 12px; background: #fff; padding: 12px; }
.device-preview__frame--desktop { flex: 1 1 520px; min-width: 0; }
.device-preview__frame--mobile { flex: 0 0 auto; }
.device-preview__label { display: inline-block; font-size: 0.75rem; font-weight: 700; color: var(--admin-text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.device-preview__viewport { overflow: hidden; border-radius: 8px; }
.device-preview__frame--mobile .device-preview__viewport { border: 1px solid var(--admin-elevated, #d9e2f2); }
```

```css
/* packages/shared-web/src/catalog/catalog-views.css
   Shared, token-driven styling for the catalog View components. Intrinsic
   responsive grids (auto-fill + minmax) reflow by CONTAINER width, so the same
   markup is identical in the admin preview and on the storefront. */

/* CategoryView */
.pot-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
.pot-cat-card { display: block; text-align: left; border: 1px solid #e6ebf5; border-radius: 14px; overflow: hidden; background: #fff; padding: 0 0 12px; font: inherit; cursor: default; }
button.pot-cat-card { cursor: pointer; }
.pot-cat-card__media { aspect-ratio: 4 / 3; background: #f1f5fb; }
.pot-cat-card__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pot-cat-card__placeholder { display: block; width: 100%; height: 100%; }
.pot-cat-card__name { margin: 12px 12px 2px; font-size: 1rem; font-weight: 700; }
.pot-cat-card__meta { margin: 0 12px; font-size: 0.8rem; color: #64748b; }

/* CollectionView */
.pot-collection__hero { background: #2e3192; color: #fff; border-radius: 16px; padding: 40px 24px; background-size: cover; background-position: center; }
.pot-collection__hero--image { position: relative; }
.pot-collection__hero-inner { position: relative; }
.pot-collection__title { margin: 0; font-size: 1.8rem; font-weight: 800; }
.pot-collection__subtitle { margin: 8px 0 0; opacity: 0.92; }
.pot-collection__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-top: 20px; }
.pot-collection__empty { margin-top: 20px; color: #64748b; }
.pot-prod-card { border: 1px solid #e6ebf5; border-radius: 14px; overflow: hidden; background: #fff; padding-bottom: 12px; }
.pot-prod-card__media { aspect-ratio: 1 / 1; background: #f1f5fb; }
.pot-prod-card__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pot-prod-card__placeholder { display: block; width: 100%; height: 100%; }
.pot-prod-card__name { margin: 12px 12px 2px; font-size: 0.95rem; font-weight: 600; }
.pot-prod-card__price { margin: 0 12px; font-weight: 800; color: #f81424; }

/* AttributeFilterView */
.pot-filter { border: 0; margin: 0; padding: 0; }
.pot-filter__title { font-weight: 700; padding: 0; margin-bottom: 8px; }
.pot-filter__body { display: grid; gap: 8px; }
.pot-filter__body--color, .pot-filter__body--button { grid-auto-flow: column; justify-content: start; gap: 10px; }
.pot-filter__opt { display: flex; align-items: center; gap: 8px; font-size: 0.95rem; }
.pot-filter__select { padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
.pot-filter__swatches { display: flex; gap: 8px; }
.pot-filter__swatch { width: 26px; height: 26px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; }
.pot-filter__pill { border: 1px solid #cbd5e1; border-radius: 999px; padding: 6px 14px; background: #fff; cursor: pointer; }
.pot-filter__range { width: 100%; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- DevicePreview`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/catalog-views.css packages/shared-web/package.json apps/admin/src/pages/admin/catalog/DevicePreview.jsx apps/admin/src/pages/admin/catalog/DevicePreview.css apps/admin/src/pages/admin/catalog/DevicePreview.test.jsx
git commit -m "feat(catalog): add DevicePreview + shared catalog view styles"
```

---

## Task 22: Categories admin page

Ordering uses accessible **move up / move down** controls that call the `reorder` endpoint
(consistent with the existing `FooterEditor` move buttons) — functional reordering that is
keyboard-accessible and testable in jsdom. Live preview uses `CategoryView` inside
`DevicePreview`. Media fields reuse the existing upload endpoint (`/api/admin/media`) via a
small inline upload helper.

**Files:**
- Create: `apps/admin/src/pages/admin/catalog/CategoriesPage.jsx`
- Create: `apps/admin/src/pages/admin/catalog/CatalogPage.css` (shared styling for all three pages)
- Test: `apps/admin/src/pages/admin/catalog/CategoriesPage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/CategoriesPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import CategoriesPage from "./CategoriesPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

describe("CategoriesPage", () => {
  it("loads and renders the category tree with a live preview", async () => {
    apiMock.get.mockResolvedValue({ categories: [{ id: "1", name: "Toys", image: null, sortOrder: 0, children: [] }] });
    render(<CategoriesPage />);
    expect((await screen.findAllByText("Toys")).length).toBeGreaterThan(0); // list + preview
  });

  it("creates a category", async () => {
    apiMock.get.mockResolvedValue({ categories: [] });
    apiMock.post.mockResolvedValue({ category: { id: "9", name: "New", children: [] } });
    render(<CategoriesPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/new category name/i), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: /add category/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/categories", expect.objectContaining({ name: "New" }), expect.any(Object)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- CategoriesPage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the page + CSS**

```jsx
// apps/admin/src/pages/admin/catalog/CategoriesPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { CategoryView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "./DevicePreview.jsx";
import "./CatalogPage.css";

const BASE = "/api/admin/catalog/categories";

/** Flatten the tree into depth-tagged rows for the editor list. */
function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

export default function CategoriesPage() {
  const [tree, setTree] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try { const res = await apiClient.get(BASE, auth()); setTree(res?.categories ?? []); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load categories."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addCategory() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try { await apiClient.post(BASE, { name: name.trim() }, auth()); setName(""); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create category."); }
    finally { setBusy(false); }
  }

  async function archive(id) {
    setErr(null);
    try { await apiClient.post(`${BASE}/${id}/archive`, {}, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not archive."); }
  }

  /** Move a sibling within the flat sibling group and persist the new order. */
  async function move(rows, index, delta) {
    const row = rows[index];
    const siblings = rows.filter((r) => String(r.parentId ?? "") === String(row.parentId ?? ""));
    const pos = siblings.findIndex((s) => s.id === row.id);
    const swapWith = siblings[pos + delta];
    if (!swapWith) return;
    const reordered = siblings.slice();
    reordered.splice(pos, 1);
    reordered.splice(pos + delta, 0, row);
    const items = reordered.map((s, i) => ({ id: s.id, parentId: s.parentId ?? null, sortOrder: i }));
    try { await apiClient.put(`${BASE}/reorder`, { items }, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not reorder."); }
  }

  async function uploadImage(id, file) {
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: form });
    const data = await res.json();
    await apiClient.put(`${BASE}/${id}`, { image: data.filename }, auth());
    await load();
  }

  const rows = useMemo(() => (tree ? flatten(tree) : []), [tree]);
  const previewCategories = useMemo(
    () => (tree ?? []).map((c) => ({ id: c.id, name: c.name, image: c.image, childCount: c.children?.length || 0 })),
    [tree]
  );

  if (tree === null) return <p className="catalog-page__status">Loading…</p>;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Categories</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><CategoryView categories={previewCategories} resolveImageUrl={(f) => mediaUrl(f)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add category</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>New category name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button type="button" onClick={addCategory} disabled={busy}>Add category</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Tree</h2>
        <ul className="catalog-page__list">
          {rows.map((r, i) => (
            <li key={r.id} className="catalog-page__row" style={{ paddingLeft: `${r.depth * 20}px` }}>
              <span className="catalog-page__row-name">{r.name}</span>
              <span className="catalog-page__row-actions">
                <button type="button" aria-label={`Move up ${r.name}`} onClick={() => move(rows, i, -1)}>↑</button>
                <button type="button" aria-label={`Move down ${r.name}`} onClick={() => move(rows, i, 1)}>↓</button>
                <label className="catalog-page__upload" aria-label={`Upload image for ${r.name}`}>
                  Image<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadImage(r.id, e.target.files[0])} />
                </label>
                <button type="button" aria-label={`Archive ${r.name}`} onClick={() => archive(r.id)}>Archive</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

```css
/* apps/admin/src/pages/admin/catalog/CatalogPage.css — shared by all catalog pages */
.catalog-page { display: grid; gap: var(--space-5, 24px); }
.catalog-page__status { color: var(--admin-text-muted, #64748b); }
.catalog-page__err { color: #b91c1c; background: #fee2e2; padding: 10px 14px; border-radius: 8px; margin: 0; }
.catalog-card { background: var(--admin-bg, #fff); border: 1px solid var(--admin-elevated, #d9e2f2); border-radius: 14px; padding: 20px; }
.catalog-card > h2 { margin: 0 0 16px; font-size: 1.05rem; }
.catalog-page__add { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.catalog-page__field { display: grid; gap: 6px; font-size: 0.85rem; }
.catalog-page__field input, .catalog-page__field select, .catalog-page__field textarea { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
.catalog-page__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.catalog-page__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid #eef2f9; border-radius: 10px; }
.catalog-page__row-actions { display: flex; gap: 8px; align-items: center; }
.catalog-page__row-actions button, .catalog-page__upload { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 0.85rem; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- CategoriesPage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/admin/catalog/CategoriesPage.jsx apps/admin/src/pages/admin/catalog/CatalogPage.css apps/admin/src/pages/admin/catalog/CategoriesPage.test.jsx
git commit -m "feat(admin): add Categories management page"
```

---

## Task 23: Collections admin page

**Files:**
- Create: `apps/admin/src/pages/admin/catalog/CollectionsPage.jsx`
- Test: `apps/admin/src/pages/admin/catalog/CollectionsPage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/CollectionsPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import CollectionsPage from "./CollectionsPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

describe("CollectionsPage", () => {
  it("loads and previews the selected collection", async () => {
    apiMock.get.mockResolvedValue({ collections: [{ id: "1", name: "STEM Toys", heroTitle: "Learn", featuredOnHome: false, showInNavigation: false }] });
    render(<CollectionsPage />);
    expect((await screen.findAllByText(/STEM Toys|Learn/)).length).toBeGreaterThan(0);
  });

  it("creates a collection", async () => {
    apiMock.get.mockResolvedValue({ collections: [] });
    apiMock.post.mockResolvedValue({ collection: { id: "9", name: "Sale" } });
    render(<CollectionsPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/new collection name/i), { target: { value: "Sale" } });
    fireEvent.click(screen.getByRole("button", { name: /add collection/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/collections", expect.objectContaining({ name: "Sale" }), expect.any(Object)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- CollectionsPage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the page**

```jsx
// apps/admin/src/pages/admin/catalog/CollectionsPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "./DevicePreview.jsx";
import "./CatalogPage.css";

const BASE = "/api/admin/catalog/collections";

export default function CollectionsPage() {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiClient.get(BASE, auth());
      const cols = res?.collections ?? [];
      setList(cols);
      setSelectedId((cur) => cur ?? cols[0]?.id ?? null);
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load collections."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try { const r = await apiClient.post(BASE, { name: name.trim() }, auth()); setName(""); setSelectedId(r?.collection?.id ?? null); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create collection."); }
    finally { setBusy(false); }
  }

  async function patch(id, body) {
    try { await apiClient.put(`${BASE}/${id}`, body, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save."); }
  }

  async function archive(id) {
    try { await apiClient.post(`${BASE}/${id}/archive`, {}, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not archive."); }
  }

  async function uploadHero(id, file) {
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: form });
    const data = await res.json();
    await patch(id, { heroImage: data.filename });
  }

  if (list === null) return <p className="catalog-page__status">Loading…</p>;
  const selected = list.find((c) => c.id === selectedId) || list[0] || null;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Collections</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><CollectionView collection={selected} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add collection</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>New collection name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button type="button" onClick={add} disabled={busy}>Add collection</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Collections</h2>
        <ul className="catalog-page__list">
          {list.map((c) => (
            <li key={c.id} className="catalog-page__row">
              <button type="button" className="catalog-page__row-name" onClick={() => setSelectedId(c.id)}>{c.name}</button>
              <span className="catalog-page__row-actions">
                <label className="catalog-page__check"><input type="checkbox" checked={!!c.featuredOnHome} onChange={(e) => patch(c.id, { featuredOnHome: e.target.checked })} /> Home</label>
                <label className="catalog-page__check"><input type="checkbox" checked={!!c.showInNavigation} onChange={(e) => patch(c.id, { showInNavigation: e.target.checked })} /> Nav</label>
                <label className="catalog-page__upload" aria-label={`Upload hero for ${c.name}`}>Hero<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadHero(c.id, e.target.files[0])} /></label>
                <button type="button" aria-label={`Archive ${c.name}`} onClick={() => archive(c.id)}>Archive</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

Add to `apps/admin/src/pages/admin/catalog/CatalogPage.css`:

```css
.catalog-page__check { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; }
.catalog-page__row-name { background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; text-align: left; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- CollectionsPage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/admin/catalog/CollectionsPage.jsx apps/admin/src/pages/admin/catalog/CatalogPage.css apps/admin/src/pages/admin/catalog/CollectionsPage.test.jsx
git commit -m "feat(admin): add Collections management page"
```

---

## Task 24: Attributes admin page (inline values)

**Files:**
- Create: `apps/admin/src/pages/admin/catalog/AttributesPage.jsx`
- Test: `apps/admin/src/pages/admin/catalog/AttributesPage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/AttributesPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import AttributesPage from "./AttributesPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

const ATTR = { id: "a", name: "Age Group", displayType: "checkbox", values: [{ id: "v1", name: "0-12 Months" }] };

describe("AttributesPage", () => {
  it("loads attributes and previews the selected one as its control", async () => {
    apiMock.get.mockResolvedValue({ attributes: [ATTR] });
    render(<AttributesPage />);
    await screen.findByText("Age Group");
    expect(screen.getByLabelText("0-12 Months")).toBeInTheDocument(); // preview checkbox
  });

  it("adds a value to the selected attribute", async () => {
    apiMock.get.mockResolvedValue({ attributes: [ATTR] });
    apiMock.post.mockResolvedValue({ value: { id: "v2", name: "1-2 Years" } });
    render(<AttributesPage />);
    await screen.findByText("Age Group");
    fireEvent.change(screen.getByLabelText(/new value name/i), { target: { value: "1-2 Years" } });
    fireEvent.click(screen.getByRole("button", { name: /add value/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/attributes/a/values", expect.objectContaining({ name: "1-2 Years" }), expect.any(Object)));
  });

  it("creates an attribute with a chosen displayType", async () => {
    apiMock.get.mockResolvedValue({ attributes: [] });
    apiMock.post.mockResolvedValue({ attribute: { id: "n", name: "Theme", displayType: "checkbox", values: [] } });
    render(<AttributesPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/new attribute name/i), { target: { value: "Theme" } });
    fireEvent.click(screen.getByRole("button", { name: /add attribute/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/attributes", expect.objectContaining({ name: "Theme", displayType: "checkbox" }), expect.any(Object)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- AttributesPage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the page**

```jsx
// apps/admin/src/pages/admin/catalog/AttributesPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { AttributeFilterView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "./DevicePreview.jsx";
import "./CatalogPage.css";

const BASE = "/api/admin/catalog/attributes";
const DISPLAY_TYPES = ["checkbox", "radio", "dropdown", "color", "button", "range"];

export default function AttributesPage() {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [displayType, setDisplayType] = useState("checkbox");
  const [valueName, setValueName] = useState("");
  const [err, setErr] = useState(null);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiClient.get(BASE, auth());
      const attrs = res?.attributes ?? [];
      setList(attrs);
      setSelectedId((cur) => cur ?? attrs[0]?.id ?? null);
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load attributes."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addAttribute() {
    if (!name.trim()) return;
    setErr(null);
    try { const r = await apiClient.post(BASE, { name: name.trim(), displayType }, auth()); setName(""); setSelectedId(r?.attribute?.id ?? null); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create attribute."); }
  }

  async function addValue() {
    if (!selectedId || !valueName.trim()) return;
    setErr(null);
    try { await apiClient.post(`${BASE}/${selectedId}/values`, { name: valueName.trim() }, auth()); setValueName(""); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not add value."); }
  }

  async function setType(id, type) {
    try { await apiClient.put(`${BASE}/${id}`, { displayType: type }, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not update."); }
  }

  if (list === null) return <p className="catalog-page__status">Loading…</p>;
  const selected = list.find((a) => a.id === selectedId) || list[0] || null;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Attributes</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><AttributeFilterView attribute={selected} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add attribute</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>New attribute name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="catalog-page__field"><span>Display type</span>
            <select value={displayType} onChange={(e) => setDisplayType(e.target.value)}>
              {DISPLAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <button type="button" onClick={addAttribute}>Add attribute</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Attributes</h2>
        <ul className="catalog-page__list">
          {list.map((a) => (
            <li key={a.id} className="catalog-page__row">
              <button type="button" className="catalog-page__row-name" onClick={() => setSelectedId(a.id)}>{a.name}</button>
              <span className="catalog-page__row-actions">
                <select aria-label={`Display type for ${a.name}`} value={a.displayType} onChange={(e) => setType(a.id, e.target.value)}>
                  {DISPLAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="catalog-page__count">{a.values?.length || 0} values</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="catalog-card">
          <h2>Values — {selected.name}</h2>
          <div className="catalog-page__add">
            <label className="catalog-page__field"><span>New value name</span>
              <input type="text" value={valueName} onChange={(e) => setValueName(e.target.value)} /></label>
            <button type="button" onClick={addValue}>Add value</button>
          </div>
          <ul className="catalog-page__list">
            {(selected.values ?? []).map((v) => (
              <li key={v.id} className="catalog-page__row"><span>{v.name}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- AttributesPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/admin/catalog/AttributesPage.jsx apps/admin/src/pages/admin/catalog/AttributesPage.test.jsx
git commit -m "feat(admin): add Attributes management page with inline values"
```

---

## Task 25: Admin Catalog nav group + routes

**Files:**
- Modify: `apps/admin/src/components/AdminLayout.jsx` (add `IconCatalog` + a Catalog `NAV_ITEMS` group)
- Modify: `apps/admin/src/App.jsx` (add `/admin/catalog/*` routes)
- Test: `apps/admin/src/pages/admin/catalog/CatalogRouting.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/CatalogRouting.test.jsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../../App.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn(), isAuthenticated: () => true, clearToken: vi.fn(), ADMIN_UNAUTHORIZED_EVENT: "x" }));

beforeEach(() => { apiMock.get.mockResolvedValue({ categories: [], collections: [], attributes: [] }); });

describe("catalog routing", () => {
  it("renders the Categories page at /admin/catalog/categories", async () => {
    render(<MemoryRouter initialEntries={["/admin/catalog/categories"]}><AppRoutes /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Categories" })).toBeInTheDocument());
  });

  it("renders the Attributes page at /admin/catalog/attributes", async () => {
    render(<MemoryRouter initialEntries={["/admin/catalog/attributes"]}><AppRoutes /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Attributes" })).toBeInTheDocument());
  });
});
```

(If `RequireAdminAuth` blocks rendering in tests, mirror how `ContentRouting.test.jsx` mocks
auth — match that file's mock shape exactly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- CatalogRouting`
Expected: FAIL — no route renders the Categories heading.

- [ ] **Step 3: Add the routes in `apps/admin/src/App.jsx`**

Add imports near the other page imports:

```jsx
import CategoriesPage from "./pages/admin/catalog/CategoriesPage.jsx";
import CollectionsPage from "./pages/admin/catalog/CollectionsPage.jsx";
import AttributesPage from "./pages/admin/catalog/AttributesPage.jsx";
```

Inside the guarded routes (e.g. directly before the `content` route), add:

```jsx
          <Route path="catalog">
            <Route index element={<Navigate to="categories" replace />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="attributes" element={<AttributesPage />} />
          </Route>
```

- [ ] **Step 4: Add the sidebar group in `apps/admin/src/components/AdminLayout.jsx`**

Add an icon component near the other `Icon*` functions:

```jsx
function IconCatalog() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4 7v10l8 4 8-4V7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 11v10" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
```

Add this group to the `NAV_ITEMS` array, immediately before the existing `Content` group:

```jsx
  {
    label: "Catalog",
    Icon: IconCatalog,
    basePath: "/admin/catalog",
    children: [
      { to: "/admin/catalog/categories", label: "Categories" },
      { to: "/admin/catalog/collections", label: "Collections" },
      { to: "/admin/catalog/attributes", label: "Attributes" },
    ],
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- CatalogRouting`
Expected: PASS (2 tests). Run the AdminLayout test if one exists to confirm no nav regression.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/App.jsx apps/admin/src/components/AdminLayout.jsx apps/admin/src/pages/admin/catalog/CatalogRouting.test.jsx
git commit -m "feat(admin): add Catalog sidebar group + routes"
```

---

## Task 26: Product editor taxonomy assignment

Delivered as a self-contained, controlled `TaxonomyAssignment` component (fully tested),
then wired into the existing product form.

**Files:**
- Create: `apps/admin/src/pages/admin/catalog/TaxonomyAssignment.jsx`
- Test: `apps/admin/src/pages/admin/catalog/TaxonomyAssignment.test.jsx`
- Modify: `apps/admin/src/pages/admin/ProductsPage.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/TaxonomyAssignment.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import TaxonomyAssignment from "./TaxonomyAssignment.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function mockCatalog() {
  apiMock.get.mockImplementation((path) => {
    if (path.includes("/categories")) return Promise.resolve({ categories: [{ id: "c1", name: "Toys", children: [] }] });
    if (path.includes("/collections")) return Promise.resolve({ collections: [{ id: "k1", name: "Sale" }] });
    if (path.includes("/attributes")) return Promise.resolve({ attributes: [{ id: "a1", name: "Age", values: [{ id: "v1", name: "0-12" }] }] });
    return Promise.resolve({});
  });
}

describe("TaxonomyAssignment", () => {
  it("renders fetched categories, collections, and attribute values", async () => {
    mockCatalog();
    render(<TaxonomyAssignment value={{ categoryIds: [], collectionIds: [], attributeValueIds: [] }} onChange={() => {}} />);
    expect(await screen.findByLabelText("Toys")).toBeInTheDocument();
    expect(screen.getByLabelText("Sale")).toBeInTheDocument();
    expect(screen.getByLabelText("0-12")).toBeInTheDocument();
  });

  it("emits the updated id set when a box is toggled", async () => {
    mockCatalog();
    const onChange = vi.fn();
    render(<TaxonomyAssignment value={{ categoryIds: [], collectionIds: [], attributeValueIds: [] }} onChange={onChange} />);
    fireEvent.click(await screen.findByLabelText("Toys"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: ["c1"] })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- TaxonomyAssignment`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component**

```jsx
// apps/admin/src/pages/admin/catalog/TaxonomyAssignment.jsx
import { useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";

/** Flatten a category tree into [{id, name}] (indented by depth). */
function flattenCats(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ id: n.id, name: `${"— ".repeat(depth)}${n.name}` });
    if (n.children?.length) flattenCats(n.children, depth + 1, out);
  }
  return out;
}

/**
 * Controlled taxonomy picker for the product editor. `value` is
 * { categoryIds, collectionIds, attributeValueIds }; `onChange` receives the next
 * value whenever a checkbox toggles. Fetches catalog options on mount.
 */
export default function TaxonomyAssignment({ value, onChange }) {
  const [cats, setCats] = useState([]);
  const [cols, setCols] = useState([]);
  const [attrs, setAttrs] = useState([]);
  const auth = () => ({ token: getToken() });

  useEffect(() => {
    (async () => {
      try {
        const [c, k, a] = await Promise.all([
          apiClient.get("/api/admin/catalog/categories", auth()),
          apiClient.get("/api/admin/catalog/collections", auth()),
          apiClient.get("/api/admin/catalog/attributes", auth()),
        ]);
        setCats(flattenCats(c?.categories ?? []));
        setCols((k?.collections ?? []).map((x) => ({ id: x.id, name: x.name })));
        setAttrs(a?.attributes ?? []);
      } catch (e) { if (e instanceof ApiError && e.status === 401) notifyUnauthorized(); }
    })();
  }, []);

  const toggle = (field, id) => {
    const set = new Set(value[field] ?? []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ ...value, [field]: Array.from(set) });
  };

  const box = (field, id, name) => (
    <label key={id} className="taxonomy__opt">
      <input type="checkbox" checked={(value[field] ?? []).includes(id)} onChange={() => toggle(field, id)} /> {name}
    </label>
  );

  return (
    <div className="taxonomy">
      <fieldset className="taxonomy__group"><legend>Categories</legend>{cats.map((c) => box("categoryIds", c.id, c.name))}</fieldset>
      <fieldset className="taxonomy__group"><legend>Collections</legend>{cols.map((c) => box("collectionIds", c.id, c.name))}</fieldset>
      <fieldset className="taxonomy__group"><legend>Attributes</legend>
        {attrs.map((a) => (
          <div key={a.id} className="taxonomy__attr"><span className="taxonomy__attr-name">{a.name}</span>
            {(a.values ?? []).map((v) => box("attributeValueIds", v.id, v.name))}</div>
        ))}
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- TaxonomyAssignment`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into the product form**

Open `apps/admin/src/pages/admin/ProductsPage.jsx`. Then:
1. Add the import: `import TaxonomyAssignment from "./catalog/TaxonomyAssignment.jsx";`
2. Locate the product create/edit form's local state object (the one holding `name`, `price`,
   `images`, etc.). Add three fields initialised from the product being edited:
   `categoryIds: product?.categoryIds ?? []`, `collectionIds: product?.collectionIds ?? []`,
   `attributeValueIds: product?.attributeValueIds ?? []`.
3. Render the picker inside the form (e.g. after the images section):

```jsx
<TaxonomyAssignment
  value={{ categoryIds: form.categoryIds, collectionIds: form.collectionIds, attributeValueIds: form.attributeValueIds }}
  onChange={(next) => setForm((f) => ({ ...f, ...next }))}
/>
```

4. Ensure the create/update request body includes `categoryIds`, `collectionIds`,
   `attributeValueIds` from the form state (they pass through `WRITABLE_FIELDS` added in Task 12).

(Use the actual state setter/name from the file — it may be `setForm`, `setDraft`, etc.
Match the existing identifiers.)

- [ ] **Step 6: Run the existing ProductsPage test**

Run: `npm test --workspace @planet-of-toys/admin -- ProductsPage`
Expected: PASS (the picker fetches on mount; if the existing test does not mock
`apiClient.get` for the catalog paths, the calls reject harmlessly and are caught — confirm no
test breaks. If a test asserts on exact `get` call counts, update it to tolerate the catalog
fetches.)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/pages/admin/catalog/TaxonomyAssignment.jsx apps/admin/src/pages/admin/catalog/TaxonomyAssignment.test.jsx apps/admin/src/pages/admin/ProductsPage.jsx
git commit -m "feat(admin): assign categories/collections/attributes to products"
```

---

## Task 27: Storefront `/collections/:slug` proof

**Files:**
- Create: `apps/client/src/pages/CollectionPage.jsx`
- Test: `apps/client/src/pages/CollectionPage.test.jsx`
- Modify: `apps/client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/pages/CollectionPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CollectionPage from "./CollectionPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function renderAt(slug) {
  return render(
    <MemoryRouter initialEntries={[`/collections/${slug}`]}>
      <Routes><Route path="/collections/:slug" element={<CollectionPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("CollectionPage", () => {
  it("fetches and renders the collection with products", async () => {
    apiMock.get.mockResolvedValue({
      collection: { id: "c", name: "STEM Toys", heroTitle: "Learn by Play" },
      products: [{ id: "p", slug: "blocks", name: "Blocks", price: 499, images: [] }],
    });
    renderAt("stem-toys");
    expect(await screen.findByText("Learn by Play")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/api/catalog/collections/stem-toys");
  });

  it("shows a not-found message on 404", async () => {
    const err = Object.assign(new Error("nf"), { status: 404 });
    apiMock.get.mockRejectedValue(err);
    renderAt("missing");
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- CollectionPage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the page**

```jsx
// apps/client/src/pages/CollectionPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import "@planet-of-toys/shared-web/catalog/catalog-views.css";

/**
 * Storefront collection page — the Sub-project A proof. Fetches the public
 * collection by slug and renders it via the SAME shared CollectionView used in the
 * admin live preview. Product grid + working filters arrive in Sub-project B.
 */
export default function CollectionPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: "loading", collection: null, products: [] });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", collection: null, products: [] });
    apiClient.get(`/api/catalog/collections/${slug}`)
      .then((res) => { if (active) setState({ status: "ready", collection: res.collection, products: res.products ?? [] }); })
      .catch((e) => { if (active) setState({ status: e?.status === 404 ? "notfound" : "error", collection: null, products: [] }); });
    return () => { active = false; };
  }, [slug]);

  if (state.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (state.status === "notfound") return <p className="collection-page__status">Collection not found.</p>;
  if (state.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  return (
    <main className="collection-page">
      <CollectionView
        collection={state.collection}
        products={state.products}
        resolveImageUrl={(f) => mediaUrl(f)}
        formatPrice={(n) => formatINR(n)}
      />
    </main>
  );
}
```

- [ ] **Step 4: Add the route in `apps/client/src/App.jsx`**

Add the import:

```jsx
import CollectionPage from "./pages/CollectionPage.jsx";
```

Add inside the `<Route element={<CustomerLayout />}>` block (near the catalogue routes):

```jsx
        <Route path="collections/:slug" element={<CollectionPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- CollectionPage`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/pages/CollectionPage.jsx apps/client/src/pages/CollectionPage.test.jsx apps/client/src/App.jsx
git commit -m "feat(client): add /collections/:slug storefront proof"
```

---

## Task 28: Catalog seed script

**Files:**
- Create: `server/src/scripts/seed-catalog.js`
- Modify: `server/package.json` (add `seed:catalog` script)

- [ ] **Step 1: Write the seed script**

```js
// server/src/scripts/seed-catalog.js
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../shared/config/database.js";
import * as categories from "../modules/catalog/category.service.js";
import * as collections from "../modules/catalog/collection.service.js";
import * as attributes from "../modules/catalog/attribute.service.js";
import Category from "../modules/catalog/category.model.js";
import Collection from "../modules/catalog/collection.model.js";
import Attribute from "../modules/catalog/attribute.model.js";

/**
 * Seed sample Planet of Toys catalog taxonomy: a few categories, collections,
 * and attributes-with-values. Everything is editable afterwards in Admin →
 * Catalog. Skips entities that already exist (by slug) so re-running is safe.
 *
 * Run from the server workspace so dotenv picks up server/.env:
 *   npm run seed:catalog --workspace=server
 */

const CATEGORIES = ["Educational Toys", "Building Blocks", "Arts & Crafts", "Puzzles", "Outdoor Toys", "Pretend Play", "Board Games"];
const COLLECTIONS = ["New Arrivals", "Best Sellers", "STEM Toys", "Birthday Gifts", "Eco Friendly Toys"];
const ATTRIBUTES = [
  { name: "Age Group", displayType: "checkbox", values: ["0-12 Months", "1-2 Years", "2-4 Years", "5-8 Years", "8+ Years"] },
  { name: "Skill Development", displayType: "checkbox", values: ["Creativity", "Motor Skills", "Problem Solving", "STEM Learning", "Language Skills"] },
  { name: "Theme", displayType: "checkbox", values: ["Animals", "Vehicles", "Space", "Nature"] },
  { name: "Price", displayType: "range", values: [] },
];

async function ensureCategory(name) {
  if (await Category.exists({ name })) return;
  await categories.createCategory({ name });
}
async function ensureCollection(name) {
  if (await Collection.exists({ name })) return;
  await collections.createCollection({ name });
}
async function ensureAttribute({ name, displayType, values }) {
  let attr = await Attribute.findOne({ name });
  if (!attr) attr = { id: (await attributes.createAttribute({ name, displayType })).id };
  for (const v of values) await attributes.addValue(attr.id, { name: v });
}

async function main() {
  await connectDatabase();
  try {
    for (const c of CATEGORIES) await ensureCategory(c);
    for (const k of COLLECTIONS) await ensureCollection(k);
    for (const a of ATTRIBUTES) await ensureAttribute(a);
    // eslint-disable-next-line no-console
    console.log("Catalog seed complete.");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `server/package.json`, add to `scripts` after the `seed:footer` line (with a comma):

```json
    "seed:catalog": "node src/scripts/seed-catalog.js"
```

- [ ] **Step 3: Verify it loads (no DB write needed for the smoke check)**

Run: `node -e "import('./server/src/scripts/seed-catalog.js').catch(e=>{if(String(e).includes('connect')||String(e).includes('Mongo')){console.log('loads ok');process.exit(0)}console.error(e);process.exit(1)})"`
Expected: prints `loads ok` (it fails only at DB connect, proving the module imports cleanly).
If a Mongo instance is configured via `MONGODB_URI`, instead run `npm run seed:catalog --workspace=server` and confirm "Catalog seed complete."

- [ ] **Step 4: Commit**

```bash
git add server/src/scripts/seed-catalog.js server/package.json
git commit -m "feat(catalog): add catalog seed script"
```

---

## Task 29: Full-suite verification + final review

**Files:** none (verification only).

- [ ] **Step 1: Run every workspace test suite**

```bash
npm test --workspace server
npm test --workspace @planet-of-toys/shared-web
npm test --workspace @planet-of-toys/admin
npm test --workspace @planet-of-toys/client
```
Expected: all green. Fix any regressions before proceeding.

- [ ] **Step 2: Manual smoke (optional, if a dev DB is available)**

Start the server + admin + client; in Admin → Catalog create a category, a collection
(toggle "Home"/"Nav", upload a hero), and an attribute with values; confirm the live
desktop/mobile previews update without saving. Visit `/collections/<slug>` on the storefront
and confirm `CollectionView` renders the same layout.

- [ ] **Step 3: Dispatch the final code reviewer**

Use superpowers:requesting-code-review for the whole branch diff against `main` to confirm:
no Brands module; archived records excluded from public APIs; media stored as filenames only;
NavigationItem foundation-only (no admin UI/storefront); `/collections/:slug` permanent URL;
bulk-assign uses `updateMany` + `$addToSet`/`$pull`; preview uses the shared View components.

---

## Plan Self-Review

**Spec coverage:** Category (T1,8), Collection (T2,9,14), Attribute (T3,10), AttributeValue (T4,10), NavigationItem foundation (T5,11), archive/restore + guards (T8–11), media-as-filename (T22,23 uploads; views resolveImageUrl), bulk-assign updateMany/$addToSet/$pull (T13), product integration (T7,12,26), admin Catalog IA + inline values (T22–25), live preview with shared components + real responsive (T18–24), shared View architecture (T18–20), storefront `/collections/:slug` proof (T27), seed (T28), no Brands (T28 omits brand; reviewer check T29). All §1–§9 spec items map to a task.

**Placeholder scan:** No TBD/TODO. The two "read the file then wire" steps (T26 ProductsPage, T17/T25 insertions) name exact identifiers/anchors and show the exact code to add — they are integration instructions into files too large to reproduce, not placeholders.

**Type/name consistency:** Service function names used by the controller (T14) match their definitions (T8–11,13): `listCategoryTree`, `getCategoryBySlug`, `getPublicCollectionBySlug`, `getCollectionProducts`, `listPublicAttributes`, `addValue`, `bulkAssign`. API field names (`categoryIds`/`collectionIds`/`attributeValueIds`) are identical across product model (T7), product service (T12), bulk-assign (T13), and TaxonomyAssignment (T26). Route paths match `ROUTER_MOUNTS` (T17) and the routers (T15,16). View prop names (`categories`, `collection`, `products`, `attribute`, `resolveImageUrl`, `formatPrice`) match between components (T18–20) and consumers (T22–24,27).

**Ordering:** Product model extension (T7) precedes the services whose guard tests create Products with taxonomy fields (T8–10). Views (T18–20) precede the admin pages and storefront that import them (T21–27). Pages (T22–24) precede routing (T25).
