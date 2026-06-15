# Catalog Taxonomy — Design Specification (Sub-project A)

> **Status:** Approved design, pending final spec review before the TDD plan is written.
> **Scope:** Sub-project A of the Catalog Foundation. Builds the taxonomy data layer,
> admin management, shared storefront View components + live preview, and a minimal
> storefront proof. Collections, navigation, and content fields are introduced at the
> **schema/foundation** level now so later sub-projects (B–F) need no schema rewrite.

## Decomposition context

The full Catalog Foundation is split into sequenced sub-projects, each with its own
spec → plan → build cycle:

| # | Sub-project | Built |
|---|---|---|
| **A** | **Catalog Taxonomy** (this spec) | now |
| B | Collections + Dynamic Filters (rule engine, product grids, filter UI) | later |
| C | Dynamic Navigation (header/mobile/footer menus, nav admin UI + storefront) | later |
| D | Category/Collection Landing Pages | later |
| E | Homepage Merchandising Sections | later |
| F | Search & Discovery | later |

**Sub-project A deliberately lays foundation for B–F** by defining the models, fields,
and relationships they need, while building full UI/storefront behavior only for the
taxonomy management and a single collection proof.

---

## 1. Architecture Review

A new storefront-agnostic `catalog` module owns five entities — **Category, Collection,
Attribute, AttributeValue, NavigationItem** — following the project's established
conventions: `*.model.js` → `service` → `controller` → admin (auth) + public (read)
routers, mounted via `ROUTER_MOUNTS`, with strict TDD. The existing `products` module is
extended to *reference* taxonomy (`categoryIds`, `collectionIds`, `attributeValueIds`).

Storefront and admin share pure presentational `*View` components from
`packages/shared-web` (the proven `FooterView` pattern). There is **one rendering path**
for both admin live preview and the storefront — no admin-only rendering logic.

Cross-cutting rules:
- **Nothing hardcoded.** Filters, age groups, skills, interests, learning areas, product
  types all derive from Attribute/AttributeValue records — never from code constants.
- **No Brands module.** Planet of Toys manufactures its own products; brand entities,
  filters, and pages are intentionally excluded.
- **Media references only.** Image fields store a media *filename* produced by the
  existing `POST /api/admin/media` upload and served at `GET /api/media/:filename`
  (exactly how `Product.images` works today). Arbitrary external URLs are never stored.
- **Archive, never hard delete.** Every catalog record supports archive/restore via
  `deletedAt`; archived records are excluded from public APIs and default admin lists.
- **Bulk-ready.** Services and APIs operate on arrays / sets of IDs so future bulk
  assignment tools require no redesign.

## 2. Domain Model Diagram

```
Category ──parentId──▶ Category               (self-referential tree, unlimited depth)
Attribute ──1:N──▶ AttributeValue             (value knows its parent → grouping is free)
Collection                                     (manual | rules | hybrid; rules eval in B)

NavigationItem ──targetType/targetId──▶ {Category | Collection | internalRoute | externalUrl}

Product ──categoryIds[]────────▶ Category
Product ──collectionIds[]───────▶ Collection   (manual membership now; rule-eval in B)
Product ──attributeValueIds[]──▶ AttributeValue (flat IDs; attribute grouping derived)
```

## 3. Database Models

All models: `timestamps: true`; `toJSON` transform maps `_id`→`id`, drops `__v`.
All support archive via `deletedAt: Date | null`.

