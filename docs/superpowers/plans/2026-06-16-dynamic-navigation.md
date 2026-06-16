# Dynamic Navigation (Sub-project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storefront navigation fully CMS-driven from the existing `NavigationItem` model — public navigation tree API with server-resolved hrefs, admin editor, shared `NavigationView` (desktop mega-menu + mobile drawer), and first-class `/category/:slug` browse pages reusing the Sub-project B browse experience.

**Architecture:** Extend the existing `NavigationItem` model + `navigation.service` (no second model). Generalize B's filter/query services to a scope-generic browse layer ({ field: `collectionIds`|`categoryIds`, id }) so collections and categories share one code path. Add a shared `NavigationView` and a shared client `CatalogBrowse` region. The storefront `Header` renders nav from the API; category/collection targets store `targetType`+`targetId` only, hrefs resolved server-side.

**Tech Stack:** Node + Express + Mongoose (ESM), Vitest + mongodb-memory-server, React 18 + Vite + react-router-dom 6.30, Testing Library (jsdom), npm workspaces.

**Reference patterns (mirror exactly):**
- `server/src/modules/catalog/navigation.service.js` + `navigationItem.model.js` (from A).
- `server/src/modules/catalog/filterResolver.service.js` + `collectionQuery.service.js` + `filterConfig.service.js` (from B) — to be generalized.
- Catalog routers/controller: `catalog.controller.js`, `catalog.public.router.js`, `catalog.admin.router.js`.
- Shared View contract + barrels: `packages/shared-web/src/catalog/*.jsx`, `index.js`, `../index.js`, `catalog-views.css`.
- Client browse page + hook: `apps/client/src/pages/CollectionPage.jsx`, `apps/client/src/hooks/useFilterState.js`.
- Admin editor + preview + nav group: `apps/admin/src/pages/admin/catalog/CollectionsPage.jsx`, `DevicePreview.jsx`, `apps/admin/src/components/AdminLayout.jsx`, `apps/admin/src/App.jsx`.
- Storefront header: `apps/client/src/components/Header.jsx`.

**Conventions:** server `npm test --workspace server -- <file>`; shared-web `npm test --workspace @planet-of-toys/shared-web -- <file>`; admin `npm test --workspace @planet-of-toys/admin -- <file>`; client `npm test --workspace @planet-of-toys/client -- <file>`. Commit per task with the message shown; `git add` only the listed files. CRLF warnings are normal.

---

## File Structure

**Server — modified:**
- `server/src/modules/catalog/navigationItem.model.js` — add `menuKey`, `isMegaMenu`, `featured`, `image`.
- `server/src/modules/catalog/navigation.service.js` — writables + target-integrity validation; `getPublicNavigation`, `reorderNavigationItems`; `listNavigationItems` menuKey filter.
- `server/src/modules/catalog/filterResolver.service.js` — add scope-generic `resolveFiltersForScope`; `resolveFilters` delegates.
- `server/src/modules/catalog/collectionQuery.service.js` — add scope-generic `queryProductsForScope`; `queryCollectionProducts` delegates.
- `server/src/modules/catalog/filterConfig.service.js` — export `defaultFilterConfig()`.
- `server/src/modules/catalog/catalog.controller.js` — add `publicNavigation`, `categoryFilters`, `categoryProducts`, nav admin handlers.
- `server/src/modules/catalog/catalog.public.router.js` / `catalog.admin.router.js` — new routes.

**Server — new:**
- `server/src/modules/catalog/categoryBrowse.service.js` — `resolveCategoryFilters`, `queryCategoryProducts`.

**Shared — `packages/shared-web/src/catalog/`:**
- `NavigationView.jsx` (new) + barrels + `catalog-views.css` nav styles.

**Client:**
- `apps/client/src/components/CatalogBrowse.jsx` (new) — shared browse region.
- `apps/client/src/pages/CollectionPage.jsx` — refactor to use `CatalogBrowse`.
- `apps/client/src/pages/CategoryPage.jsx` (new) + `apps/client/src/App.jsx` route.
- `apps/client/src/components/Header.jsx` — CMS-driven nav (remove `CATEGORIES`).

**Admin:**
- `apps/admin/src/pages/admin/content/NavigationPage.jsx` (new) + `apps/admin/src/components/AdminLayout.jsx` (Content child) + `apps/admin/src/App.jsx` (route).

---

## Task 1: Extend NavigationItem model + service validation

**Files:**
- Modify: `server/src/modules/catalog/navigationItem.model.js`
- Modify: `server/src/modules/catalog/navigation.service.js`
- Test: `server/src/modules/catalog/navigation.fields.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/navigation.fields.test.js
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

describe("NavigationItem new fields + integrity", () => {
  it("defaults menuKey=header and the mega/featured flags", async () => {
    const json = (await NavigationItem.create({ label: "X", targetType: "collection" })).toJSON();
    expect(json.menuKey).toBe("header");
    expect(json.isMegaMenu).toBe(false);
    expect(json.featured).toBe(false);
    expect(json.image).toBeNull();
  });

  it("create persists the new fields", async () => {
    const id = new mongoose.Types.ObjectId();
    const item = await svc.createNavigationItem({ label: "Shop", targetType: "collection", targetId: id, isMegaMenu: true, menuKey: "header" });
    expect(item.isMegaMenu).toBe(true);
    expect(String(item.targetId)).toBe(String(id));
  });

  it("rejects a category/collection target that carries a raw url", async () => {
    await expect(svc.createNavigationItem({ label: "Bad", targetType: "collection", targetId: new mongoose.Types.ObjectId(), url: "/collections/x" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("requires targetId for category/collection targets", async () => {
    await expect(svc.createNavigationItem({ label: "Bad", targetType: "category" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("requires a url for internalRoute/externalUrl targets", async () => {
    await expect(svc.createNavigationItem({ label: "Sale", targetType: "internalRoute" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- navigation.fields.test.js`
Expected: FAIL — new fields/validation absent.

- [ ] **Step 3: Add the model fields**

In `server/src/modules/catalog/navigationItem.model.js`, add inside the schema (after the
`menu` field):

```js
    menuKey: { type: String, default: "header", trim: true, index: true },
    isMegaMenu: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    image: { type: String, default: null },
```

- [ ] **Step 4: Update the service (writables + integrity)**

In `server/src/modules/catalog/navigation.service.js`, replace the `WRITABLE` array and the
`validate` function, and tighten `createNavigationItem`:

```js
const WRITABLE = ["label", "targetType", "targetId", "url", "menu", "menuKey", "parentId", "sortOrder", "openInNewTab", "isActive", "isMegaMenu", "featured", "image"];
```

```js
function validate(data) {
  if (data.targetType !== undefined && !NAV_TARGET_TYPES.includes(data.targetType)) {
    throw new CatalogValidationError(`targetType must be one of: ${NAV_TARGET_TYPES.join(", ")}.`);
  }
  // Internal links to entities are entity-based, never raw URLs.
  if ((data.targetType === "category" || data.targetType === "collection") && data.url) {
    throw new CatalogValidationError("Category/collection navigation items must use targetId, not a url.");
  }
}

/** Enforce required target fields at creation time. */
function validateTargetRequired(data) {
  if (data.targetType === "category" || data.targetType === "collection") {
    if (!data.targetId) throw new CatalogValidationError("This navigation target requires a targetId.");
  } else if (data.targetType === "internalRoute" || data.targetType === "externalUrl") {
    if (!data.url || String(data.url).trim() === "") throw new CatalogValidationError("This navigation target requires a url.");
  }
}
```

In `createNavigationItem`, after `validate(data);` add `validateTargetRequired(data);`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- navigation.fields.test.js navigationItem.model navigation.service`
Expected: PASS — new tests green and the existing A navigation tests still pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/catalog/navigationItem.model.js server/src/modules/catalog/navigation.service.js server/src/modules/catalog/navigation.fields.test.js
git commit -m "feat(catalog): extend NavigationItem (menuKey, mega-menu, featured, image)"
```

---

## Task 2: Public navigation tree (server-resolved hrefs) + reorder + menuKey filter

