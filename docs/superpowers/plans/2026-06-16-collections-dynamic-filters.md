# Collections + Dynamic Filters (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real collection browse pages — dynamic filters generated from Attributes/AttributeValues, per-collection filter configuration as the source of truth, product grid + sorting + page-based pagination, and URL-driven filter state — with shared storefront/admin preview components.

**Architecture:** Extends the existing `server/src/modules/catalog/` module (CollectionFilterConfig model + filter-config service + filter-definition resolver + product query service + public/admin routes) and `packages/shared-web/src/catalog/` (FilterView, ProductGrid, ProductCard, SortControl; AttributeFilterView made controlled). Storefront `/collections/:slug` gains a URL-driven browse region; the admin Collections page gains an embedded filter-config panel with live preview. Manual collection membership only; nothing hardcoded; archived excluded from public APIs.

**Tech Stack:** Node + Express + Mongoose (ESM), Vitest + mongodb-memory-server, React 18 + Vite + react-router-dom 6.30 (`useSearchParams`), Testing Library (jsdom), npm workspaces.

**Reference patterns (mirror exactly):**
- Catalog models/services/routers/tests from Sub-project A under `server/src/modules/catalog/` (e.g. `collection.service.js`, `catalog.controller.js`, `catalog.public.router.js`, `catalog.admin.router.js`, `catalog.public.router.test.js`).
- `CatalogValidationError` in `server/src/modules/catalog/catalog.errors.js` (extends AppError → messages surface).
- Shared View contract: `packages/shared-web/src/catalog/CollectionView.jsx` + `AttributeFilterView.jsx`; barrel `packages/shared-web/src/catalog/index.js`; main barrel `packages/shared-web/src/index.js`; shared CSS `packages/shared-web/src/catalog/catalog-views.css`.
- Storefront page + fetch: `apps/client/src/pages/CollectionPage.jsx`.
- Admin page + preview: `apps/admin/src/pages/admin/catalog/CollectionsPage.jsx` + `DevicePreview.jsx`.

**Conventions:** server tests `npm test --workspace server -- <file>`; shared-web `npm test --workspace @planet-of-toys/shared-web -- <file>`; admin `npm test --workspace @planet-of-toys/admin -- <file>`; client `npm test --workspace @planet-of-toys/client -- <file>`. Commit per task with the message shown; `git add` only the listed files (never `git add -A`). CRLF warnings on commit are normal.

**Vocabulary note:** resolved filter definitions use `type: "attribute" | "price" | "category"` (the same vocabulary as config entries). The price filter renders as a numeric range; the category filter renders as a flat option list.

---

## File Structure

**Server — `server/src/modules/catalog/` (new):**
- `collectionFilterConfig.model.js` — per-collection config (filters[] of {type, attributeId, enabled, sortOrder}).
- `filterConfig.service.js` — get-with-synthesized-default + save/replace.
- `filterResolver.service.js` — config → resolved display-ready filter definitions (attribute values, price min/max, category options).
- `collectionQuery.service.js` — filter + sort + paginate a collection's active products; slug→id resolution; `SORT_SPECS`.
- `*.test.js` beside each.

**Server — modified:**
- `server/src/modules/products/product.model.js` — add `salesCount`, `isFeatured`, `merchandisingRank`.
- `server/src/modules/catalog/catalog.controller.js` — add `collectionFilters`, `collectionProducts`, `getFilterConfig`, `putFilterConfig`.
- `server/src/modules/catalog/catalog.public.router.js` — `GET /collections/:slug/filters`, `GET /collections/:slug/products`.
- `server/src/modules/catalog/catalog.admin.router.js` — `GET/PUT /collections/:id/filter-config`.
- `server/src/models/index.js` — register `CollectionFilterConfig`.

**Shared — `packages/shared-web/src/catalog/` (new/modified):**
- `ProductCard.jsx` (new), `ProductGrid.jsx` (new), `SortControl.jsx` (new), `FilterView.jsx` (new), `filterParams.js` (new: pure parse/serialize) + tests.
- `AttributeFilterView.jsx` — extended to controlled (back-compatible).
- `CollectionView.jsx` — refactored to render via `ProductCard`.
- `index.js` (barrel) + `packages/shared-web/src/index.js` — export new components.
- `catalog-views.css` — add filter/grid/sort styles.

**Client — modified:**
- `apps/client/src/pages/CollectionPage.jsx` — add URL-driven browse region (FilterView + ProductGrid + SortControl + pagination) + `CollectionPage.css`.
- `apps/client/src/hooks/useFilterState.js` (new) — `useSearchParams` wrapper over `filterParams.js`.

**Admin — modified:**
- `apps/admin/src/pages/admin/catalog/CollectionsPage.jsx` — embedded filter-config panel + live `FilterView` preview.

---

## Task 1: CollectionFilterConfig model

**Files:**
- Create: `server/src/modules/catalog/collectionFilterConfig.model.js`
- Test: `server/src/modules/catalog/collectionFilterConfig.model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/collectionFilterConfig.model.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await CollectionFilterConfig.deleteMany({}); });

describe("CollectionFilterConfig model", () => {
  it("stores filters and maps ids; defaults enabled true", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const attributeId = new mongoose.Types.ObjectId();
    const doc = await CollectionFilterConfig.create({
      collectionId,
      filters: [{ type: "attribute", attributeId, sortOrder: 0 }, { type: "price", sortOrder: 1 }],
    });
    const json = doc.toJSON();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
    expect(json.filters[0].enabled).toBe(true);
    expect(json.filters[0].type).toBe("attribute");
    expect(String(json.filters[0].attributeId)).toBe(String(attributeId));
    expect(json.deletedAt).toBeNull();
  });

  it("rejects an invalid filter type", async () => {
    await expect(CollectionFilterConfig.create({
      collectionId: new mongoose.Types.ObjectId(),
      filters: [{ type: "bogus" }],
    })).rejects.toThrow();
  });

  it("enforces one config per collection", async () => {
    await CollectionFilterConfig.syncIndexes();
    const collectionId = new mongoose.Types.ObjectId();
    await CollectionFilterConfig.create({ collectionId, filters: [] });
    await expect(CollectionFilterConfig.create({ collectionId, filters: [] })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- collectionFilterConfig.model.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the model**

```js
// server/src/modules/catalog/collectionFilterConfig.model.js
import mongoose from "mongoose";

/**
 * CollectionFilterConfig — the per-collection source of truth for which filters
 * appear on its storefront page, and in what order. Each entry is an
 * attribute-driven filter (type "attribute" + attributeId) or a built-in
 * ("price" / "category"). Absent config ⇒ the service synthesizes a default
 * (all active filterable attributes + price). One config per collection.
 */
const { Schema } = mongoose;