```js
Category {
  name, slug (unique, indexed),
  parentId (ref Category | null, indexed),
  image       (media filename | null),     // card/thumbnail
  // content fields (foundation for landing pages, Sub-project D):
  heroTitle, heroSubtitle,
  heroImage   (media filename | null),
  seoContent  (String, long-form HTML/markdown body),
  description,
  sortOrder (Number, default 0),
  isActive (Bool, default true),
  seoTitle, seoDescription,
  deletedAt (Date | null)
}

Collection {
  name, slug (unique, indexed),
  description,
  mode (enum: manual | rules | hybrid, default manual),  // rule defs added in B
  // merchandising / navigation foundation:
  featuredOnHome   (Bool, default false),
  showInNavigation (Bool, default false),
  navigationLabel  (String, default ""),
  navigationOrder  (Number, default 0),
  // content fields (foundation for landing pages):
  heroTitle, heroSubtitle,
  heroImage  (media filename | null),
  seoContent (String),
  sortOrder (Number, default 0),
  isActive (Bool, default true),
  seoTitle, seoDescription,
  deletedAt (Date | null)
}

Attribute {
  name, slug (unique, indexed),
  displayType (enum: checkbox | radio | dropdown | color | button | range),
  sortOrder (Number, default 0),
  isFilterable (Bool, default true),
  isActive (Bool, default true),
  deletedAt (Date | null)
}

AttributeValue {
  attributeId (ref Attribute, indexed, required),
  name, slug,
  swatchHex (String | null),               // only meaningful when displayType=color
  sortOrder (Number, default 0),
  isActive (Bool, default true),
  deletedAt (Date | null)
}  // compound unique index: (attributeId, slug)

NavigationItem {                            // FOUNDATION ONLY — no admin UI / storefront in A
  label (String, required),
  targetType (enum: category | collection | internalRoute | externalUrl),
  targetId   (ObjectId | null),             // ref Category or Collection when applicable
  url        (String, default ""),          // internal route or external URL
  menu (enum: header | mobile | footer | promo, default header),
  parentId (ref NavigationItem | null),     // supports nested menus later
  sortOrder (Number, default 0),
  openInNewTab (Bool, default false),
  isActive (Bool, default true),
  deletedAt (Date | null)
}

// Product (extend existing model — products module)
+ categoryIds:       [ref Category]        default []
+ collectionIds:     [ref Collection]      default []   // manual membership
+ attributeValueIds: [ref AttributeValue]  default []   // indexed for B's filters
```

**Archive semantics:** setting `deletedAt` excludes a record from public APIs and from
default admin lists; an "Archived" admin filter lists them; **Restore** clears
`deletedAt`. Archiving a Category that has child categories, or any record with assigned
products, is **guarded** — the service refuses with a clear, client-safe error rather
than silently orphaning. (Reassignment-then-archive is the operator's path.)

## 4. API Contracts

```
Admin (auth)   ROUTER_MOUNTS.catalogAdmin = /api/admin/catalog

  Categories
    GET    /categories                 (full tree; ?archived=true for archived)
    POST   /categories
    GET    /categories/:id
    PUT    /categories/:id
    POST   /categories/:id/archive
    POST   /categories/:id/restore
    PUT    /categories/reorder         body: [{ id, parentId, sortOrder }]

  Collections
    GET    /collections                (?archived=true)
    POST   /collections
    GET    /collections/:id
    PUT    /collections/:id
    POST   /collections/:id/archive
    POST   /collections/:id/restore
    PUT    /collections/reorder        body: [{ id, sortOrder }]

  Attributes (+ inline values)
    GET    /attributes                 (each with its values)
    POST   /attributes
    GET    /attributes/:id
    PUT    /attributes/:id
    POST   /attributes/:id/archive
    POST   /attributes/:id/restore
    PUT    /attributes/reorder
    POST   /attributes/:attrId/values
    PUT    /values/:id
    POST   /values/:id/archive
    POST   /values/:id/restore
    PUT    /attributes/:attrId/values/reorder

  Bulk product assignment (FOUNDATION — array-based, no UI yet)
    POST   /products/bulk-assign       body: {
                                         productIds: [id],
                                         add:    { categoryIds?, collectionIds?, attributeValueIds? },
                                         remove: { categoryIds?, collectionIds?, attributeValueIds? }
                                       }

Public (read)  ROUTER_MOUNTS.catalog = /api/catalog
  GET /categories            (active tree only; archived/inactive excluded)
  GET /categories/:slug
  GET /collections           (active only)
  GET /collections/:slug     (collection + its manually-assigned active products, for proof)
  GET /attributes            (active + isFilterable, each with active values)

  (NavigationItem public read is deferred to Sub-project C.)

Products: existing admin product create/update accept categoryIds, collectionIds,
          attributeValueIds; product payloads return them.
```

## 5. Admin Information Architecture

New top-level **Catalog** group (expandable `NavGroup`, placed above Content). Attribute
values are managed **inline** within each Attribute editor — there is no separate
Attribute Values nav section.

```
Catalog
├── Categories     /admin/catalog/categories     (tree + drag-drop + card preview)
├── Collections    /admin/catalog/collections    (list + drag-drop + hero/card preview)
└── Attributes     /admin/catalog/attributes     (list + drag-drop; editor manages its
                                                   Values inline + control preview)
```

Category / collection / attribute-value pickers are added to the existing **Products**
editor. NavigationItem has **no admin UI in Sub-project A** (foundation/model + API only).

The broader sidebar reorganization (Content → Navigation/Promotional Banner/Footer/
Landing Pages/Hero Sliders; Membership → Planet Families) is acknowledged as the target
IA but is delivered by Sub-projects C/D/E — not built here.

## 6. Live Preview Architecture (hard requirement)

Every editor renders a `DevicePreview` wrapper showing **desktop and a genuinely
responsive mobile frame side-by-side**. The mobile frame constrains the container width
so the shared component's own responsive CSS reflows (real responsive rendering — never a
scaled-down desktop screenshot). The preview is fed live from editor form state and
updates **without save**.