**Files:**
- Modify: `server/src/modules/catalog/navigation.service.js`
- Test: `server/src/modules/catalog/navigation.tree.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/navigation.tree.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import NavigationItem from "./navigationItem.model.js";
import Category from "./category.model.js";
import Collection from "./collection.model.js";
import * as svc from "./navigation.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); await Category.deleteMany({}); await Collection.deleteMany({}); });

describe("getPublicNavigation", () => {
  it("builds an active tree with server-resolved hrefs and nested children", async () => {
    const cat = await Category.create({ name: "Educational", slug: "educational" });
    const col = await Collection.create({ name: "New Arrivals", slug: "new-arrivals" });
    const parent = await svc.createNavigationItem({ label: "Shop by Age", targetType: "category", targetId: cat._id, isMegaMenu: true, menuKey: "header", sortOrder: 0 });
    await svc.createNavigationItem({ label: "New Arrivals", targetType: "collection", targetId: col._id, parentId: parent.id, featured: true, image: "na.webp", menuKey: "header", sortOrder: 0 });
    await svc.createNavigationItem({ label: "Sale", targetType: "internalRoute", url: "/sale", menuKey: "header", sortOrder: 1 });

    const tree = await svc.getPublicNavigation({ menuKey: "header" });
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ label: "Shop by Age", href: "/category/educational", isMegaMenu: true });
    expect(tree[0].children[0]).toMatchObject({ label: "New Arrivals", href: "/collections/new-arrivals", featured: true, image: "na.webp" });
    expect(tree[1]).toMatchObject({ label: "Sale", href: "/sale" });
  });

  it("excludes archived items and filters by menuKey", async () => {
    await svc.createNavigationItem({ label: "Footer Link", targetType: "internalRoute", url: "/x", menuKey: "footer" });
    const hidden = await svc.createNavigationItem({ label: "Gone", targetType: "internalRoute", url: "/y", menuKey: "header" });
    await svc.archiveNavigationItem(hidden.id);
    expect(await svc.getPublicNavigation({ menuKey: "header" })).toHaveLength(0);
  });

  it("reorders items", async () => {
    const a = await svc.createNavigationItem({ label: "A", targetType: "internalRoute", url: "/a", sortOrder: 0 });
    const b = await svc.createNavigationItem({ label: "B", targetType: "internalRoute", url: "/b", sortOrder: 1 });
    await svc.reorderNavigationItems([{ id: b.id, parentId: null, sortOrder: 0 }, { id: a.id, parentId: null, sortOrder: 1 }]);
    const tree = await svc.getPublicNavigation({ menuKey: "header" });
    expect(tree.map((n) => n.label)).toEqual(["B", "A"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- navigation.tree.test.js`
Expected: FAIL — `getPublicNavigation`/`reorderNavigationItems` not defined.

- [ ] **Step 3: Add the functions**

In `server/src/modules/catalog/navigation.service.js`, add imports at the top (after the
existing imports):

```js
import Category from "./category.model.js";
import Collection from "./collection.model.js";
```

Change `listNavigationItems` to accept a `menuKey` filter:

```js
export async function listNavigationItems({ includeArchived = false, menuKey } = {}) {
  const query = includeArchived ? {} : { deletedAt: null };
  if (menuKey) query.menuKey = menuKey;
  const docs = await NavigationItem.find(query).sort({ sortOrder: 1, label: 1 });
  return docs.map((d) => d.toJSON());
}
```

Append:

```js
/** Active navigation tree for a menu, with hrefs resolved from entity slugs server-side. */
export async function getPublicNavigation({ menuKey = "header" } = {}) {
  const docs = await NavigationItem.find({ menuKey, deletedAt: null, isActive: true }).sort({ sortOrder: 1, label: 1 });
  const items = docs.map((d) => d.toJSON());

  const catIds = items.filter((i) => i.targetType === "category" && i.targetId).map((i) => i.targetId);
  const colIds = items.filter((i) => i.targetType === "collection" && i.targetId).map((i) => i.targetId);
  const cats = catIds.length ? await Category.find({ _id: { $in: catIds }, deletedAt: null }) : [];
  const cols = colIds.length ? await Collection.find({ _id: { $in: colIds }, deletedAt: null }) : [];
  const catSlug = new Map(cats.map((c) => [String(c._id), c.slug]));
  const colSlug = new Map(cols.map((c) => [String(c._id), c.slug]));
  const hrefOf = (i) => {
    if (i.targetType === "category") { const s = catSlug.get(String(i.targetId)); return s ? `/category/${s}` : "#"; }
    if (i.targetType === "collection") { const s = colSlug.get(String(i.targetId)); return s ? `/collections/${s}` : "#"; }
    return i.url || "#";
  };

  const nodes = new Map();
  const roots = [];
  for (const i of items) {
    nodes.set(String(i.id), {
      id: i.id, label: i.label, href: hrefOf(i), openInNewTab: i.openInNewTab,
      isMegaMenu: i.isMegaMenu, featured: i.featured, image: i.image, children: [],
    });
  }
  for (const i of items) {
    const node = nodes.get(String(i.id));
    const pid = i.parentId ? String(i.parentId) : null;
    if (pid && nodes.has(pid)) nodes.get(pid).children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Apply [{ id, parentId, sortOrder }] in one pass. */
export async function reorderNavigationItems(items = []) {
  if (!Array.isArray(items)) throw new CatalogValidationError("Reorder payload must be an array.");
  await Promise.all(items.map((it) =>
    NavigationItem.updateOne({ _id: it.id }, { $set: { parentId: it.parentId ?? null, sortOrder: Number(it.sortOrder) || 0 } })));
  return listNavigationItems({ includeArchived: false });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- navigation.tree.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/navigation.service.js server/src/modules/catalog/navigation.tree.test.js
git commit -m "feat(catalog): public navigation tree with server-resolved hrefs"
```

---

## Task 3: Generalize browse to a scope ({ field, id })

Refactor B's resolver/query so collections and categories share one path. Collection entry
points keep identical behavior (existing B tests must stay green).

**Files:**
- Modify: `server/src/modules/catalog/filterConfig.service.js` (export `defaultFilterConfig`)
- Modify: `server/src/modules/catalog/filterResolver.service.js`
- Modify: `server/src/modules/catalog/collectionQuery.service.js`
- Test: `server/src/modules/catalog/browseScope.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/browseScope.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { resolveFiltersForScope } from "./filterResolver.service.js";
import { queryProductsForScope } from "./collectionQuery.service.js";
import { defaultFilterConfig } from "./filterConfig.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

describe("browse scope (category)", () => {
  it("resolves filters over a categoryIds scope", async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const attr = await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
    await AttributeValue.create({ attributeId: attr._id, name: "0-12", slug: "0-12" });
    await Product.create({ name: "P", slug: "p", price: 250, stock: 1, active: true, categoryIds: [categoryId] });
    const defs = await resolveFiltersForScope({ field: "categoryIds", id: categoryId }, await defaultFilterConfig());
    expect(defs.find((d) => d.type === "attribute").key).toBe("f_age");
    expect(defs.find((d) => d.type === "price")).toMatchObject({ min: 250, max: 250 });
  });

  it("queries products over a categoryIds scope with sort + paging", async () => {
    const categoryId = new mongoose.Types.ObjectId();
    await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, categoryIds: [categoryId] });
    await Product.create({ name: "B", slug: "b", price: 900, stock: 1, active: true, categoryIds: [categoryId] });
    await Product.create({ name: "Other", slug: "o", price: 5, stock: 1, active: true });
    const res = await queryProductsForScope({ field: "categoryIds", id: categoryId }, { sort: "price-asc" });
    expect(res.total).toBe(2);
    expect(res.products.map((p) => p.slug)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- browseScope.test.js`
Expected: FAIL — scope-generic exports not defined.

- [ ] **Step 3: Export the default config**

In `server/src/modules/catalog/filterConfig.service.js`, add after the existing `defaultFilters`
function:

```js
/** The synthesized default filter list (all active filterable attributes + price). */
export async function defaultFilterConfig() {
  return defaultFilters();
}
```

- [ ] **Step 4: Generalize the resolver**

Replace the `priceRange`, `categoryOptions`, and `resolveFilters` definitions in
`server/src/modules/catalog/filterResolver.service.js` with:

```js
/** Min/max product price within a scope's active products (0/0 if empty). */
async function priceRange(scope) {
  const oid = new mongoose.Types.ObjectId(String(scope.id));
  const rows = await Product.aggregate([
    { $match: { [scope.field]: oid, active: true } },
    { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
  ]);
  if (!rows.length) return { min: 0, max: 0 };
  return { min: rows[0].min ?? 0, max: rows[0].max ?? 0 };
}

/** Distinct category options among a scope's active products. */
async function categoryOptions(scope) {
  const ids = await Product.distinct("categoryIds", { [scope.field]: scope.id, active: true });
  if (!ids.length) return [];
  const cats = await Category.find({ _id: { $in: ids }, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
  return cats.map((c) => ({ slug: c.slug, name: c.name }));
}

/** Resolve config filters into display-ready definitions for any browse scope. */
export async function resolveFiltersForScope(scope, configFilters) {
  const enabled = configFilters.filter((f) => f.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
  const defs = [];
  for (const f of enabled) {
    if (f.type === "attribute") {
      // eslint-disable-next-line no-await-in-loop
      const attr = await Attribute.findOne({ _id: f.attributeId, isActive: true, deletedAt: null });
      if (!attr) continue;
      // eslint-disable-next-line no-await-in-loop
      const values = await AttributeValue.find({ attributeId: attr._id, isActive: true, deletedAt: null }).sort({ sortOrder: 1, name: 1 });
      defs.push({ key: `f_${attr.slug}`, type: "attribute", attributeSlug: attr.slug, name: attr.name,
        displayType: attr.displayType, values: values.map((v) => ({ slug: v.slug, name: v.name, swatchHex: v.swatchHex ?? null })) });
    } else if (f.type === "price") {
      // eslint-disable-next-line no-await-in-loop
      const { min, max } = await priceRange(scope);
      defs.push({ key: "price", type: "price", min, max });
    } else if (f.type === "category") {
      // eslint-disable-next-line no-await-in-loop
      const options = await categoryOptions(scope);
      defs.push({ key: "category", type: "category", options });
    }
  }
  return defs;
}

/** Collection filters: scope = collectionIds, config = stored/synthesized. */
export async function resolveFilters(collectionId) {
  const { filters } = await getFilterConfig(collectionId);
  return resolveFiltersForScope({ field: "collectionIds", id: collectionId }, filters);
}
```

- [ ] **Step 5: Generalize the query**

In `server/src/modules/catalog/collectionQuery.service.js`, replace `queryCollectionProducts`
with a scope-generic core plus a thin collection wrapper (keep `SORT_SPECS`, `toCard`,
`buildConditions`, `DEFAULT_LIMIT`, `MAX_LIMIT` as-is):

```js
/** Filter + sort + paginate products within a browse scope ({ field, id }). */
export async function queryProductsForScope(scope, query = {}) {
  const base = { [scope.field]: scope.id, active: true };
  const and = await buildConditions(query);
  const filter = and.length ? { ...base, $and: and } : base;

  const sort = SORT_SPECS[query.sort] || SORT_SPECS.featured;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const total = await Product.countDocuments(filter);
  const docs = await Product.find(filter).sort(sort).skip(skip).limit(limit);
  return { products: docs.map(toCard), total, page, limit,
    pageCount: Math.max(1, Math.ceil(total / limit)), appliedFilters: { sort: query.sort || "featured", page, limit } };
}

export async function queryCollectionProducts(slug, query = {}) {
  const collection = await Collection.findOne({ slug, isActive: true, deletedAt: null });
  if (!collection) return null;
  return queryProductsForScope({ field: "collectionIds", id: collection._id }, query);
}
```

- [ ] **Step 6: Run tests to verify**

Run: `npm test --workspace server -- browseScope.test.js collectionQuery.service filterResolver.service`
Expected: PASS — new scope tests green and the existing B collection tests still pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/catalog/filterConfig.service.js server/src/modules/catalog/filterResolver.service.js server/src/modules/catalog/collectionQuery.service.js server/src/modules/catalog/browseScope.test.js
git commit -m "refactor(catalog): scope-generic browse (collections + categories)"
```

---

## Task 4: Category browse service

**Files:**
- Create: `server/src/modules/catalog/categoryBrowse.service.js`
- Test: `server/src/modules/catalog/categoryBrowse.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/categoryBrowse.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Category from "./category.model.js";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import { resolveCategoryFilters, queryCategoryProducts } from "./categoryBrowse.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Category.deleteMany({}); await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