const filterEntrySchema = new Schema(
  {
    type: { type: String, enum: ["attribute", "price", "category"], required: true },
    attributeId: { type: Schema.Types.ObjectId, ref: "Attribute", default: null },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const collectionFilterConfigSchema = new Schema(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", required: true, unique: true, index: true },
    filters: { type: [filterEntrySchema], default: [] },
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

const CollectionFilterConfig =
  mongoose.models.CollectionFilterConfig ||
  mongoose.model("CollectionFilterConfig", collectionFilterConfigSchema);
export default CollectionFilterConfig;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- collectionFilterConfig.model.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/collectionFilterConfig.model.js server/src/modules/catalog/collectionFilterConfig.model.test.js
git commit -m "feat(catalog): add CollectionFilterConfig model"
```

---

## Task 2: Product merchandising + best-selling fields

**Files:**
- Modify: `server/src/modules/products/product.model.js` (after the `attributeValueIds` field added in Sub-project A)
- Modify: `server/src/models/index.js` (register CollectionFilterConfig)
- Test: `server/src/modules/products/product.merchandising.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/products/product.merchandising.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Product from "./product.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Product.deleteMany({}); });

describe("Product merchandising fields", () => {
  it("defaults salesCount=0, isFeatured=false, merchandisingRank=0", async () => {
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1 })).toJSON();
    expect(json.salesCount).toBe(0);
    expect(json.isFeatured).toBe(false);
    expect(json.merchandisingRank).toBe(0);
  });

  it("persists provided merchandising values", async () => {
    const json = (await Product.create({ name: "P", slug: "p", price: 10, stock: 1, salesCount: 5, isFeatured: true, merchandisingRank: 3 })).toJSON();
    expect(json.salesCount).toBe(5);
    expect(json.isFeatured).toBe(true);
    expect(json.merchandisingRank).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- product.merchandising.test.js`
Expected: FAIL — fields are `undefined` (dropped by strict mode).

- [ ] **Step 3: Add the fields to the schema**

In `server/src/modules/products/product.model.js`, immediately after the
`attributeValueIds: { ... },` line (added in Sub-project A), add:

```js
    // Merchandising + best-selling (Sub-project B). salesCount drives the
    // best-selling sort and is manually editable now; a future order-analytics
    // pipeline can populate it without changing the sort layer. isFeatured /
    // merchandisingRank are foundation for homepage merchandising (Sub-project E).
    salesCount: { type: Number, default: 0, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    merchandisingRank: { type: Number, default: 0, index: true },
```

- [ ] **Step 4: Register CollectionFilterConfig in the registry**

Append to `server/src/models/index.js`:

```js
export { default as CollectionFilterConfig } from "../modules/catalog/collectionFilterConfig.model.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- product.merchandising.test.js`
Expected: PASS (2 tests). Also run `npm test --workspace server -- product.model product.taxonomy` and confirm no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/products/product.model.js server/src/models/index.js server/src/modules/products/product.merchandising.test.js
git commit -m "feat(products): add salesCount + merchandising fields"
```

---

## Task 3: Filter-config service (get-with-default, save)

**Files:**
- Create: `server/src/modules/catalog/filterConfig.service.js`
- Test: `server/src/modules/catalog/filterConfig.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/filterConfig.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";
import * as svc from "./filterConfig.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await CollectionFilterConfig.deleteMany({}); });

describe("filterConfig.service", () => {
  it("synthesizes a default (all filterable attributes + price) when none stored", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const a = await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox", sortOrder: 0 });
    await Attribute.create({ name: "Hidden", slug: "hidden", displayType: "checkbox", isFilterable: false });
    const cfg = await svc.getFilterConfig(collectionId);
    expect(cfg.isDefault).toBe(true);
    expect(cfg.filters.map((f) => f.type)).toEqual(["attribute", "price"]);
    expect(String(cfg.filters[0].attributeId)).toBe(String(a.id));
  });

  it("saves then returns the stored config (not default)", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const a = await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox" });
    await svc.saveFilterConfig(collectionId, [
      { type: "attribute", attributeId: a.id, enabled: true, sortOrder: 0 },
      { type: "category", enabled: false, sortOrder: 1 },
    ]);
    const cfg = await svc.getFilterConfig(collectionId);
    expect(cfg.isDefault).toBe(false);
    expect(cfg.filters).toHaveLength(2);
    expect(cfg.filters[1].type).toBe("category");
  });

  it("rejects an attribute entry with no attributeId", async () => {
    await expect(svc.saveFilterConfig(new mongoose.Types.ObjectId(), [{ type: "attribute", sortOrder: 0 }]))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- filterConfig.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/filterConfig.service.js
import Attribute from "./attribute.model.js";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";
import { CatalogValidationError } from "./catalog.errors.js";

const TYPES = ["attribute", "price", "category"];

/** Build the synthesized default: all active filterable attributes (ordered) + price. */
async function defaultFilters() {
  const attrs = await Attribute.find({ isFilterable: true, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
  const filters = attrs.map((a, i) => ({ type: "attribute", attributeId: a._id, enabled: true, sortOrder: i }));
  filters.push({ type: "price", attributeId: null, enabled: true, sortOrder: filters.length });
  return filters;
}

/**
 * Resolve the stored config for a collection, or the synthesized default when
 * none exists. Returns { collectionId, filters, isDefault } with filters sorted.
 */
export async function getFilterConfig(collectionId) {
  const doc = await CollectionFilterConfig.findOne({ collectionId, deletedAt: null });
  if (doc) {
    const json = doc.toJSON();
    json.filters = [...json.filters].sort((x, y) => x.sortOrder - y.sortOrder);
    return { collectionId: String(collectionId), filters: json.filters, isDefault: false };
  }
  return { collectionId: String(collectionId), filters: await defaultFilters(), isDefault: true };
}

/** Validate + persist (replace) a collection's filter config. */
export async function saveFilterConfig(collectionId, filters) {
  if (!Array.isArray(filters)) throw new CatalogValidationError("filters must be an array.");
  const clean = filters.map((f, i) => {
    if (!TYPES.includes(f.type)) throw new CatalogValidationError(`Unknown filter type: ${f.type}.`);
    if (f.type === "attribute" && !f.attributeId) throw new CatalogValidationError("Attribute filters require an attributeId.");
    return {
      type: f.type,
      attributeId: f.type === "attribute" ? f.attributeId : null,
      enabled: f.enabled !== false,
      sortOrder: Number(f.sortOrder) || i,
    };
  });
  const doc = await CollectionFilterConfig.findOneAndUpdate(
    { collectionId },
    { collectionId, filters: clean, deletedAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const json = doc.toJSON();
  json.filters = [...json.filters].sort((x, y) => x.sortOrder - y.sortOrder);
  return { collectionId: String(collectionId), filters: json.filters, isDefault: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- filterConfig.service.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/filterConfig.service.js server/src/modules/catalog/filterConfig.service.test.js
git commit -m "feat(catalog): add filter-config service"
```

---

## Task 4: Filter-definition resolver service

**Files:**
- Create: `server/src/modules/catalog/filterResolver.service.js`
- Test: `server/src/modules/catalog/filterResolver.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/filterResolver.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import * as cfg from "./filterConfig.service.js";
import { resolveFilters } from "./filterResolver.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await Attribute.deleteMany({}); await AttributeValue.deleteMany({});
  await Category.deleteMany({}); await Product.deleteMany({});
});

describe("resolveFilters", () => {
  it("resolves attribute + price definitions (default config)", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const attr = await Attribute.create({ name: "Age Group", slug: "age-group", displayType: "checkbox" });
    await AttributeValue.create({ attributeId: attr._id, name: "0-12 Months", slug: "0-12-months" });
    await Product.create({ name: "P", slug: "p", price: 300, stock: 1, active: true, collectionIds: [collectionId] });
    await Product.create({ name: "Q", slug: "q", price: 900, stock: 1, active: true, collectionIds: [collectionId] });
    const defs = await resolveFilters(collectionId);
    const age = defs.find((d) => d.type === "attribute");
    expect(age.key).toBe("f_age-group");
    expect(age.displayType).toBe("checkbox");
    expect(age.values.map((v) => v.slug)).toEqual(["0-12-months"]);
    const price = defs.find((d) => d.type === "price");
    expect(price).toMatchObject({ key: "price", type: "price", min: 300, max: 900 });
  });

  it("includes a category definition when configured, with options from the collection's products", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    const cat = await Category.create({ name: "Blocks", slug: "blocks" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, active: true, collectionIds: [collectionId], categoryIds: [cat._id] });
    await cfg.saveFilterConfig(collectionId, [{ type: "category", enabled: true, sortOrder: 0 }]);
    const defs = await resolveFilters(collectionId);
    const category = defs.find((d) => d.type === "category");
    expect(category.options.map((o) => o.slug)).toEqual(["blocks"]);
  });

  it("omits disabled entries", async () => {
    const collectionId = new mongoose.Types.ObjectId();
    await cfg.saveFilterConfig(collectionId, [{ type: "price", enabled: false, sortOrder: 0 }]);
    const defs = await resolveFilters(collectionId);
    expect(defs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- filterResolver.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/filterResolver.service.js
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import { getFilterConfig } from "./filterConfig.service.js";

/** Min/max product price within a collection's active products (0/0 if empty). */
async function priceRange(collectionId) {
  const rows = await Product.aggregate([
    { $match: { collectionIds: new (Product.base.Types.ObjectId)(String(collectionId)), active: true } },
    { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
  ]);
  if (!rows.length) return { min: 0, max: 0 };
  return { min: rows[0].min ?? 0, max: rows[0].max ?? 0 };
}

/** Distinct category options among a collection's active products. */
async function categoryOptions(collectionId) {
  const ids = await Product.distinct("categoryIds", { collectionIds: collectionId, active: true });
  if (!ids.length) return [];
  const cats = await Category.find({ _id: { $in: ids }, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
  return cats.map((c) => ({ slug: c.slug, name: c.name }));
}

/**
 * Turn a collection's filter config (or synthesized default) into display-ready
 * filter definitions for the storefront. Only enabled entries; attribute values
 * pulled live. Attribute entries whose attribute is missing/archived are skipped.
 *
 * @returns {Array<object>} definitions:
 *   attribute → { key:"f_<slug>", type:"attribute", attributeSlug, name, displayType, values:[{slug,name,swatchHex}] }
 *   price     → { key:"price", type:"price", min, max }
 *   category  → { key:"category", type:"category", options:[{slug,name}] }
 */
export async function resolveFilters(collectionId) {
  const { filters } = await getFilterConfig(collectionId);
  const enabled = filters.filter((f) => f.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
  const defs = [];
  for (const f of enabled) {
    if (f.type === "attribute") {
      // eslint-disable-next-line no-await-in-loop
      const attr = await Attribute.findOne({ _id: f.attributeId, isActive: true, deletedAt: null });
      if (!attr) continue;
      // eslint-disable-next-line no-await-in-loop
      const values = await AttributeValue.find({ attributeId: attr._id, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
      defs.push({
        key: `f_${attr.slug}`, type: "attribute", attributeSlug: attr.slug, name: attr.name,
        displayType: attr.displayType,
        values: values.map((v) => ({ slug: v.slug, name: v.name, swatchHex: v.swatchHex ?? null })),
      });
    } else if (f.type === "price") {
      // eslint-disable-next-line no-await-in-loop
      const { min, max } = await priceRange(collectionId);
      defs.push({ key: "price", type: "price", min, max });
    } else if (f.type === "category") {
      // eslint-disable-next-line no-await-in-loop
      const options = await categoryOptions(collectionId);
      defs.push({ key: "category", type: "category", options });
    }
  }
  return defs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- filterResolver.service.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/filterResolver.service.js server/src/modules/catalog/filterResolver.service.test.js
git commit -m "feat(catalog): add filter-definition resolver service"
```

---

## Task 5: Collection product query service (filter + sort + paginate)

**Files:**
- Create: `server/src/modules/catalog/collectionQuery.service.js`
- Test: `server/src/modules/catalog/collectionQuery.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/collectionQuery.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { queryCollectionProducts, SORT_SPECS } from "./collectionQuery.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await Collection.deleteMany({}); await Attribute.deleteMany({});
  await AttributeValue.deleteMany({}); await Product.deleteMany({});
});

async function seed() {
  const col = await Collection.create({ name: "STEM", slug: "stem" });
  const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
  const v1 = await AttributeValue.create({ attributeId: attr._id, name: "0-12", slug: "0-12" });
  const v2 = await AttributeValue.create({ attributeId: attr._id, name: "1-2", slug: "1-2" });
  await Product.create({ name: "Cheap", slug: "cheap", price: 100, stock: 1, active: true, collectionIds: [col._id], attributeValueIds: [v1._id] });
  await Product.create({ name: "Mid", slug: "mid", price: 500, stock: 1, active: true, collectionIds: [col._id], attributeValueIds: [v2._id] });
  await Product.create({ name: "Pricey", slug: "pricey", price: 900, stock: 1, active: true, collectionIds: [col._id], attributeValueIds: [v1._id] });
  await Product.create({ name: "Other", slug: "other", price: 50, stock: 1, active: true }); // not in collection
  return { col };
}

describe("queryCollectionProducts", () => {
  it("returns null for an unknown/archived collection slug", async () => {
    expect(await queryCollectionProducts("nope", {})).toBeNull();
  });

  it("returns the collection's active products, default featured sort", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", {});
    expect(res.total).toBe(3);
    expect(res.products.map((p) => p.slug).sort()).toEqual(["cheap", "mid", "pricey"]);
  });

  it("filters by attribute value slug (OR within attribute)", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", { "f_age": "0-12" });
    expect(res.products.map((p) => p.slug).sort()).toEqual(["cheap", "pricey"]);
  });

  it("filters by price range and sorts price-asc", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", { price: "100-500", sort: "price-asc" });
    expect(res.products.map((p) => p.slug)).toEqual(["cheap", "mid"]);
  });

  it("paginates with totals", async () => {
    await seed();
    const res = await queryCollectionProducts("stem", { sort: "price-asc", page: "2", limit: "2" });
    expect(res).toMatchObject({ page: 2, limit: 2, total: 3, pageCount: 2 });
    expect(res.products.map((p) => p.slug)).toEqual(["pricey"]);
  });

  it("exposes a SORT_SPECS map", () => {
    expect(Object.keys(SORT_SPECS)).toEqual(
      expect.arrayContaining(["featured", "newest", "price-asc", "price-desc", "name", "best-selling"])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- collectionQuery.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/collectionQuery.service.js
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";

/** Sort key → Mongo sort spec. Extensible: analytics later only fills salesCount. */
export const SORT_SPECS = Object.freeze({
  featured: { merchandisingRank: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  "price-asc": { price: 1 },
  "price-desc": { price: -1 },
  name: { name: 1 },
  "best-selling": { salesCount: -1, createdAt: -1 },
});

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/** Card projection exposed to the storefront grid. */
function toCard(doc) {
  const j = doc.toJSON();
  return { id: j.id, slug: j.slug, name: j.name, price: j.price, compareAtPrice: j.compareAtPrice,
    discountPercent: j.discountPercent, images: j.images };
}

/** Build the AND conditions from query params (attribute/price/category). */
async function buildConditions(query) {
  const and = [];
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith("f_") || !raw) continue;
    const attrSlug = key.slice(2);
    const valueSlugs = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    if (!valueSlugs.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const attr = await Attribute.findOne({ slug: attrSlug, deletedAt: null });
    if (!attr) continue;
    // eslint-disable-next-line no-await-in-loop
    const vals = await AttributeValue.find({ attributeId: attr._id, slug: { $in: valueSlugs }, deletedAt: null });
    const ids = vals.map((v) => v._id);
    if (ids.length) and.push({ attributeValueIds: { $in: ids } }); // OR within attribute
  }
  const priceMatch = /^(\d+)-(\d+)$/.exec(query.price || "");
  if (priceMatch) and.push({ price: { $gte: Number(priceMatch[1]), $lte: Number(priceMatch[2]) } });
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category, deletedAt: null });
    if (cat) and.push({ categoryIds: cat._id });
  }
  return and;
}

/**
 * Filter + sort + paginate a collection's manually-assigned active products.
 * Returns null when the slug does not resolve to an active collection.
 *
 * @param {string} slug collection slug
 * @param {Record<string,string>} query flat query params (f_<attrSlug>, price, category, sort, page, limit)
 */
export async function queryCollectionProducts(slug, query = {}) {
  const collection = await Collection.findOne({ slug, isActive: true, deletedAt: null });
  if (!collection) return null;

  const base = { collectionIds: collection._id, active: true };
  const and = await buildConditions(query);
  const filter = and.length ? { ...base, $and: and } : base;

  const sort = SORT_SPECS[query.sort] || SORT_SPECS.featured;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const total = await Product.countDocuments(filter);
  const docs = await Product.find(filter).sort(sort).skip(skip).limit(limit);
  return {
    products: docs.map(toCard),
    total,
    page,
    limit,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    appliedFilters: { sort: query.sort || "featured", page, limit },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- collectionQuery.service.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/collectionQuery.service.js server/src/modules/catalog/collectionQuery.service.test.js
git commit -m "feat(catalog): add collection product query service"
```

---

## Task 6: Controller + public filter/product routes

**Files:**
- Modify: `server/src/modules/catalog/catalog.controller.js` (add four handlers)
- Modify: `server/src/modules/catalog/catalog.public.router.js` (two routes)
- Test: `server/src/modules/catalog/catalog.public.filters.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.public.filters.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogPublicRouter } from "./catalog.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Collection from "./collection.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => {
  await Collection.deleteMany({}); await Attribute.deleteMany({});
  await AttributeValue.deleteMany({}); await Product.deleteMany({});
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", createCatalogPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/catalog` };
}

describe("public filters + products", () => {
  it("returns dynamic filters (default config) for a collection", async () => {
    const { server, base } = buildApp();
    try {
      const col = await Collection.create({ name: "STEM", slug: "stem" });
      const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
      await AttributeValue.create({ attributeId: attr._id, name: "0-12", slug: "0-12" });
      await Product.create({ name: "P", slug: "p", price: 200, stock: 1, active: true, collectionIds: [col._id] });
      const body = await (await fetch(`${base}/collections/stem/filters`)).json();
      const keys = body.filters.map((f) => f.key);
      expect(keys).toContain("f_age");
      expect(keys).toContain("price");
    } finally { server.close(); }
  });

  it("404s filters for an unknown collection", async () => {
    const { server, base } = buildApp();
    try { expect((await fetch(`${base}/collections/nope/filters`)).status).toBe(404); }
    finally { server.close(); }
  });

  it("returns a filtered, paginated product page", async () => {
    const { server, base } = buildApp();
    try {
      const col = await Collection.create({ name: "STEM", slug: "stem" });
      await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, collectionIds: [col._id] });
      await Product.create({ name: "B", slug: "b", price: 800, stock: 1, active: true, collectionIds: [col._id] });
      const body = await (await fetch(`${base}/collections/stem/products?price=0-200&sort=price-asc`)).json();
      expect(body.total).toBe(1);
      expect(body.products[0].slug).toBe("a");
      expect(body).toHaveProperty("pageCount");
    } finally { server.close(); }
  });

  it("404s products for an unknown collection", async () => {
    const { server, base } = buildApp();
    try { expect((await fetch(`${base}/collections/nope/products`)).status).toBe(404); }
    finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.public.filters.test.js`
Expected: FAIL — routes return 404 for all (handlers not defined).

- [ ] **Step 3: Add the controller handlers**

In `server/src/modules/catalog/catalog.controller.js`, add these imports at the top
(after the existing service imports):

```js
import { resolveFilters } from "./filterResolver.service.js";
import { queryCollectionProducts } from "./collectionQuery.service.js";
import { getFilterConfig, saveFilterConfig } from "./filterConfig.service.js";
```

Then add these handlers inside the object returned by `createCatalogController()` (next to
the other public handlers — `wrap` and the `collections` service import already exist):

```js
    // ---- public: dynamic filters + product query ----
    collectionFilters: wrap(async (req, res) => {
      const collection = await collections.getPublicCollectionBySlug(req.params.slug);
      if (!collection) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json({ filters: await resolveFilters(collection.id) });
    }),
    collectionProducts: wrap(async (req, res) => {
      const result = await queryCollectionProducts(req.params.slug, req.query || {});
      if (!result) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json(result);
    }),

    // ---- admin: filter config ----
    getFilterConfig: wrap(async (req, res) => res.json({ config: await getFilterConfig(req.params.id) })),
    putFilterConfig: wrap(async (req, res) => res.json({ config: await saveFilterConfig(req.params.id, req.body?.filters ?? []) })),
```

- [ ] **Step 4: Add the public routes**

In `server/src/modules/catalog/catalog.public.router.js`, add (after the existing
`/collections/:slug` route, before `/attributes`):

```js
  router.get("/collections/:slug/filters", c.collectionFilters);
  router.get("/collections/:slug/products", c.collectionProducts);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.public.filters.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/catalog/catalog.controller.js server/src/modules/catalog/catalog.public.router.js server/src/modules/catalog/catalog.public.filters.test.js
git commit -m "feat(catalog): add public dynamic-filter + product-query routes"
```

---

## Task 7: Admin filter-config routes

**Files:**
- Modify: `server/src/modules/catalog/catalog.admin.router.js` (two routes)
- Test: `server/src/modules/catalog/catalog.admin.filterconfig.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.admin.filterconfig.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogAdminRouter } from "./catalog.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import Attribute from "./attribute.model.js";
import CollectionFilterConfig from "./collectionFilterConfig.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await CollectionFilterConfig.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => { req.admin = { id: "a" }; next(); };
  app.use("/api/admin/catalog", createCatalogAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/catalog` };
}
const put = (url, body) => fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("admin filter-config routes", () => {
  it("GET synthesizes a default config when none stored", async () => {
    const { server, base } = buildApp();
    try {
      await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
      const id = new mongoose.Types.ObjectId().toString();
      const body = await (await fetch(`${base}/collections/${id}/filter-config`)).json();
      expect(body.config.isDefault).toBe(true);
      expect(body.config.filters.some((f) => f.type === "price")).toBe(true);
    } finally { server.close(); }
  });

  it("PUT saves a config and GET returns it", async () => {
    const { server, base } = buildApp();
    try {
      const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
      const id = new mongoose.Types.ObjectId().toString();
      await put(`${base}/collections/${id}/filter-config`, { filters: [{ type: "attribute", attributeId: attr.id, enabled: true, sortOrder: 0 }] });
      const body = await (await fetch(`${base}/collections/${id}/filter-config`)).json();
      expect(body.config.isDefault).toBe(false);
      expect(body.config.filters).toHaveLength(1);
    } finally { server.close(); }
  });

  it("PUT returns 400 for an attribute entry missing attributeId", async () => {
    const { server, base } = buildApp();
    try {
      const id = new mongoose.Types.ObjectId().toString();
      const r = await put(`${base}/collections/${id}/filter-config`, { filters: [{ type: "attribute", sortOrder: 0 }] });
      expect(r.status).toBe(400);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.admin.filterconfig.test.js`
Expected: FAIL — routes not defined.

- [ ] **Step 3: Add the admin routes**

In `server/src/modules/catalog/catalog.admin.router.js`, add after the existing
`/collections/:id/restore` route:

```js
  router.get("/collections/:id/filter-config", c.getFilterConfig);
  router.put("/collections/:id/filter-config", c.putFilterConfig);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.admin.filterconfig.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/catalog.admin.router.js server/src/modules/catalog/catalog.admin.filterconfig.test.js
git commit -m "feat(catalog): add admin filter-config routes"
```

---

## Task 8: Make AttributeFilterView controlled (back-compatible)

**Files:**
- Modify: `packages/shared-web/src/catalog/AttributeFilterView.jsx`
- Test: `packages/shared-web/src/catalog/AttributeFilterView.controlled.test.jsx`

The value key is `v.slug ?? v.id`. `checked`/`onChange` (and pressed state) are added ONLY when
`onToggle` is provided, so existing uncontrolled usage (admin attribute preview from Sub-project A)
and its tests still pass.

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/AttributeFilterView.controlled.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AttributeFilterView from "./AttributeFilterView.jsx";

afterEach(cleanup);

const attr = { id: "a", name: "Age", displayType: "checkbox",
  values: [{ slug: "0-12", name: "0-12 Months" }, { slug: "1-2", name: "1-2 Years" }] };

describe("AttributeFilterView (controlled)", () => {
  it("reflects selected and calls onToggle with the value slug", () => {
    const onToggle = vi.fn();
    render(<AttributeFilterView attribute={attr} selected={["0-12"]} onToggle={onToggle} />);
    const first = screen.getByLabelText("0-12 Months");
    expect(first).toBeChecked();
    fireEvent.click(screen.getByLabelText("1-2 Years"));
    expect(onToggle).toHaveBeenCalledWith("1-2");
  });

  it("stays uncontrolled (no checked) when onToggle is absent", () => {
    render(<AttributeFilterView attribute={attr} />);
    expect(screen.getByLabelText("0-12 Months")).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- AttributeFilterView.controlled`
Expected: FAIL — component ignores `selected`/`onToggle`.

- [ ] **Step 3: Rewrite the component (controlled-capable)**

```jsx
// packages/shared-web/src/catalog/AttributeFilterView.jsx
/**
 * AttributeFilterView — renders ONE attribute as its storefront filter control,
 * chosen by `attribute.displayType`. Controlled when `onToggle` is supplied
 * (selection is an array of value slugs); otherwise renders uncontrolled (used by
 * the admin attribute preview). Pure & presentational; consumer supplies CSS.
 *
 * @param {object} props
 * @param {{id,name,displayType,values:Array<{slug?,id?,name,swatchHex}>}|null} props.attribute
 * @param {string[]} [props.selected]  selected value keys (slug ?? id)
 * @param {(valueKey:string)=>void} [props.onToggle]
 */
export default function AttributeFilterView({ attribute, selected = [], onToggle }) {
  if (!attribute) return null;
  const { name, displayType, values = [] } = attribute;
  const groupName = `attr-${attribute.id ?? attribute.attributeSlug ?? name}`;
  const keyOf = (v) => v.slug ?? v.id;
  const isOn = (v) => selected.includes(keyOf(v));
  const controlled = typeof onToggle === "function";

  return (
    <fieldset className="pot-filter">
      <legend className="pot-filter__title">{name}</legend>
      <div className={`pot-filter__body pot-filter__body--${displayType}`}>
        {renderControl({ displayType, values, groupName, keyOf, isOn, controlled, onToggle })}
      </div>
    </fieldset>
  );
}

function renderControl({ displayType, values, groupName, keyOf, isOn, controlled, onToggle }) {
  const box = (type, v) => {
    const key = keyOf(v);
    const props = { type, name: groupName, value: key };
    if (controlled) { props.checked = isOn(v); props.onChange = () => onToggle(key); }
    return (
      <label key={key} className="pot-filter__opt">
        <input {...props} /> <span>{v.name}</span>
      </label>
    );
  };
  switch (displayType) {
    case "radio":
      return values.map((v) => box("radio", v));
    case "dropdown":
      return (
        <select className="pot-filter__select"
          {...(controlled
            ? { value: values.filter(isOn).map(keyOf)[0] ?? "", onChange: (e) => onToggle(e.target.value) }
            : { defaultValue: "" })}>
          <option value="" disabled>Select…</option>
          {values.map((v) => <option key={keyOf(v)} value={keyOf(v)}>{v.name}</option>)}
        </select>
      );
    case "color":
      return (
        <div className="pot-filter__swatches">
          {values.map((v) => (
            <button key={keyOf(v)} type="button"
              className={`pot-filter__swatch${controlled && isOn(v) ? " pot-filter__swatch--on" : ""}`}
              aria-label={v.name} aria-pressed={controlled ? isOn(v) : undefined} title={v.name}
              style={{ backgroundColor: v.swatchHex || "#ccc" }}
              onClick={controlled ? () => onToggle(keyOf(v)) : undefined} />
          ))}
        </div>
      );
    case "button":
      return values.map((v) => (
        <button key={keyOf(v)} type="button"
          className={`pot-filter__pill${controlled && isOn(v) ? " pot-filter__pill--on" : ""}`}
          aria-pressed={controlled ? isOn(v) : undefined}
          onClick={controlled ? () => onToggle(keyOf(v)) : undefined}>{v.name}</button>
      ));
    case "range":
      return <input type="range" className="pot-filter__range" min="0" max="100" defaultValue="50" aria-label="Range" />;
    case "checkbox":
    default:
      return values.map((v) => box("checkbox", v));
  }
}
```

- [ ] **Step 4: Run tests to verify**

Run: `npm test --workspace @planet-of-toys/shared-web -- AttributeFilterView`
Expected: PASS — both the new controlled test (2) and the original `AttributeFilterView.test.jsx` (7) stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/AttributeFilterView.jsx packages/shared-web/src/catalog/AttributeFilterView.controlled.test.jsx
git commit -m "feat(shared-web): make AttributeFilterView controllable"
```

---

## Task 9: ProductCard (extract; refactor CollectionView)

**Files:**
- Create: `packages/shared-web/src/catalog/ProductCard.jsx`
- Modify: `packages/shared-web/src/catalog/CollectionView.jsx` (render via ProductCard)
- Test: `packages/shared-web/src/catalog/ProductCard.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/ProductCard.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProductCard from "./ProductCard.jsx";

afterEach(cleanup);

describe("ProductCard", () => {
  it("renders name, formatted price, and resolved image", () => {
    render(<ProductCard product={{ id: "p", slug: "blocks", name: "Blocks", price: 499, images: ["b.webp"] }}
      resolveImageUrl={(f) => `/media/${f}`} formatPrice={(n) => `Rs ${n}`} />);
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Rs 499")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Blocks" })).toHaveAttribute("src", "/media/b.webp");
  });

  it("renders a placeholder when there is no image", () => {
    const { container } = render(<ProductCard product={{ id: "p", slug: "x", name: "X", price: 1, images: [] }} />);
    expect(container.querySelector(".pot-prod-card__placeholder")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- ProductCard`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write ProductCard and refactor CollectionView**

```jsx
// packages/shared-web/src/catalog/ProductCard.jsx
/**
 * ProductCard — single product tile (image, name, price). Pure & presentational;
 * the single source of truth for product tiles across CollectionView and ProductGrid.
 *
 * @param {object} props
 * @param {{id,slug,name,price,compareAtPrice,discountPercent,images}} props.product
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(amount:number)=>string} [props.formatPrice]
 */
export default function ProductCard({ product, resolveImageUrl = (x) => x, formatPrice = (n) => String(n) }) {
  const img = Array.isArray(product.images) && product.images[0] ? resolveImageUrl(product.images[0]) : null;
  return (
    <article className="pot-prod-card">
      <div className="pot-prod-card__media">
        {img ? <img src={img} alt={product.name} className="pot-prod-card__img" />
             : <span className="pot-prod-card__placeholder" aria-hidden="true" />}
      </div>
      <h3 className="pot-prod-card__name">{product.name}</h3>
      <p className="pot-prod-card__price">{formatPrice(product.price)}</p>
    </article>
  );
}
```

In `packages/shared-web/src/catalog/CollectionView.jsx`, add the import at the top:

```jsx
import ProductCard from "./ProductCard.jsx";
```

and replace the `products.map((p) => { ... <article> ... </article> })` block inside the
`pot-collection__grid` with:

```jsx
          {products.map((p) => (
            <ProductCard key={p.id} product={p} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} />
          ))}
```

- [ ] **Step 4: Run tests to verify**

Run: `npm test --workspace @planet-of-toys/shared-web -- ProductCard CollectionView`
Expected: PASS — ProductCard (2) and the existing CollectionView (3) stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/ProductCard.jsx packages/shared-web/src/catalog/CollectionView.jsx packages/shared-web/src/catalog/ProductCard.test.jsx
git commit -m "feat(shared-web): extract ProductCard; refactor CollectionView"
```

---

## Task 10: ProductGrid

**Files:**
- Create: `packages/shared-web/src/catalog/ProductGrid.jsx`
- Test: `packages/shared-web/src/catalog/ProductGrid.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/ProductGrid.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProductGrid from "./ProductGrid.jsx";

afterEach(cleanup);

describe("ProductGrid", () => {
  it("renders a card per product", () => {
    render(<ProductGrid products={[
      { id: "1", slug: "a", name: "A", price: 1, images: [] },
      { id: "2", slug: "b", name: "B", price: 2, images: [] },
    ]} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("shows the empty state when there are no products", () => {
    render(<ProductGrid products={[]} emptyLabel="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- ProductGrid`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component**

```jsx
// packages/shared-web/src/catalog/ProductGrid.jsx
import ProductCard from "./ProductCard.jsx";

/**
 * ProductGrid — responsive grid of ProductCard, with an empty state. Pure.
 *
 * @param {object} props
 * @param {Array} props.products
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(amount:number)=>string} [props.formatPrice]
 * @param {string} [props.emptyLabel]
 */
export default function ProductGrid({ products = [], resolveImageUrl, formatPrice, emptyLabel = "No products match your filters." }) {
  if (!products.length) return <p className="pot-grid__empty">{emptyLabel}</p>;
  return (
    <div className="pot-collection__grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- ProductGrid`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/ProductGrid.jsx packages/shared-web/src/catalog/ProductGrid.test.jsx
git commit -m "feat(shared-web): add ProductGrid"
```

---

## Task 11: SortControl

**Files:**
- Create: `packages/shared-web/src/catalog/SortControl.jsx`
- Test: `packages/shared-web/src/catalog/SortControl.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/SortControl.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SortControl, { SORT_OPTIONS } from "./SortControl.jsx";

afterEach(cleanup);

describe("SortControl", () => {
  it("exposes the six sort options", () => {
    expect(SORT_OPTIONS.map((o) => o.value)).toEqual(
      ["featured", "newest", "price-asc", "price-desc", "name", "best-selling"]
    );
  });

  it("reflects value and emits onChange", () => {
    const onChange = vi.fn();
    render(<SortControl value="featured" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "price-asc" } });
    expect(onChange).toHaveBeenCalledWith("price-asc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- SortControl`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component**

```jsx
// packages/shared-web/src/catalog/SortControl.jsx
/** Sort options shown to shoppers; values match the server SORT_SPECS keys. */
export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name", label: "Name" },
  { value: "best-selling", label: "Best Selling" },
];

/**
 * SortControl — labelled <select> for the product sort. Controlled.
 * @param {{value:string,onChange:(v:string)=>void}} props
 */
export default function SortControl({ value = "featured", onChange }) {
  return (
    <label className="pot-sort">
      <span className="pot-sort__label">Sort</span>
      <select className="pot-sort__select" value={value} onChange={(e) => onChange?.(e.target.value)}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- SortControl`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/SortControl.jsx packages/shared-web/src/catalog/SortControl.test.jsx
git commit -m "feat(shared-web): add SortControl"
```

---

## Task 12: FilterView + shared exports + CSS

`selection` is a flat object keyed by each filter's `key`: attribute → array of value slugs
(`selection["f_age"] = ["0-12"]`); price → `selection.price = [min,max]`; category →
`selection.category = "<slug>"`. This maps 1:1 to the URL params in Task 13.

**Files:**
- Create: `packages/shared-web/src/catalog/FilterView.jsx`
- Modify: `packages/shared-web/src/catalog/index.js` (barrel)
- Modify: `packages/shared-web/src/index.js` (main barrel)
- Modify: `packages/shared-web/src/catalog/catalog-views.css` (filter/grid/sort styles)
- Test: `packages/shared-web/src/catalog/FilterView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/FilterView.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FilterView from "./FilterView.jsx";

afterEach(cleanup);

const filters = [
  { key: "f_age", type: "attribute", attributeSlug: "age", name: "Age", displayType: "checkbox",
    values: [{ slug: "0-12", name: "0-12 Months" }, { slug: "1-2", name: "1-2 Years" }] },
  { key: "price", type: "price", min: 100, max: 900 },
  { key: "category", type: "category", options: [{ slug: "blocks", name: "Blocks" }] },
];

describe("FilterView", () => {
  it("renders a control group per filter definition", () => {
    render(<FilterView filters={filters} selection={{}} onChange={() => {}} />);
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText(/price/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Blocks")).toBeInTheDocument();
  });

  it("toggles an attribute value and emits the updated selection", () => {
    const onChange = vi.fn();
    render(<FilterView filters={filters} selection={{}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("0-12 Months"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ f_age: ["0-12"] }));
  });

  it("emits a price selection when a bound is changed", () => {
    const onChange = vi.fn();
    render(<FilterView filters={filters} selection={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/minimum price/i), { target: { value: "200" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ price: [200, 900] }));
  });

  it("shows a close button in drawer mode", () => {
    const onClose = vi.fn();
    render(<FilterView filters={filters} selection={{}} onChange={() => {}} open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close filters/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- FilterView`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component**

```jsx
// packages/shared-web/src/catalog/FilterView.jsx
import AttributeFilterView from "./AttributeFilterView.jsx";

/**
 * FilterView — renders resolved filter definitions as interactive controls and
 * reports selection changes. Pure & controlled. Desktop: a sidebar panel. Mobile:
 * pass `open` + `onClose` to render it as a drawer (the consumer toggles `open`).
 * `selection` is keyed by each filter's `key`.
 *
 * @param {object} props
 * @param {Array} props.filters  resolved definitions (attribute|price|category)
 * @param {object} props.selection
 * @param {(next:object)=>void} props.onChange
 * @param {boolean} [props.open]   mobile drawer open
 * @param {()=>void} [props.onClose]
 */
export default function FilterView({ filters = [], selection = {}, onChange, open = false, onClose }) {
  const toggleValue = (key, valueSlug) => {
    const cur = Array.isArray(selection[key]) ? selection[key] : [];
    const next = cur.includes(valueSlug) ? cur.filter((s) => s !== valueSlug) : [...cur, valueSlug];
    const out = { ...selection };
    if (next.length) out[key] = next; else delete out[key];
    onChange(out);
  };
  const setPrice = (def, idx, raw) => {
    const cur = Array.isArray(selection.price) ? [...selection.price] : [def.min, def.max];
    cur[idx] = Number(raw);
    onChange({ ...selection, price: cur });
  };
  const setCategory = (slug) => {
    const out = { ...selection };
    if (slug) out.category = slug; else delete out.category;
    onChange(out);
  };

  return (
    <aside className={`pot-filterview${open ? " pot-filterview--open" : ""}`} aria-label="Filters">
      <div className="pot-filterview__head">
        <h2 className="pot-filterview__title">Filters</h2>
        {onClose && (
          <button type="button" className="pot-filterview__close" aria-label="Close filters" onClick={onClose}>×</button>
        )}
      </div>

      {filters.map((def) => {
        if (def.type === "attribute") {
          return (
            <AttributeFilterView key={def.key}
              attribute={{ id: def.key, name: def.name, displayType: def.displayType, values: def.values }}
              selected={selection[def.key] || []}
              onToggle={(valueSlug) => toggleValue(def.key, valueSlug)} />
          );
        }
        if (def.type === "price") {
          const cur = Array.isArray(selection.price) ? selection.price : [def.min, def.max];
          return (
            <fieldset key={def.key} className="pot-filter pot-filter--price">
              <legend className="pot-filter__title">Price</legend>
              <div className="pot-filter__price-row">
                <label className="pot-filter__price-field">
                  <span>Minimum price</span>
                  <input type="number" min={def.min} max={def.max} value={cur[0]} onChange={(e) => setPrice(def, 0, e.target.value)} />
                </label>
                <label className="pot-filter__price-field">
                  <span>Maximum price</span>
                  <input type="number" min={def.min} max={def.max} value={cur[1]} onChange={(e) => setPrice(def, 1, e.target.value)} />
                </label>
              </div>
            </fieldset>
          );
        }
        if (def.type === "category") {
          return (
            <fieldset key={def.key} className="pot-filter pot-filter--category">
              <legend className="pot-filter__title">Category</legend>
              {def.options.map((o) => (
                <label key={o.slug} className="pot-filter__opt">
                  <input type="radio" name="category" value={o.slug}
                    checked={selection.category === o.slug} onChange={() => setCategory(o.slug)} /> <span>{o.name}</span>
                </label>
              ))}
            </fieldset>
          );
        }
        return null;
      })}
    </aside>
  );
}
```

- [ ] **Step 4: Update the barrels + CSS**

Append to `packages/shared-web/src/catalog/index.js`:

```js
export { default as ProductCard } from "./ProductCard.jsx";
export { default as ProductGrid } from "./ProductGrid.jsx";
export { default as SortControl, SORT_OPTIONS } from "./SortControl.jsx";
export { default as FilterView } from "./FilterView.jsx";
export * from "./filterParams.js";
```

Append to `packages/shared-web/src/index.js` (after the existing catalog exports):

```js
export { default as ProductCard } from "./catalog/ProductCard.jsx";
export { default as ProductGrid } from "./catalog/ProductGrid.jsx";
export { default as SortControl, SORT_OPTIONS } from "./catalog/SortControl.jsx";
export { default as FilterView } from "./catalog/FilterView.jsx";
export * from "./catalog/filterParams.js";
```

(`filterParams.js` is created in Task 13; these export lines resolve once that file exists — do
Task 13 before running the full shared-web suite.)

Append to `packages/shared-web/src/catalog/catalog-views.css`:

```css
/* FilterView + browse controls */
.pot-filterview { display: grid; gap: 20px; align-content: start; }
.pot-filterview__head { display: flex; align-items: center; justify-content: space-between; }
.pot-filterview__title { margin: 0; font-size: 1.1rem; font-weight: 800; }
.pot-filterview__close { display: none; border: 0; background: none; font-size: 1.6rem; line-height: 1; cursor: pointer; }
.pot-filter--price .pot-filter__price-row { display: flex; gap: 10px; }
.pot-filter__price-field { display: grid; gap: 4px; font-size: 0.8rem; }
.pot-filter__price-field input { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
.pot-filter__swatch--on { outline: 2px solid #2e3192; outline-offset: 2px; }
.pot-filter__pill--on { background: #2e3192; color: #fff; border-color: #2e3192; }
.pot-grid__empty { color: #64748b; padding: 24px 0; }
.pot-sort { display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; }
.pot-sort__select { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
/* Mobile drawer: hidden off-canvas until open. The storefront page decides when to apply it. */
@media (max-width: 860px) {
  .pot-filterview { position: fixed; inset: 0 20% 0 0; background: #fff; z-index: 40; padding: 20px;
    transform: translateX(-105%); transition: transform 180ms ease; overflow: auto; box-shadow: 0 0 40px rgba(0,0,0,.2); }
  .pot-filterview--open { transform: translateX(0); }
  .pot-filterview__close { display: inline-block; }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- FilterView`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-web/src/catalog/FilterView.jsx packages/shared-web/src/catalog/FilterView.test.jsx packages/shared-web/src/catalog/index.js packages/shared-web/src/index.js packages/shared-web/src/catalog/catalog-views.css
git commit -m "feat(shared-web): add FilterView + browse styles + exports"
```

---

## Task 13: URL filter-param helpers (pure)

**Files:**
- Create: `packages/shared-web/src/catalog/filterParams.js`
- Test: `packages/shared-web/src/catalog/filterParams.test.js`

- [ ] **Step 1: Write the failing test**

```js
// packages/shared-web/src/catalog/filterParams.test.js
import { describe, it, expect } from "vitest";
import { parseFilterParams, toQueryString } from "./filterParams.js";

describe("parseFilterParams", () => {
  it("parses attribute (csv), price, category, sort, page into selection + meta", () => {
    const sp = new URLSearchParams("f_age=0-12,1-2&price=100-500&category=blocks&sort=price-asc&page=2");
    const { selection, sort, page } = parseFilterParams(sp);
    expect(selection.f_age).toEqual(["0-12", "1-2"]);
    expect(selection.price).toEqual([100, 500]);
    expect(selection.category).toBe("blocks");
    expect(sort).toBe("price-asc");
    expect(page).toBe(2);
  });

  it("defaults sort=featured and page=1 when absent", () => {
    const { sort, page, selection } = parseFilterParams(new URLSearchParams(""));
    expect(sort).toBe("featured");
    expect(page).toBe(1);
    expect(selection).toEqual({});
  });
});

describe("toQueryString", () => {
  it("round-trips a selection back to a query string", () => {
    const qs = toQueryString({ selection: { f_age: ["0-12", "1-2"], price: [100, 500], category: "blocks" }, sort: "price-asc", page: 2 });
    const parsed = parseFilterParams(new URLSearchParams(qs));
    expect(parsed.selection.f_age).toEqual(["0-12", "1-2"]);
    expect(parsed.selection.price).toEqual([100, 500]);
    expect(parsed.sort).toBe("price-asc");
    expect(parsed.page).toBe(2);
  });

  it("omits defaults (featured, page 1) from the query string", () => {
    expect(toQueryString({ selection: {}, sort: "featured", page: 1 })).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- filterParams`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the helpers**

```js
// packages/shared-web/src/catalog/filterParams.js
/**
 * Pure helpers translating between the URL query string and filter state.
 * State shape: { selection, sort, page } where selection is keyed by filter key
 * (attribute key "f_<slug>" → string[]; "price" → [min,max]; "category" → slug).
 * Reserved keys (sort, page, limit) are never treated as attribute filters.
 */
const RESERVED = new Set(["sort", "page", "limit"]);

/** Parse a URLSearchParams into { selection, sort, page }. */
export function parseFilterParams(searchParams) {
  const selection = {};
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED.has(key) || !value) continue;
    if (key === "price") {
      const m = /^(\d+)-(\d+)$/.exec(value);
      if (m) selection.price = [Number(m[1]), Number(m[2])];
    } else if (key === "category") {
      selection.category = value;
    } else if (key.startsWith("f_")) {
      selection[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  const sort = searchParams.get("sort") || "featured";
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  return { selection, sort, page };
}

/** Serialize { selection, sort, page } back to a query string (defaults omitted). */
export function toQueryString({ selection = {}, sort = "featured", page = 1 } = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(selection)) {
    if (key === "price" && Array.isArray(value)) sp.set("price", `${value[0]}-${value[1]}`);
    else if (key === "category" && value) sp.set("category", value);
    else if (key.startsWith("f_") && Array.isArray(value) && value.length) sp.set(key, value.join(","));
  }
  if (sort && sort !== "featured") sp.set("sort", sort);
  if (page && page > 1) sp.set("page", String(page));
  return sp.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- filterParams`
Expected: PASS (4 tests). Then run the full shared-web suite to confirm the new barrel exports resolve: `npm test --workspace @planet-of-toys/shared-web`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/filterParams.js packages/shared-web/src/catalog/filterParams.test.js
git commit -m "feat(shared-web): add URL filter-param helpers"
```

---

## Task 14: `useFilterState` hook (URL-driven state)

**Files:**
- Create: `apps/client/src/hooks/useFilterState.js`
- Test: `apps/client/src/hooks/useFilterState.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/hooks/useFilterState.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useFilterState from "./useFilterState.js";

afterEach(cleanup);

function Harness() {
  const { sort, setSort, selection, setSelection, page, setPage } = useFilterState();
  return (
    <div>
      <span data-testid="sort">{sort}</span>
      <span data-testid="page">{page}</span>
      <span data-testid="age">{(selection.f_age || []).join(",")}</span>
      <button onClick={() => setSort("price-asc")}>sort</button>
      <button onClick={() => setSelection({ f_age: ["0-12"] })}>sel</button>
      <button onClick={() => setPage(3)}>page</button>
    </div>
  );
}

describe("useFilterState", () => {
  it("reads defaults and updates sort/selection/page via the URL", () => {
    render(<MemoryRouter initialEntries={["/collections/stem"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("sort")).toHaveTextContent("featured");
    expect(screen.getByTestId("page")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("sort"));
    expect(screen.getByTestId("sort")).toHaveTextContent("price-asc");
    fireEvent.click(screen.getByText("sel"));
    expect(screen.getByTestId("age")).toHaveTextContent("0-12");
    fireEvent.click(screen.getByText("page"));
    expect(screen.getByTestId("page")).toHaveTextContent("3");
  });

  it("resets page to 1 when sort or selection changes", () => {
    render(<MemoryRouter initialEntries={["/collections/stem?page=4"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("page")).toHaveTextContent("4");
    fireEvent.click(screen.getByText("sort"));
    expect(screen.getByTestId("page")).toHaveTextContent("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- useFilterState`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the hook**

```js
// apps/client/src/hooks/useFilterState.js
import { useSearchParams } from "react-router-dom";
import { parseFilterParams, toQueryString } from "@planet-of-toys/shared-web/catalog";

/**
 * URL-driven filter/sort/page state for the collection browse page. The query
 * string is the single source of truth (shareable, back/forward-safe). Changing
 * the selection or sort resets to page 1.
 */
export default function useFilterState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selection, sort, page } = parseFilterParams(searchParams);
  const commit = (next) => setSearchParams(toQueryString(next));
  return {
    selection, sort, page,
    setSelection: (selectionNext) => commit({ selection: selectionNext, sort, page: 1 }),
    setSort: (sortNext) => commit({ selection, sort: sortNext, page: 1 }),
    setPage: (pageNext) => commit({ selection, sort, page: pageNext }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- useFilterState`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/hooks/useFilterState.js apps/client/src/hooks/useFilterState.test.jsx
git commit -m "feat(client): add URL-driven useFilterState hook"
```

---

## Task 15: Storefront collection browse page

Replaces the Sub-project A proof page with the full browse experience (hero + filters + grid +
sort + pagination), all URL-driven. **The existing `apps/client/src/pages/CollectionPage.test.jsx`
from Sub-project A is replaced** by the version below.

**Files:**
- Modify: `apps/client/src/pages/CollectionPage.jsx`
- Create: `apps/client/src/pages/CollectionPage.css`
- Replace: `apps/client/src/pages/CollectionPage.test.jsx`

- [ ] **Step 1: Write the failing test (replace the existing file)**

```jsx
// apps/client/src/pages/CollectionPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CollectionPage from "./CollectionPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function route(path, qs = "") {
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/catalog/collections/stem") return Promise.resolve({ collection: { id: "c", name: "STEM Toys", heroTitle: "Learn by Play" } });
    if (url.startsWith("/api/catalog/collections/stem/filters")) return Promise.resolve({ filters: [
      { key: "f_age", type: "attribute", attributeSlug: "age", name: "Age", displayType: "checkbox", values: [{ slug: "0-12", name: "0-12 Months" }] },
      { key: "price", type: "price", min: 100, max: 900 },
    ] });
    if (url.startsWith("/api/catalog/collections/stem/products")) return Promise.resolve({ products: [{ id: "p", slug: "blocks", name: "Blocks", price: 499, images: [] }], total: 1, page: 1, limit: 24, pageCount: 1 });
    return Promise.resolve({});
  });
  return render(
    <MemoryRouter initialEntries={[`/collections/stem${qs}`]}>
      <Routes><Route path="/collections/:slug" element={<CollectionPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("CollectionPage (browse)", () => {
  it("renders hero, filters, and the product grid", async () => {
    route("/collections/stem");
    expect(await screen.findByText("Learn by Play")).toBeInTheDocument();
    expect(await screen.findByText("Age")).toBeInTheDocument();
    expect(await screen.findByText("Blocks")).toBeInTheDocument();
  });

  it("refetches products with the sort param when sort changes", async () => {
    route("/collections/stem");
    await screen.findByText("Blocks");
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "price-asc" } });
    await waitFor(() =>
      expect(apiMock.get.mock.calls.some(([u]) => u.includes("/products") && u.includes("sort=price-asc"))).toBe(true)
    );
  });

  it("shows a not-found message when the collection 404s", async () => {
    apiMock.get.mockImplementation((url) => {
      if (url === "/api/catalog/collections/missing") return Promise.reject(Object.assign(new Error("nf"), { status: 404 }));
      return Promise.resolve({});
    });
    render(
      <MemoryRouter initialEntries={["/collections/missing"]}>
        <Routes><Route path="/collections/:slug" element={<CollectionPage />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- CollectionPage`
Expected: FAIL — current page does not fetch `/filters` or `/products` or render a sort control.

- [ ] **Step 3: Write the page + CSS**

```jsx
// apps/client/src/pages/CollectionPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView, FilterView, ProductGrid, SortControl } from "@planet-of-toys/shared-web";
import { toQueryString } from "@planet-of-toys/shared-web/catalog";
import "@planet-of-toys/shared-web/catalog/catalog-views.css";
import useFilterState from "../hooks/useFilterState.js";
import "./CollectionPage.css";

export default function CollectionPage() {
  const { slug } = useParams();
  const { selection, sort, page, setSelection, setSort, setPage } = useFilterState();
  const [meta, setMeta] = useState({ status: "loading", collection: null });
  const [filters, setFilters] = useState([]);
  const [result, setResult] = useState(null);
  const [drawer, setDrawer] = useState(false);

  // Collection meta + filter definitions (per slug).
  useEffect(() => {
    let active = true;
    setMeta({ status: "loading", collection: null });
    apiClient.get(`/api/catalog/collections/${slug}`)
      .then((res) => { if (active) setMeta({ status: "ready", collection: res.collection }); })
      .catch((e) => { if (active) setMeta({ status: e?.status === 404 ? "notfound" : "error", collection: null }); });
    apiClient.get(`/api/catalog/collections/${slug}/filters`)
      .then((res) => { if (active) setFilters(res.filters || []); })
      .catch(() => { if (active) setFilters([]); });
    return () => { active = false; };
  }, [slug]);

  // Product page (per slug + selection + sort + page).
  useEffect(() => {
    let active = true;
    const qs = toQueryString({ selection, sort, page });
    apiClient.get(`/api/catalog/collections/${slug}/products${qs ? `?${qs}` : ""}`)
      .then((res) => { if (active) setResult(res); })
      .catch(() => { if (active) setResult({ products: [], total: 0, page: 1, pageCount: 1 }); });
    return () => { active = false; };
  }, [slug, JSON.stringify(selection), sort, page]);

  if (meta.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (meta.status === "notfound") return <p className="collection-page__status">Collection not found.</p>;
  if (meta.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  const pageCount = result?.pageCount ?? 1;
  return (
    <main className="collection-page">
      <CollectionView collection={meta.collection} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />

      <div className="collection-page__browse">
        <FilterView filters={filters} selection={selection} onChange={setSelection}
          open={drawer} onClose={() => setDrawer(false)} />

        <section className="collection-page__results">
          <div className="collection-page__toolbar">
            <button type="button" className="collection-page__filters-btn" onClick={() => setDrawer(true)}>Filters</button>
            <SortControl value={sort} onChange={setSort} />
          </div>

          <ProductGrid products={result?.products ?? []} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />

          {pageCount > 1 && (
            <nav className="collection-page__pager" aria-label="Pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="collection-page__pageinfo">Page {page} of {pageCount}</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
```

```css
/* apps/client/src/pages/CollectionPage.css */
.collection-page { max-width: 1280px; margin: 0 auto; padding: var(--space-5, 24px); }
.collection-page__status { padding: 40px; text-align: center; color: var(--color-text-secondary, #64748b); }
.collection-page__browse { display: grid; grid-template-columns: 260px 1fr; gap: var(--space-6, 32px); margin-top: var(--space-6, 32px); }
.collection-page__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.collection-page__filters-btn { display: none; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.collection-page__pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 28px; }
.collection-page__pager button { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 16px; cursor: pointer; }
.collection-page__pager button:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 860px) {
  .collection-page__browse { grid-template-columns: 1fr; }
  .collection-page__filters-btn { display: inline-block; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- CollectionPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/CollectionPage.jsx apps/client/src/pages/CollectionPage.css apps/client/src/pages/CollectionPage.test.jsx
git commit -m "feat(client): full collection browse page (filters, grid, sort, pagination)"
```

---

## Task 16: Admin filter-config panel (Collections page)

Extend the existing Collections page: when a collection is selected, show a Filters config panel
(enable/disable + reorder each attribute and the price/category built-ins) beside a live
`FilterView` preview in `DevicePreview`, with a Save button persisting via `PUT /filter-config`.

**Files:**
- Modify: `apps/admin/src/pages/admin/catalog/CollectionsPage.jsx`
- Test: `apps/admin/src/pages/admin/catalog/CollectionsFilterConfig.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/catalog/CollectionsFilterConfig.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import CollectionsPage from "./CollectionsPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

function mock() {
  apiMock.get.mockImplementation((url) => {
    if (url.endsWith("/filter-config")) return Promise.resolve({ config: { isDefault: true, filters: [
      { type: "attribute", attributeId: "a1", enabled: true, sortOrder: 0 }, { type: "price", attributeId: null, enabled: true, sortOrder: 1 },
    ] } });
    if (url.includes("/attributes")) return Promise.resolve({ attributes: [{ id: "a1", name: "Age", displayType: "checkbox", values: [{ id: "v1", slug: "0-12", name: "0-12" }] }] });
    if (url.includes("/collections")) return Promise.resolve({ collections: [{ id: "c1", name: "STEM Toys" }] });
    return Promise.resolve({});
  });
  apiMock.put.mockResolvedValue({ config: { isDefault: false, filters: [] } });
}

describe("CollectionsPage filter config", () => {
  it("loads the selected collection's filter config and shows the Filters panel", async () => {
    mock();
    render(<CollectionsPage />);
    await screen.findByText("STEM Toys");
    expect(await screen.findByRole("heading", { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByText(/^Age$/)).toBeInTheDocument(); // config row for the Age attribute
  });

  it("saves the filter config via PUT", async () => {
    mock();
    render(<CollectionsPage />);
    await screen.findByRole("heading", { name: /filters/i });
    fireEvent.click(screen.getByRole("button", { name: /save filters/i }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith(
      "/api/admin/catalog/collections/c1/filter-config",
      expect.objectContaining({ filters: expect.any(Array) }),
      expect.any(Object)
    ));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- CollectionsFilterConfig`
Expected: FAIL — no Filters panel / heading.

- [ ] **Step 3: Extend the Collections page**

Add these imports at the top of `apps/admin/src/pages/admin/catalog/CollectionsPage.jsx`:

```jsx
import { FilterView } from "@planet-of-toys/shared-web";
```

Add filter-config state + loading inside the `CollectionsPage` component (after the existing
`selected` derivation; reuse the existing `auth`, `selectedId`, `setErr`, and `apiClient`):

```jsx
  const [config, setConfig] = useState(null);   // { filters: [...] }
  const [attrs, setAttrs] = useState([]);
  const [cfgMsg, setCfgMsg] = useState(null);

  // Load the selected collection's filter config + attribute catalog.
  useEffect(() => {
    if (!selectedId) { setConfig(null); return; }
    let on = true;
    (async () => {
      try {
        const [cfg, a] = await Promise.all([
          apiClient.get(`/api/admin/catalog/collections/${selectedId}/filter-config`, { token: getToken() }),
          apiClient.get(`/api/admin/catalog/attributes`, { token: getToken() }),
        ]);
        if (!on) return;
        setAttrs(a?.attributes ?? []);
        setConfig({ filters: cfg?.config?.filters ?? [] });
      } catch (e) { if (e instanceof ApiError && e.status === 401) notifyUnauthorized(); }
    })();
    return () => { on = false; };
  }, [selectedId]);

  const setEntry = (i, patch) => setConfig((c) => ({ filters: c.filters.map((f, x) => (x === i ? { ...f, ...patch } : f)) }));
  const moveEntry = (i, d) => setConfig((c) => {
    const t = i + d; if (t < 0 || t >= c.filters.length) return c;
    const f = c.filters.slice(); const [m] = f.splice(i, 1); f.splice(t, 0, m);
    return { filters: f.map((e, x) => ({ ...e, sortOrder: x })) };
  });
  const labelFor = (f) => f.type === "attribute"
    ? (attrs.find((a) => a.id === String(f.attributeId))?.name ?? "Attribute")
    : (f.type === "price" ? "Price" : "Category");
  async function saveConfig() {
    setCfgMsg(null);
    try {
      await apiClient.put(`/api/admin/catalog/collections/${selectedId}/filter-config`,
        { filters: config.filters.map((f, i) => ({ type: f.type, attributeId: f.attributeId ?? null, enabled: f.enabled !== false, sortOrder: i })) },
        { token: getToken() });
      setCfgMsg("Filters saved.");
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save filters."); }
  }

  // Build resolved preview definitions from the in-progress config (enabled only).
  const previewFilters = (config?.filters ?? []).filter((f) => f.enabled !== false).map((f) => {
    if (f.type === "attribute") {
      const a = attrs.find((x) => x.id === String(f.attributeId));
      return a ? { key: `f_${a.id}`, type: "attribute", attributeSlug: a.id, name: a.name, displayType: a.displayType,
        values: (a.values ?? []).map((v) => ({ slug: v.slug ?? v.id, name: v.name, swatchHex: v.swatchHex ?? null })) } : null;
    }
    if (f.type === "price") return { key: "price", type: "price", min: 0, max: 1000 };
    return { key: "category", type: "category", options: [] };
  }).filter(Boolean);
```

Add this Filters section to the JSX, right after the `Live preview` card (inside the same
`selected &&` region — render only when a collection is selected and config is loaded):

```jsx
      {selected && config && (
        <section className="catalog-card">
          <h2>Filters — {selected.name}</h2>
          <div className="catalog-page__add" style={{ marginBottom: 12 }}>
            <button type="button" onClick={saveConfig}>Save filters</button>
            {cfgMsg && <span className="catalog-page__count">{cfgMsg}</span>}
          </div>
          <ul className="catalog-page__list">
            {config.filters.map((f, i) => (
              <li key={`${f.type}-${f.attributeId ?? i}`} className="catalog-page__row">
                <span className="catalog-page__row-name">{labelFor(f)}</span>
                <span className="catalog-page__row-actions">
                  <label className="catalog-page__check">
                    <input type="checkbox" checked={f.enabled !== false} onChange={(e) => setEntry(i, { enabled: e.target.checked })} /> Enabled
                  </label>
                  <button type="button" aria-label={`Move up ${labelFor(f)}`} onClick={() => moveEntry(i, -1)}>↑</button>
                  <button type="button" aria-label={`Move down ${labelFor(f)}`} onClick={() => moveEntry(i, 1)}>↓</button>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="catalog-card__sub">Preview</h3>
          <DevicePreview><FilterView filters={previewFilters} selection={{}} onChange={() => {}} /></DevicePreview>
        </section>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- CollectionsFilterConfig`
Expected: PASS (2 tests). Also run `npm test --workspace @planet-of-toys/admin -- CollectionsPage` to confirm the existing Collections tests stay green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/admin/catalog/CollectionsPage.jsx apps/admin/src/pages/admin/catalog/CollectionsFilterConfig.test.jsx
git commit -m "feat(admin): per-collection filter configuration + live preview"
```

---

## Task 17: Full-suite verification + final review

**Files:** none (verification only).

- [ ] **Step 1: Run every workspace suite** (run individually to avoid resource-contention timeouts on property tests)

```bash
npm test --workspace server
npm test --workspace @planet-of-toys/shared-web
npm test --workspace @planet-of-toys/admin
npm test --workspace @planet-of-toys/client
```
Expected: all green. If a fast-check property test times out under load, re-run that file alone to confirm it passes.

- [ ] **Step 2: Manual smoke (optional, if a dev DB is available)**

Seed catalog, assign products to a collection (admin Products → Catalog picker), set its filter
config (Collections → Filters), then open `/collections/<slug>` and verify: filters render from
config, selecting filters narrows the grid and updates the URL, sort + pagination work, the
mobile drawer opens, and a shared link reproduces the same filtered view.

- [ ] **Step 3: Final review checklist (inline)**

Confirm: filters generated only from Attributes/AttributeValues (no hardcoded Age/Theme/etc.);
`CollectionFilterConfig` is the source of truth (public `/filters` returns only enabled/default);
manual membership only (no rule engine); `/collections/:slug` preserved; filter state fully in the
URL; facet counts absent (deferred); shared View components power both storefront and admin
preview; archived/inactive excluded from public reads.

---

## Plan Self-Review

**Spec coverage:** real collection pages (T15) · dynamic filters from Attributes (T4, T6) · per-collection config (T1, T3, T7, T16) · product grid (T9, T10, T15) · sorting (T5 `SORT_SPECS`, T11) · URL-driven state (T13, T14) · desktop+mobile filter UX (T12 drawer CSS, T15) · shared storefront/admin components (T8–T12, T16) · architecture preserved (extends A's module/components). Merchandising fields (T2). All eight objectives + requirements map to tasks.

**Placeholder scan:** none. "Deferred" items (facet counts, rule engine) are explicit scope boundaries with no task, by design.

**Type/name consistency:** filter `key` convention `f_<slug>`/`price`/`category` is identical across resolver (T4), query service (T5), `filterParams` (T13), `FilterView` (T12), and the page (T15). `SORT_SPECS` keys (T5) match `SORT_OPTIONS` values (T11). API shapes (`{filters}`, `{products,total,page,limit,pageCount}`, `{config}`) match between controller (T6/T7), client page (T15), and admin panel (T16). `resolveFilters`, `queryCollectionProducts`, `getFilterConfig`, `saveFilterConfig` names match across definition and use. `AttributeFilterView` controlled extension (T8) stays back-compatible with A's uncontrolled tests.

**Ordering:** Product fields (T2) before services that sort by them; services (T3–T5) before controller (T6/T7); shared components (T8–T13) before the pages that compose them (T15–T16); `filterParams` (T13) before `useFilterState` (T14) and the barrel exports it references (noted in T12).