- **Categories** → `CategoryView` (storefront card grid).
- **Collections** → `CollectionView` (hero section + collection/category cards).
- **Attributes** → `AttributeFilterView` (the attribute rendered as its real
  `displayType` control populated with its values).

**Single source of truth:** the preview uses the *same* shared View components the
storefront will use. No duplicated or admin-only rendering logic. The preview is visually
identical to future storefront rendering.

## 7. Shared Component Architecture

```
packages/shared-web/src/catalog/
  CategoryView.jsx          // category card grid (image + name + child count)
  CollectionView.jsx        // collection hero (heroTitle/subtitle/image) + cards
  AttributeFilterView.jsx   // one attribute → control by displayType, with its values
  index.js                  // re-exports
```

Same contract as `FooterView`: no data fetching, props in, consumer supplies token-driven
CSS. The admin `DevicePreview` chrome (device frames) lives in `apps/admin` and *wraps*
these shared components; it never re-implements their markup. Identical components power
the storefront proof.

## 8. Storefront Integration Plan (minimal proof)

One real storefront route — **`/collections/:slug`** (permanent, SEO URL strategy; no
short aliases) — fetches `/api/catalog/collections/:slug` and renders `CollectionView`
(hero + cards) from live data. This proves: public API, shared View components, collection
rendering, and collection→category relationships, and establishes the seam where filters
plug in (Sub-project B). No full product grid yet. Header navigation remains hardcoded
until Sub-project C.

## 9. Future Sub-project Alignment

This foundation supports B–F with no schema redesign:
- **B (Collections + Filters):** `Collection.mode` + `Product.attributeValueIds` (flat,
  indexed) + `Attribute.isFilterable` are already present; B adds the rule definition and
  query engine only.
- **C (Navigation):** `NavigationItem` model + `Collection.showInNavigation/
  navigationLabel/navigationOrder` exist; C adds admin UI + storefront rendering.
- **D (Landing Pages):** `heroTitle/heroSubtitle/heroImage/seoContent` on Category and
  Collection exist; D adds the page builder + renderer.
- **E (Homepage Merchandising):** `Collection.featuredOnHome` exists; E adds section
  composition + homepage rendering.
- **F (Search & Discovery):** indexed slugs, category/collection/attribute relationships,
  and flat value IDs give a searchable, facetable foundation.

---

## Architecture Self-Review

1. **Placeholder scan:** No TBD/TODO. Deferred items (rule engine, nav UI, landing pages)
   are explicitly assigned to later sub-projects, not left vague.
2. **Internal consistency:** Models ↔ API ↔ IA align. Inline value management (no separate
   nav section) is consistent across §3/§4/§5. `/collections/:slug` is consistent across
   §4/§8. Archive (not delete) is consistent across §1/§3/§4.