describe("category browse", () => {
  it("returns default filters (attributes + price) for a category", async () => {
    const cat = await Category.create({ name: "Blocks", slug: "blocks" });
    await Attribute.create({ name: "Age", slug: "age", displayType: "checkbox" });
    await Product.create({ name: "P", slug: "p", price: 300, stock: 1, active: true, categoryIds: [cat._id] });
    const defs = await resolveCategoryFilters("blocks");
    expect(defs.map((d) => d.type)).toEqual(["attribute", "price"]);
  });

  it("queries a category's active products", async () => {
    const cat = await Category.create({ name: "Blocks", slug: "blocks" });
    await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, categoryIds: [cat._id] });
    await Product.create({ name: "B", slug: "b", price: 200, stock: 1, active: false, categoryIds: [cat._id] });
    const res = await queryCategoryProducts("blocks", { sort: "price-asc" });
    expect(res.products.map((p) => p.slug)).toEqual(["a"]);
  });

  it("returns null for an unknown/archived category", async () => {
    expect(await resolveCategoryFilters("nope")).toBeNull();
    expect(await queryCategoryProducts("nope", {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- categoryBrowse.service.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the service**

```js
// server/src/modules/catalog/categoryBrowse.service.js
import Category from "./category.model.js";
import { resolveFiltersForScope } from "./filterResolver.service.js";
import { queryProductsForScope } from "./collectionQuery.service.js";
import { defaultFilterConfig } from "./filterConfig.service.js";

/** Active category by slug, or null. */
async function activeCategory(slug) {
  return Category.findOne({ slug, isActive: true, deletedAt: null });
}

/** Dynamic filters for a category page (default config over the category's products). */
export async function resolveCategoryFilters(slug) {
  const cat = await activeCategory(slug);
  if (!cat) return null;
  return resolveFiltersForScope({ field: "categoryIds", id: cat._id }, await defaultFilterConfig());
}

/** Filtered/sorted/paginated products for a category page. */
export async function queryCategoryProducts(slug, query = {}) {
  const cat = await activeCategory(slug);
  if (!cat) return null;
  return queryProductsForScope({ field: "categoryIds", id: cat._id }, query);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace server -- categoryBrowse.service.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/catalog/categoryBrowse.service.js server/src/modules/catalog/categoryBrowse.service.test.js
git commit -m "feat(catalog): add category browse service"
```

---

## Task 5: Controller + public routes (navigation, category browse)

**Files:**
- Modify: `server/src/modules/catalog/catalog.controller.js`
- Modify: `server/src/modules/catalog/catalog.public.router.js`
- Test: `server/src/modules/catalog/catalog.public.navigation.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.public.navigation.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogPublicRouter } from "./catalog.public.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import NavigationItem from "./navigationItem.model.js";
import Category from "./category.model.js";
import { Product } from "../../models/index.js";
import * as nav from "./navigation.service.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); await Category.deleteMany({}); await Product.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/catalog", createCatalogPublicRouter());
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/catalog` };
}

describe("public navigation + category browse", () => {
  it("returns the resolved navigation tree for a menuKey", async () => {
    const { server, base } = buildApp();
    try {
      const cat = await Category.create({ name: "Edu", slug: "edu" });
      await nav.createNavigationItem({ label: "Learn", targetType: "category", targetId: cat._id, menuKey: "header" });
      const body = await (await fetch(`${base}/navigation?menuKey=header`)).json();
      expect(body.items[0]).toMatchObject({ label: "Learn", href: "/category/edu" });
    } finally { server.close(); }
  });

  it("returns category filters + a product page", async () => {
    const { server, base } = buildApp();
    try {
      const cat = await Category.create({ name: "Blocks", slug: "blocks" });
      await Product.create({ name: "A", slug: "a", price: 100, stock: 1, active: true, categoryIds: [cat._id] });
      const filters = await (await fetch(`${base}/categories/blocks/filters`)).json();
      expect(filters.filters.some((f) => f.key === "price")).toBe(true);
      const products = await (await fetch(`${base}/categories/blocks/products?sort=price-asc`)).json();
      expect(products.products[0].slug).toBe("a");
    } finally { server.close(); }
  });

  it("404s category browse for an unknown slug", async () => {
    const { server, base } = buildApp();
    try {
      expect((await fetch(`${base}/categories/nope/filters`)).status).toBe(404);
      expect((await fetch(`${base}/categories/nope/products`)).status).toBe(404);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.public.navigation.test.js`
Expected: FAIL — routes/handlers not defined.

- [ ] **Step 3: Add controller imports + handlers**

In `server/src/modules/catalog/catalog.controller.js`, add to the imports:

```js
import { getPublicNavigation } from "./navigation.service.js";
import { resolveCategoryFilters, queryCategoryProducts } from "./categoryBrowse.service.js";
```

Add inside the returned object (next to the other public handlers):

```js
    publicNavigation: wrap(async (req, res) => res.json({ items: await getPublicNavigation({ menuKey: req.query.menuKey || "header" }) })),
    categoryFilters: wrap(async (req, res) => {
      const filters = await resolveCategoryFilters(req.params.slug);
      if (!filters) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json({ filters });
    }),
    categoryProducts: wrap(async (req, res) => {
      const result = await queryCategoryProducts(req.params.slug, req.query || {});
      if (!result) return res.status(404).json({ error: { message: "Not found", status: 404 } });
      return res.json(result);
    }),
```

- [ ] **Step 4: Add the public routes**

In `server/src/modules/catalog/catalog.public.router.js`, add (after the existing
`/categories/:slug` route):

```js
  router.get("/navigation", c.publicNavigation);
  router.get("/categories/:slug/filters", c.categoryFilters);
  router.get("/categories/:slug/products", c.categoryProducts);
```

(Register `/navigation` before `/categories/:slug` is unnecessary — different prefixes — but keep
`/categories/:slug/filters` and `/products` after the literal `/categories/:slug`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.public.navigation.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/catalog/catalog.controller.js server/src/modules/catalog/catalog.public.router.js server/src/modules/catalog/catalog.public.navigation.test.js
git commit -m "feat(catalog): public navigation + category browse routes"
```

---

## Task 6: Admin navigation CRUD routes

The controller already imports the navigation service namespace (`import * as navigation` from
Sub-project A). Reuse it.

**Files:**
- Modify: `server/src/modules/catalog/catalog.controller.js`
- Modify: `server/src/modules/catalog/catalog.admin.router.js`
- Test: `server/src/modules/catalog/catalog.admin.navigation.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/src/modules/catalog/catalog.admin.navigation.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createCatalogAdminRouter } from "./catalog.admin.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";
import NavigationItem from "./navigationItem.model.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await NavigationItem.deleteMany({}); });

function buildApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => { req.admin = { id: "a" }; next(); };
  app.use("/api/admin/catalog", createCatalogAdminRouter({ requireAuth }));
  app.use(errorHandler);
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api/admin/catalog` };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("admin navigation routes", () => {
  it("creates, lists, and archives a navigation item", async () => {
    const { server, base } = buildApp();
    try {
      const created = await (await post(`${base}/navigation`, { label: "Sale", targetType: "internalRoute", url: "/sale" })).json();
      expect(created.item.label).toBe("Sale");
      const list = await (await fetch(`${base}/navigation`)).json();
      expect(list.items).toHaveLength(1);
      const arch = await post(`${base}/navigation/${created.item.id}/archive`, {});
      expect(arch.status).toBe(200);
      const after = await (await fetch(`${base}/navigation`)).json();
      expect(after.items).toHaveLength(0);
    } finally { server.close(); }
  });

  it("rejects a collection item with a raw url (400)", async () => {
    const { server, base } = buildApp();
    try {
      const r = await post(`${base}/navigation`, { label: "Bad", targetType: "collection", targetId: new mongoose.Types.ObjectId().toString(), url: "/collections/x" });
      expect(r.status).toBe(400);
    } finally { server.close(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- catalog.admin.navigation.test.js`
Expected: FAIL — routes not defined.

- [ ] **Step 3: Add controller handlers**

In `server/src/modules/catalog/catalog.controller.js`, add inside the returned object
(the `navigation` namespace is already imported):

```js
    navList: wrap(async (req, res) => res.json({ items: await navigation.listNavigationItems({ includeArchived: req.query.archived === "true", menuKey: req.query.menuKey }) })),
    navCreate: wrap(async (req, res) => res.status(201).json({ item: await navigation.createNavigationItem(req.body ?? {}) })),
    navUpdate: wrap(async (req, res) => res.json({ item: await navigation.updateNavigationItem(req.params.id, req.body ?? {}) })),
    navArchive: wrap(async (req, res) => res.json({ item: await navigation.archiveNavigationItem(req.params.id) })),
    navRestore: wrap(async (req, res) => res.json({ item: await navigation.restoreNavigationItem(req.params.id) })),
    navReorder: wrap(async (req, res) => res.json({ items: await navigation.reorderNavigationItems(req.body?.items ?? req.body ?? []) })),
```

- [ ] **Step 4: Add the admin routes**

In `server/src/modules/catalog/catalog.admin.router.js`, add (after the bulk-assign route, before
`return router;`):

```js
  // navigation (literal /reorder before /:id)
  router.get("/navigation", c.navList);
  router.post("/navigation", c.navCreate);
  router.put("/navigation/reorder", c.navReorder);
  router.put("/navigation/:id", c.navUpdate);
  router.post("/navigation/:id/archive", c.navArchive);
  router.post("/navigation/:id/restore", c.navRestore);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace server -- catalog.admin.navigation.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/catalog/catalog.controller.js server/src/modules/catalog/catalog.admin.router.js server/src/modules/catalog/catalog.admin.navigation.test.js
git commit -m "feat(catalog): admin navigation CRUD routes"
```

---

## Task 7: shared NavigationView (desktop mega-menu)

**Files:**
- Create: `packages/shared-web/src/catalog/NavigationView.jsx`
- Test: `packages/shared-web/src/catalog/NavigationView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/NavigationView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NavigationView from "./NavigationView.jsx";

afterEach(cleanup);

const items = [
  { id: "1", label: "Shop by Age", href: "/category/age", isMegaMenu: true, children: [
    { id: "1a", label: "0-12 Months", href: "/category/0-12", featured: false },
    { id: "1b", label: "New Arrivals", href: "/collections/new", featured: true, image: "na.webp" },
  ] },
  { id: "2", label: "Sale", href: "/sale", isMegaMenu: false, children: [] },
];

describe("NavigationView (desktop)", () => {
  it("renders top-level items; non-mega is a link", () => {
    render(<NavigationView items={items} />);
    expect(screen.getByRole("link", { name: "Sale" })).toHaveAttribute("href", "/sale");
  });

  it("opens a mega panel on click revealing child links and a featured card", () => {
    render(<NavigationView items={items} resolveImageUrl={(f) => `/media/${f}`} />);
    fireEvent.click(screen.getByRole("button", { name: "Shop by Age" }));
    expect(screen.getByRole("link", { name: "0-12 Months" })).toHaveAttribute("href", "/category/0-12");
    expect(screen.getByRole("img", { name: "New Arrivals" })).toHaveAttribute("src", "/media/na.webp");
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<NavigationView items={[]} />);
    expect(container.querySelector(".pot-nav")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- NavigationView`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the component (desktop + mobile in one file)**

```jsx
// packages/shared-web/src/catalog/NavigationView.jsx
import { useState } from "react";

/**
 * NavigationView — CMS-driven storefront navigation. Pure & presentational; the
 * consumer supplies CSS and `resolveImageUrl`. `variant="desktop"` renders a bar
 * with click-to-open mega panels (child link columns + featured collection cards);
 * `variant="mobile"` renders expandable drawer sections. Hrefs are already
 * resolved server-side. Used by the storefront Header and the admin preview.
 *
 * @param {object} props
 * @param {Array} props.items  resolved nav tree
 * @param {"desktop"|"mobile"} [props.variant]
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {()=>void} [props.onNavigate]  called when a link is clicked (e.g. close drawer)
 */
export default function NavigationView({ items = [], variant = "desktop", resolveImageUrl = (x) => x, onNavigate }) {
  const [openId, setOpenId] = useState(null);
  if (!items || items.length === 0) return null;
  const linkProps = (i) => (i.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {});

  if (variant === "mobile") {
    return (
      <nav className="pot-nav pot-nav--mobile" aria-label="Main menu">
        <ul className="pot-nav__list">
          {items.map((item) => (
            <li key={item.id} className="pot-nav__m-item">
              {item.children && item.children.length ? (
                <>
                  <button type="button" className="pot-nav__m-top" aria-expanded={openId === item.id}
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}>{item.label}</button>
                  {openId === item.id && (
                    <ul className="pot-nav__m-children">
                      {item.children.map((c) => (
                        <li key={c.id}><a className="pot-nav__m-link" href={c.href} {...linkProps(c)} onClick={onNavigate}>{c.label}</a></li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <a className="pot-nav__m-top" href={item.href} {...linkProps(item)} onClick={onNavigate}>{item.label}</a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="pot-nav pot-nav--desktop" aria-label="Main menu">
      <ul className="pot-nav__bar">
        {items.map((item) => {
          const mega = item.isMegaMenu && item.children && item.children.length > 0;
          if (!mega) {
            return (
              <li key={item.id} className="pot-nav__item">
                <a className="pot-nav__top" href={item.href} {...linkProps(item)} onClick={onNavigate}>{item.label}</a>
              </li>
            );
          }
          const links = item.children.filter((c) => !c.featured);
          const cards = item.children.filter((c) => c.featured);
          return (
            <li key={item.id} className="pot-nav__item" onMouseLeave={() => setOpenId((o) => (o === item.id ? null : o))}>
              <button type="button" className="pot-nav__top" aria-expanded={openId === item.id}
                onClick={() => setOpenId(openId === item.id ? null : item.id)}>{item.label}</button>
              {openId === item.id && (
                <div className="pot-nav__panel">
                  {links.length > 0 && (
                    <div className="pot-nav__links">
                      {links.map((c) => (
                        <a key={c.id} className="pot-nav__link" href={c.href} {...linkProps(c)} onClick={onNavigate}>{c.label}</a>
                      ))}
                    </div>
                  )}
                  {cards.length > 0 && (
                    <div className="pot-nav__featured">
                      {cards.map((c) => (
                        <a key={c.id} className="pot-nav__card" href={c.href} {...linkProps(c)} onClick={onNavigate}>
                          {c.image ? <img className="pot-nav__card-img" src={resolveImageUrl(c.image)} alt={c.label} />
                                   : <span className="pot-nav__card-ph" aria-hidden="true" />}
                          <span className="pot-nav__card-label">{c.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- NavigationView`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-web/src/catalog/NavigationView.jsx packages/shared-web/src/catalog/NavigationView.test.jsx
git commit -m "feat(shared-web): add NavigationView (desktop mega-menu + mobile)"
```

---

## Task 8: NavigationView mobile test + CSS + exports

**Files:**
- Create: `packages/shared-web/src/catalog/NavigationView.mobile.test.jsx`
- Modify: `packages/shared-web/src/catalog/index.js`, `packages/shared-web/src/index.js`
- Modify: `packages/shared-web/src/catalog/catalog-views.css`

- [ ] **Step 1: Write the failing test**

```jsx
// packages/shared-web/src/catalog/NavigationView.mobile.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NavigationView } from "@planet-of-toys/shared-web";

afterEach(cleanup);

const items = [
  { id: "1", label: "Shop", href: "/category/x", children: [{ id: "1a", label: "Blocks", href: "/category/blocks" }] },
];

describe("NavigationView (mobile)", () => {
  it("expands a section and fires onNavigate on a child link", () => {
    const onNavigate = vi.fn();
    render(<NavigationView items={items} variant="mobile" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Shop" }));
    const link = screen.getByRole("link", { name: "Blocks" });
    expect(link).toHaveAttribute("href", "/category/blocks");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalled();
  });
});
```

(Imports from the package barrel, so this also verifies the export added below.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/shared-web -- NavigationView.mobile`
Expected: FAIL — `NavigationView` not exported from the barrel yet.

- [ ] **Step 3: Add the exports**

Append to `packages/shared-web/src/catalog/index.js`:

```js
export { default as NavigationView } from "./NavigationView.jsx";
```

Append to `packages/shared-web/src/index.js`:

```js
export { default as NavigationView } from "./catalog/NavigationView.jsx";
```

- [ ] **Step 4: Add navigation CSS**

Append to `packages/shared-web/src/catalog/catalog-views.css`:

```css
/* NavigationView */
.pot-nav__bar { list-style: none; margin: 0; padding: 0; display: flex; gap: 4px; flex-wrap: wrap; }
.pot-nav__item { position: relative; }
.pot-nav__top { display: inline-block; border: 0; background: none; font: inherit; font-weight: 600; color: inherit;
  padding: 10px 14px; cursor: pointer; text-decoration: none; }
.pot-nav__top:hover { color: #2e3192; }
.pot-nav__panel { position: absolute; top: 100%; left: 0; z-index: 30; display: flex; gap: 24px;
  background: #fff; border: 1px solid #e6ebf5; border-radius: 12px; padding: 18px; min-width: 420px;
  box-shadow: 0 12px 40px rgba(0,0,0,.12); }
.pot-nav__links { display: grid; gap: 8px; align-content: start; min-width: 160px; }
.pot-nav__link { text-decoration: none; color: #334155; }
.pot-nav__link:hover { color: #2e3192; }
.pot-nav__featured { display: flex; gap: 12px; }
.pot-nav__card { width: 150px; text-decoration: none; color: inherit; border: 1px solid #e6ebf5; border-radius: 12px; overflow: hidden; }
.pot-nav__card-img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
.pot-nav__card-ph { display: block; width: 100%; aspect-ratio: 4 / 3; background: #f1f5fb; }
.pot-nav__card-label { display: block; padding: 8px 10px; font-weight: 600; font-size: 0.9rem; }
/* mobile */
.pot-nav__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.pot-nav__m-top { display: block; width: 100%; text-align: left; border: 0; background: none; font: inherit;
  font-weight: 600; padding: 12px 4px; cursor: pointer; text-decoration: none; color: inherit; border-bottom: 1px solid #eef2f9; }
.pot-nav__m-children { list-style: none; margin: 0; padding: 4px 0 8px 16px; display: grid; gap: 6px; }
.pot-nav__m-link { text-decoration: none; color: #334155; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/shared-web -- NavigationView`
Expected: PASS — desktop (3) + mobile (1). Run the full shared-web suite to confirm the barrels resolve: `npm test --workspace @planet-of-toys/shared-web`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-web/src/catalog/NavigationView.mobile.test.jsx packages/shared-web/src/catalog/index.js packages/shared-web/src/index.js packages/shared-web/src/catalog/catalog-views.css
git commit -m "feat(shared-web): NavigationView mobile test + exports + nav styles"
```

---

## Task 9: Admin Content → Navigation editor

**Files:**
- Create: `apps/admin/src/pages/admin/content/NavigationPage.jsx`
- Modify: `apps/admin/src/components/AdminLayout.jsx` (Content child)
- Modify: `apps/admin/src/App.jsx` (route)
- Test: `apps/admin/src/pages/admin/content/NavigationPage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/content/NavigationPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import NavigationPage from "./NavigationPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

function mock() {
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/navigation")) return Promise.resolve({ items: [{ id: "n1", label: "Sale", targetType: "internalRoute", url: "/sale", parentId: null, isMegaMenu: false, featured: false, menuKey: "header", sortOrder: 0 }] });
    if (url.includes("/categories")) return Promise.resolve({ categories: [{ id: "c1", name: "Edu", children: [] }] });
    if (url.includes("/collections")) return Promise.resolve({ collections: [{ id: "k1", name: "Sale Collection" }] });
    return Promise.resolve({});
  });
}

describe("NavigationPage", () => {
  it("loads navigation items", async () => {
    mock();
    render(<NavigationPage />);
    expect((await screen.findAllByText("Sale")).length).toBeGreaterThan(0);
  });

  it("creates a navigation item", async () => {
    mock();
    apiMock.post.mockResolvedValue({ item: { id: "n2", label: "New Arrivals" } });
    render(<NavigationPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/item label/i), { target: { value: "New Arrivals" } });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/navigation", expect.objectContaining({ label: "New Arrivals" }), expect.any(Object)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/admin -- NavigationPage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the page**

```jsx
// apps/admin/src/pages/admin/content/NavigationPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { NavigationView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "../catalog/DevicePreview.jsx";
import "../catalog/CatalogPage.css";

const NAV = "/api/admin/catalog/navigation";
const MENU_KEY = "header";
const TARGET_TYPES = ["category", "collection", "internalRoute", "externalUrl"];
const empty = { label: "", targetType: "collection", targetId: "", url: "", parentId: "", isMegaMenu: false, featured: false };

/** Flatten a category tree into [{id,name}]. */
function flattenCats(nodes, depth = 0, out = []) {
  for (const n of nodes) { out.push({ id: n.id, name: `${"— ".repeat(depth)}${n.name}` }); if (n.children?.length) flattenCats(n.children, depth + 1, out); }
  return out;
}

export default function NavigationPage() {
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [cols, setCols] = useState([]);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(null);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [n, c, k] = await Promise.all([
        apiClient.get(`${NAV}?menuKey=${MENU_KEY}`, auth()),
        apiClient.get(`/api/admin/catalog/categories`, auth()),
        apiClient.get(`/api/admin/catalog/collections`, auth()),
      ]);
      setItems(n?.items ?? []);
      setCats(flattenCats(c?.categories ?? []));
      setCols((k?.collections ?? []).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load navigation."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function bodyFromForm(f) {
    const body = { label: f.label.trim(), targetType: f.targetType, menuKey: MENU_KEY, isMegaMenu: f.isMegaMenu, featured: f.featured };
    if (f.parentId) body.parentId = f.parentId;
    if (f.targetType === "category" || f.targetType === "collection") body.targetId = f.targetId;
    else body.url = f.url;
    return body;
  }

  async function addItem() {
    if (!form.label.trim()) return;
    setErr(null);
    try { await apiClient.post(NAV, bodyFromForm(form), auth()); setForm(empty); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create item."); }
  }
  async function patch(id, body) {
    try { await apiClient.put(`${NAV}/${id}`, body, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save."); }
  }
  async function archive(id) {
    try { await apiClient.post(`${NAV}/${id}/archive`, {}, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not archive."); }
  }
  async function move(id, delta) {
    const siblings = items.filter((x) => String(x.parentId ?? "") === String(items.find((y) => y.id === id)?.parentId ?? ""));
    const pos = siblings.findIndex((s) => s.id === id);
    if (pos + delta < 0 || pos + delta >= siblings.length) return;
    const reordered = siblings.slice(); const [m] = reordered.splice(pos, 1); reordered.splice(pos + delta, 0, m);
    try { await apiClient.put(`${NAV}/reorder`, { items: reordered.map((s, i) => ({ id: s.id, parentId: s.parentId ?? null, sortOrder: i })) }, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not reorder."); }
  }
  async function uploadImage(id, file) {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
    const data = await res.json();
    await patch(id, { image: data.filename });
  }

  const topLevel = useMemo(() => (items ?? []).filter((i) => !i.parentId), [items]);
  const previewTree = useMemo(() => {
    const nodes = new Map(); const roots = [];
    for (const i of (items ?? [])) nodes.set(String(i.id), { id: i.id, label: i.label, href: "#", isMegaMenu: i.isMegaMenu, featured: i.featured, image: i.image, children: [] });
    for (const i of (items ?? [])) { const n = nodes.get(String(i.id)); const p = i.parentId ? String(i.parentId) : null; if (p && nodes.has(p)) nodes.get(p).children.push(n); else roots.push(n); }
    return roots;
  }, [items]);

  if (items === null) return <p className="catalog-page__status">Loading…</p>;
  const entity = form.targetType === "category" ? cats : cols;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Navigation</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><NavigationView items={previewTree} resolveImageUrl={(f) => mediaUrl(f)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add menu item</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>Item label</span>
            <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
          <label className="catalog-page__field"><span>Target type</span>
            <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
              {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          {(form.targetType === "category" || form.targetType === "collection") ? (
            <label className="catalog-page__field"><span>Target</span>
              <select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}>
                <option value="">Select…</option>
                {entity.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></label>
          ) : (
            <label className="catalog-page__field"><span>URL</span>
              <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          )}
          <label className="catalog-page__field"><span>Parent</span>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None (top level)</option>
              {topLevel.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select></label>
          <label className="catalog-page__check"><input type="checkbox" checked={form.isMegaMenu} onChange={(e) => setForm({ ...form, isMegaMenu: e.target.checked })} /> Mega</label>
          <label className="catalog-page__check"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured</label>
          <button type="button" onClick={addItem}>Add item</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Menu items</h2>
        <ul className="catalog-page__list">
          {items.map((i) => (
            <li key={i.id} className="catalog-page__row" style={{ paddingLeft: i.parentId ? 24 : 0 }}>
              <span className="catalog-page__row-name">{i.label}</span>
              <span className="catalog-page__row-actions">
                <label className="catalog-page__check"><input type="checkbox" checked={!!i.isMegaMenu} onChange={(e) => patch(i.id, { isMegaMenu: e.target.checked })} /> Mega</label>
                <label className="catalog-page__check"><input type="checkbox" checked={!!i.featured} onChange={(e) => patch(i.id, { featured: e.target.checked })} /> Featured</label>
                <label className="catalog-page__upload" aria-label={`Upload image for ${i.label}`}>Image<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadImage(i.id, e.target.files[0])} /></label>
                <button type="button" aria-label={`Move up ${i.label}`} onClick={() => move(i.id, -1)}>↑</button>
                <button type="button" aria-label={`Move down ${i.label}`} onClick={() => move(i.id, 1)}>↓</button>
                <button type="button" aria-label={`Archive ${i.label}`} onClick={() => archive(i.id)}>Archive</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire the sidebar child + route**

In `apps/admin/src/components/AdminLayout.jsx`, add to the Content group's `children` array
(after the Footer Content entry):

```jsx
      { to: "/admin/content/navigation", label: "Navigation" },
```

In `apps/admin/src/App.jsx`, add the import:

```jsx
import NavigationPage from "./pages/admin/content/NavigationPage.jsx";
```

and add inside the `content` route's children (after the `footer` route):

```jsx
            <Route path="navigation" element={<NavigationPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/admin -- NavigationPage`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/admin/content/NavigationPage.jsx apps/admin/src/components/AdminLayout.jsx apps/admin/src/App.jsx apps/admin/src/pages/admin/content/NavigationPage.test.jsx
git commit -m "feat(admin): Content -> Navigation editor + live preview"
```

---

## Task 10: Shared CatalogBrowse client component (refactor CollectionPage)

Extract the browse region into one component used by collection and category pages.

**Files:**
- Create: `apps/client/src/components/CatalogBrowse.jsx`
- Create: `apps/client/src/components/CatalogBrowse.css`
- Modify: `apps/client/src/pages/CollectionPage.jsx`
- Modify: `apps/client/src/pages/CollectionPage.css` (remove browse styles; keep page/hero/status)
- Test: `apps/client/src/components/CatalogBrowse.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/components/CatalogBrowse.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CatalogBrowse from "./CatalogBrowse.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/filters")) return Promise.resolve({ filters: [{ key: "price", type: "price", min: 0, max: 900 }] });
    if (url.includes("/products")) return Promise.resolve({ products: [{ id: "p", slug: "b", name: "Blocks", price: 99, images: [] }], total: 1, page: 1, limit: 24, pageCount: 1 });
    return Promise.resolve({});
  });
});
afterEach(cleanup);

describe("CatalogBrowse", () => {
  it("fetches filters + products for the endpoint and renders the grid", async () => {
    render(<MemoryRouter><CatalogBrowse endpoint="/api/catalog/collections/stem" /></MemoryRouter>);
    expect(await screen.findByText("Blocks")).toBeInTheDocument();
    expect(apiMock.get.mock.calls.some(([u]) => u === "/api/catalog/collections/stem/filters")).toBe(true);
  });

  it("refetches with sort when sort changes", async () => {
    render(<MemoryRouter><CatalogBrowse endpoint="/api/catalog/categories/blocks" /></MemoryRouter>);
    await screen.findByText("Blocks");
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "price-asc" } });
    await waitFor(() => expect(apiMock.get.mock.calls.some(([u]) => u.includes("/products") && u.includes("sort=price-asc"))).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- CatalogBrowse`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write CatalogBrowse + CSS**

```jsx
// apps/client/src/components/CatalogBrowse.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { FilterView, ProductGrid, SortControl } from "@planet-of-toys/shared-web";
import { toQueryString } from "@planet-of-toys/shared-web/catalog";
import "@planet-of-toys/shared-web/catalog/catalog-views.css";
import useFilterState from "../hooks/useFilterState.js";
import "./CatalogBrowse.css";

/**
 * Shared catalog browse region (filters + grid + sort + pagination), URL-driven.
 * `endpoint` is the catalog base path, e.g. "/api/catalog/collections/<slug>" or
 * "/api/catalog/categories/<slug>" — it fetches `${endpoint}/filters` and
 * `${endpoint}/products`. Used by both collection and category pages.
 */
export default function CatalogBrowse({ endpoint }) {
  const { selection, sort, page, setSelection, setSort, setPage } = useFilterState();
  const [filters, setFilters] = useState([]);
  const [result, setResult] = useState(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get(`${endpoint}/filters`).then((res) => { if (active) setFilters(res.filters || []); }).catch(() => { if (active) setFilters([]); });
    return () => { active = false; };
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    const qs = toQueryString({ selection, sort, page });
    apiClient.get(`${endpoint}/products${qs ? `?${qs}` : ""}`)
      .then((res) => { if (active) setResult(res); })
      .catch(() => { if (active) setResult({ products: [], total: 0, page: 1, pageCount: 1 }); });
    return () => { active = false; };
  }, [endpoint, JSON.stringify(selection), sort, page]);

  const pageCount = result?.pageCount ?? 1;
  return (
    <div className="catalog-browse">
      <FilterView filters={filters} selection={selection} onChange={setSelection} open={drawer} onClose={() => setDrawer(false)} />
      <section className="catalog-browse__results">
        <div className="catalog-browse__toolbar">
          <button type="button" className="catalog-browse__filters-btn" onClick={() => setDrawer(true)}>Filters</button>
          <SortControl value={sort} onChange={setSort} />
        </div>
        <ProductGrid products={result?.products ?? []} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />
        {pageCount > 1 && (
          <nav className="catalog-browse__pager" aria-label="Pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="catalog-browse__pageinfo">Page {page} of {pageCount}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}
```

```css
/* apps/client/src/components/CatalogBrowse.css */
.catalog-browse { display: grid; grid-template-columns: 260px 1fr; gap: var(--space-6, 32px); margin-top: var(--space-6, 32px); }
.catalog-browse__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.catalog-browse__filters-btn { display: none; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.catalog-browse__pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 28px; }
.catalog-browse__pager button { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 16px; cursor: pointer; }
.catalog-browse__pager button:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 860px) {
  .catalog-browse { grid-template-columns: 1fr; }
  .catalog-browse__filters-btn { display: inline-block; }
}
```

- [ ] **Step 4: Refactor CollectionPage to use CatalogBrowse**

Replace `apps/client/src/pages/CollectionPage.jsx` with:

```jsx
// apps/client/src/pages/CollectionPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import CatalogBrowse from "../components/CatalogBrowse.jsx";
import "./CollectionPage.css";

export default function CollectionPage() {
  const { slug } = useParams();
  const [meta, setMeta] = useState({ status: "loading", collection: null });

  useEffect(() => {
    let active = true;
    setMeta({ status: "loading", collection: null });
    apiClient.get(`/api/catalog/collections/${slug}`)
      .then((res) => { if (active) setMeta({ status: "ready", collection: res.collection }); })
      .catch((e) => { if (active) setMeta({ status: e?.status === 404 ? "notfound" : "error", collection: null }); });
    return () => { active = false; };
  }, [slug]);

  if (meta.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (meta.status === "notfound") return <p className="collection-page__status">Collection not found.</p>;
  if (meta.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  return (
    <main className="collection-page">
      <CollectionView collection={meta.collection} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />
      <CatalogBrowse endpoint={`/api/catalog/collections/${slug}`} />
    </main>
  );
}
```

Trim `apps/client/src/pages/CollectionPage.css` to keep only the page/hero/status rules (remove
the `.collection-page__browse`, `__toolbar`, `__filters-btn`, `__pager` rules now in
`CatalogBrowse.css`):

```css
/* apps/client/src/pages/CollectionPage.css */
.collection-page { max-width: 1280px; margin: 0 auto; padding: var(--space-5, 24px); }
.collection-page__status { padding: 40px; text-align: center; color: var(--color-text-secondary, #64748b); }
```

- [ ] **Step 5: Run tests to verify**

Run: `npm test --workspace @planet-of-toys/client -- CatalogBrowse CollectionPage`
Expected: PASS — CatalogBrowse (2) and the existing CollectionPage (3) stay green (same API URLs).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/CatalogBrowse.jsx apps/client/src/components/CatalogBrowse.css apps/client/src/pages/CollectionPage.jsx apps/client/src/pages/CollectionPage.css apps/client/src/components/CatalogBrowse.test.jsx
git commit -m "feat(client): extract shared CatalogBrowse; refactor CollectionPage"
```

---

## Task 11: Storefront /category/:slug page

**Files:**
- Create: `apps/client/src/pages/CategoryPage.jsx`
- Modify: `apps/client/src/App.jsx` (route)
- Test: `apps/client/src/pages/CategoryPage.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/pages/CategoryPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CategoryPage from "./CategoryPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function renderAt(slug) {
  apiMock.get.mockImplementation((url) => {
    if (url === `/api/catalog/categories/${slug}`) return Promise.resolve({ category: { id: "c", name: "Building Blocks", heroTitle: "Build Big" } });
    if (url.includes("/filters")) return Promise.resolve({ filters: [] });
    if (url.includes("/products")) return Promise.resolve({ products: [{ id: "p", slug: "x", name: "Blocks Set", price: 10, images: [] }], total: 1, page: 1, limit: 24, pageCount: 1 });
    return Promise.resolve({});
  });
  return render(
    <MemoryRouter initialEntries={[`/category/${slug}`]}>
      <Routes><Route path="/category/:slug" element={<CategoryPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("CategoryPage", () => {
  it("renders the category hero and the shared browse grid", async () => {
    renderAt("building-blocks");
    expect(await screen.findByText("Build Big")).toBeInTheDocument();
    expect(await screen.findByText("Blocks Set")).toBeInTheDocument();
  });

  it("shows not-found on 404", async () => {
    apiMock.get.mockImplementation((url) => {
      if (url === "/api/catalog/categories/missing") return Promise.reject(Object.assign(new Error("nf"), { status: 404 }));
      return Promise.resolve({});
    });
    render(<MemoryRouter initialEntries={["/category/missing"]}><Routes><Route path="/category/:slug" element={<CategoryPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- CategoryPage`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the page**

```jsx
// apps/client/src/pages/CategoryPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import CatalogBrowse from "../components/CatalogBrowse.jsx";
import "./CollectionPage.css";

/**
 * Category browse page — first-class like a collection page. The category's
 * name/heroTitle/heroSubtitle/heroImage feed the shared CollectionView hero; the
 * shared CatalogBrowse drives filters + grid + sort + pagination.
 */
export default function CategoryPage() {
  const { slug } = useParams();
  const [meta, setMeta] = useState({ status: "loading", category: null });

  useEffect(() => {
    let active = true;
    setMeta({ status: "loading", category: null });
    apiClient.get(`/api/catalog/categories/${slug}`)
      .then((res) => { if (active) setMeta({ status: "ready", category: res.category }); })
      .catch((e) => { if (active) setMeta({ status: e?.status === 404 ? "notfound" : "error", category: null }); });
    return () => { active = false; };
  }, [slug]);

  if (meta.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (meta.status === "notfound") return <p className="collection-page__status">Category not found.</p>;
  if (meta.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  return (
    <main className="collection-page">
      <CollectionView collection={meta.category} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />
      <CatalogBrowse endpoint={`/api/catalog/categories/${slug}`} />
    </main>
  );
}
```

- [ ] **Step 4: Add the route**

In `apps/client/src/App.jsx`, add the import:

```jsx
import CategoryPage from "./pages/CategoryPage.jsx";
```

and add (next to the `collections/:slug` route):

```jsx
        <Route path="category/:slug" element={<CategoryPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- CategoryPage`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/pages/CategoryPage.jsx apps/client/src/App.jsx apps/client/src/pages/CategoryPage.test.jsx
git commit -m "feat(client): add /category/:slug browse page"
```

---

## Task 12: CMS-driven storefront Header (remove hardcoded categories)

**Files:**
- Modify: `apps/client/src/components/Header.jsx`
- Test: `apps/client/src/components/Header.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/components/Header.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "./Header.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

describe("Header (CMS-driven nav)", () => {
  it("renders navigation items fetched from the navigation API", async () => {
    apiMock.get.mockResolvedValue({ items: [{ id: "1", label: "New Arrivals", href: "/collections/new", isMegaMenu: false, children: [] }] });
    render(<MemoryRouter><Header /></MemoryRouter>);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/api/catalog/navigation?menuKey=header"));
    expect(await screen.findByRole("link", { name: "New Arrivals" })).toHaveAttribute("href", "/collections/new");
  });

  it("does not crash and renders the search when nav is empty", async () => {
    apiMock.get.mockResolvedValue({ items: [] });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByLabelText(/search the store/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @planet-of-toys/client -- Header`
Expected: FAIL — Header uses the hardcoded `CATEGORIES`, never calls the API.

- [ ] **Step 3: Rewrite the nav portion of Header**

In `apps/client/src/components/Header.jsx`:

1. Update imports at the top:

```jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { NavigationView } from "@planet-of-toys/shared-web";
import logo from "../assets/logo.webp";
import "./Header.css";
```

2. Delete the `const CATEGORIES = [ ... ];` block entirely.

3. Inside the `Header` component, add nav state + fetch (after the existing `menuOpen` state):

```jsx
  const [navItems, setNavItems] = useState([]);
  useEffect(() => {
    let active = true;
    apiClient.get("/api/catalog/navigation?menuKey=header")
      .then((res) => { if (active) setNavItems(res.items || []); })
      .catch(() => { if (active) setNavItems([]); });
    return () => { active = false; };
  }, []);
```

4. Replace the entire `<nav id="site-header-nav" …> … </nav>` block (the one mapping
`CATEGORIES`) with the shared component in both desktop and mobile form:

```jsx
      <div id="site-header-nav" className={`site-header__nav${menuOpen ? " site-header__nav--open" : ""}`}>
        <div className="site-header__nav-desktop">
          <NavigationView items={navItems} variant="desktop" resolveImageUrl={(f) => mediaUrl(f)} onNavigate={() => setMenuOpen(false)} />
        </div>
        <div className="site-header__nav-mobile">
          <NavigationView items={navItems} variant="mobile" resolveImageUrl={(f) => mediaUrl(f)} onNavigate={() => setMenuOpen(false)} />
        </div>
      </div>
```

5. Append to `apps/client/src/components/Header.css`:

```css
.site-header__nav-mobile { display: none; }
@media (max-width: 860px) {
  .site-header__nav-desktop { display: none; }
  .site-header__nav { display: none; }
  .site-header__nav--open { display: block; }
  .site-header__nav--open .site-header__nav-mobile { display: block; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @planet-of-toys/client -- Header`
Expected: PASS (2 tests). Run `npm test --workspace @planet-of-toys/client -- App` if an App/router test references the old header nav, and confirm it still passes.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/Header.jsx apps/client/src/components/Header.css apps/client/src/components/Header.test.jsx
git commit -m "feat(client): CMS-driven header navigation (remove hardcoded categories)"
```

---

## Task 13: Full-suite verification + final review

**Files:** none (verification only).

- [ ] **Step 1: Run every workspace suite individually** (avoid concurrent property-test timeouts)

```bash
npm test --workspace server
npm test --workspace @planet-of-toys/shared-web
npm test --workspace @planet-of-toys/admin
npm test --workspace @planet-of-toys/client
```
Expected: all green. Re-run any fast-check property file alone if it times out under load.

- [ ] **Step 2: Manual smoke (optional, if a dev DB is available)**

In Admin → Content → Navigation, add a mega item targeting a Category with a featured Collection
child (upload an image); confirm the live desktop/mobile preview. On the storefront, the header
renders the CMS nav; the mega panel shows links + the featured card; a category link opens
`/category/:slug` with the same browse experience (filters + grid + sort + pagination) as a
collection page.

- [ ] **Step 3: Final review checklist (inline)**

Confirm: one `NavigationItem` model (no second nav model); header nav fully CMS-driven (no
`CATEGORIES` remains); category/collection nav targets are entity-based with hrefs resolved
server-side (no raw URLs); `menuKey` present; category pages reuse the B browse experience via the
scope-generic layer + shared `CatalogBrowse`; shared `NavigationView` powers storefront + admin
preview; archived/inactive excluded from public reads.

---

## Plan Self-Review

**Spec coverage:** builds on existing NavigationItem (T1–T2, no second model) · CMS-driven nav
(T2,T5,T6,T9,T12) · shared View + desktop/mobile previews (T7,T8,T9) · mega-menu + featured cards
(T1,T7) · server-resolved entity hrefs / no raw URLs (T1,T2) · `menuKey` (T1) · category pages
reuse B browse (T3,T4,T10,T11) · no hardcoded header categories after C (T12). All requirements +
both adjustments map to tasks.

**Placeholder scan:** none. Deferred items (footer/account menus via `menuKey`, per-category stored
filter config) are explicit future extensions, not gaps.

**Type/name consistency:** scope shape `{ field, id }` consistent across `resolveFiltersForScope`
(T3), `queryProductsForScope` (T3), and the category service (T4). Nav item resolved shape
(`{id,label,href,openInNewTab,isMegaMenu,featured,image,children}`) consistent across
`getPublicNavigation` (T2), `NavigationView` (T7/T8), Header (T12), and admin preview (T9). API
paths consistent across routers (T5,T6) and clients (T9,T10,T11,T12). `CatalogBrowse` `endpoint`
prop consistent across collection (T10) and category (T11) pages. `menuKey` consistent across model
(T1), service (T2), routes (T5,T6), admin (T9), Header (T12).

**Ordering:** model/service (T1–T2) → scope refactor (T3) → category service (T4) → routes
(T5,T6) → shared components (T7,T8) → admin (T9) → shared client component (T10) before the pages
that use it (T11) and Header (T12).