3. **Scope:** Focused on Sub-project A. Foundation-only items (NavigationItem, bulk-assign,
   content fields, merchandising flags) are schema/API-level and explicitly excluded from
   full UI to avoid scope creep.
4. **Ambiguity resolved:** archive guard behavior (refuse, don't orphan); media = filename
   reference; mobile preview = real responsive reflow; attribute-value reference = flat ID
   array (locked, no maps).

## Remaining Scalability Concerns (and mitigations)

1. **Category tree reads at depth/breadth.** Building the full tree per request is fine at
   tens–hundreds of nodes. Mitigation already in place: indexed `parentId`/`slug`; tree is
   assembled in one query + in-memory build. If catalogs grow very large, add a cached
   tree projection later — no schema change needed.
2. **Filter queries over `attributeValueIds`.** Flat array is indexed (multikey), which
   scales to thousands of products for `$in` facet queries. Heavy multi-facet counts (B)
   may later want an aggregation/denormalized facet count cache; the flat-ID schema
   supports that without migration.
3. **Bulk assignment on thousands of products.** `bulk-assign` uses `updateMany` with
   `$addToSet`/`$pull` rather than per-document writes, so it stays O(1) round-trips.
   Validation of referenced IDs is done once up front against the catalog.
4. **Collection membership (manual now, rules later).** Manual `collectionIds` on the
   product scales for curated sets. Rule-based collections (B) should resolve via query at
   read time (or a periodically materialized member list) rather than fanning out writes —
   the `mode` field reserves this path.
5. **Media growth.** Filesystem media with unique WebP filenames is unchanged; catalog
   only stores references, so no new storage pressure.

## TDD Execution Plan (task outline)

Detailed per-step code is produced by the writing-plans skill on approval. Each task is
strict TDD: failing test → minimal implementation → pass → commit. Logical commit grouping:
**models**, **services**, **routers/wiring**, **product integration**, **shared views +
preview**, **admin pages**, **storefront proof**, **seed**.

1. Category model (schema, slug, content fields, archive, toJSON) + tests
2. Collection model (mode, merchandising flags, content fields) + tests
3. Attribute model + tests
4. AttributeValue model (compound index, swatchHex) + tests
5. NavigationItem model (foundation) + tests
6. Catalog service — categories (CRUD, tree, slugify, reorder, archive/restore, guards) + tests
7. Catalog service — collections (CRUD, reorder, archive/restore) + tests
8. Catalog service — attributes + inline values (CRUD, value CRUD, reorder, archive/restore) + tests
9. Catalog service — navigation (basic CRUD foundation) + tests
10. Catalog controller + admin router (all admin endpoints, auth) + tests
11. Catalog public router (active reads, archived excluded) + tests
12. `ROUTER_MOUNTS` (`catalogAdmin`, `catalog`) + app wiring + wiring tests
13. Product model extension (categoryIds, collectionIds, attributeValueIds) + tests
14. Product service/controller accept + return new fields (ref validation) + tests
15. Product bulk-assign endpoint (`$addToSet`/`$pull`, ID validation) + tests
16. shared-web `CategoryView` + tests
17. shared-web `CollectionView` (hero + cards) + tests
18. shared-web `AttributeFilterView` (all displayTypes) + tests
19. Admin `DevicePreview` wrapper (desktop + responsive mobile frames) + tests
20. Admin Catalog nav group + routes (sidebar, App routes) + tests
21. Categories admin page (CRUD, drag-drop reorder/reparent, media picker, archive/restore, live preview) + tests
22. Collections admin page (CRUD, drag-drop, hero media, merchandising flags, archive/restore, preview) + tests
23. Attributes admin page (CRUD, inline value management, displayType, archive/restore, preview) + tests
24. Product editor: category/collection/attribute-value assignment UI + tests
25. Storefront `/collections/:slug` proof (page + `CollectionView` + public fetch) + tests
26. Catalog seed script (`seed:catalog` — sample categories, collections, attributes/values)
27. Final review (spec compliance + code quality)
