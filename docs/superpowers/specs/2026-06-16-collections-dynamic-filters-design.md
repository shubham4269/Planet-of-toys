# Collections + Dynamic Filters — Design Specification (Sub-project B)

> **Status:** Approved design, pending final spec review before the TDD plan is written.
> **Scope:** Sub-project B of the Catalog Foundation. Builds real collection browse pages:
> dynamic filters generated from Attributes/AttributeValues, per-collection filter
> configuration as the source of truth, product grid + sorting + page-based pagination, and
> URL-driven filter state. Desktop + mobile filter experiences via shared View components
> consumed by both storefront and admin preview. Collection membership stays **manual**.

## Decomposition context

Part of the sequenced Catalog Foundation. A (Catalog Taxonomy) is built. B builds on A with
**no architectural change**: same `catalog` module conventions, shared `packages/shared-web`
View components, storefront `/collections/:slug`, strict TDD. Later sub-projects: C (Dynamic
Navigation), D (Landing Pages), E (Homepage Merchandising), F (Search & Discovery).

## 1. Architecture Review

B adds, within the existing `catalog` module: a **CollectionFilterConfig** model (per-collection
source of truth for which filters appear), a **filter-definition resolver** (config → display-ready
filters generated from Attribute/AttributeValue records), and a **product query service**
(filter + sort + page over a collection's manually-assigned active products). Public APIs emit
only configured filters and a paginated product page. Shared **FilterView / ProductGrid /
ProductCard / SortControl** components drive the storefront browse page and the admin live
preview — one rendering path. **Nothing is hardcoded**: no Age/Theme/Skill/Product-Type filters
in code; all come from Attributes. One small additive change to A: `AttributeFilterView` becomes
*controlled* (accepts current selection + onChange) so it works for live filtering.

Cross-cutting rules carried from A: media as filenames only; archived records excluded from
public APIs; flat `attributeValueIds` (indexed) power filtering; no Brands module.

## 2. Data Models

```js
// New: CollectionFilterConfig — one per collection; the filter source of truth.
CollectionFilterConfig {
  collectionId (ref Collection, required, unique, indexed),
  filters: [{
    type: "attribute" | "price" | "category",   // attribute-driven + built-ins
    attributeId (ref Attribute | null),          // set only when type === "attribute"
    enabled (Bool, default true),
    sortOrder (Number, default 0),
  }],
  deletedAt (Date | null),
}  // toJSON: _id→id

// Product (extend existing model) — merchandising + best-selling fields.
+ salesCount:        { type: Number,  default: 0,     index: true }  // drives best-selling sort
+ isFeatured:        { type: Boolean, default: false, index: true }  // future merchandising/homepage
+ merchandisingRank: { type: Number,  default: 0,     index: true }  // future curated ordering
```

- Only `salesCount` is *used* by B (the `best-selling` sort). `isFeatured` / `merchandisingRank`
  are foundation for Sub-project E (homepage merchandising) — added now to avoid a later
  Product migration; no B feature reads them.
- `salesCount` is manually editable now; a future order-analytics pipeline can populate it
  **without changing the sort layer**.
- No `CollectionFilterConfig` for a collection ⇒ a **synthesized default**: all active
  `isFilterable` attributes (ordered by their `sortOrder`) plus a built-in price filter.
  Saving a config makes it authoritative.

## 3. API Contracts

```
Public (read)   ROUTER_MOUNTS.catalog = /api/catalog

  GET /collections/:slug/filters
    → { filters: [ resolved definition ] }   // only ENABLED entries (or the default)
      attribute → { key:"f_<attrSlug>", type:"attribute", attributeSlug, name, displayType,
                    values:[{ slug, name, swatchHex }] }
      price     → { key:"price",   type:"range", min, max }   // from the collection's products
      category  → { key:"category", type:"tree",  options:[{ slug, name }] }

  GET /collections/:slug/products
      ?f_<attrSlug>=valSlug,valSlug    (repeatable across attributes; multi-select)
      &price=<min>-<max>
      &category=<categorySlug>
      &sort=featured|newest|price-asc|price-desc|name|best-selling   (default: featured)
      &page=1&limit=24
    → { products:[ card projection ], total, page, limit, pageCount, appliedFilters }
      card projection: { id, slug, name, price, compareAtPrice, discountPercent, images }

Admin (auth)    ROUTER_MOUNTS.catalogAdmin = /api/admin/catalog
  GET /collections/:id/filter-config   → resolved config (synthesizes the default if none stored)
  PUT /collections/:id/filter-config   → body { filters:[{ type, attributeId?, enabled, sortOrder }] }
```

**Filter semantics:** multi-select **within** one attribute = OR; **across** attributes = AND;
price and category = AND. Filters narrow the collection's manually-assigned **active** products.
The query resolves value/category slugs → ids server-side and uses indexed `attributeValueIds`
(`$in`) + a `price` range. Unknown slugs are ignored (never error).

**Sort layer:** a fixed `SORT_SPECS` map — `featured` → collection curated order
(`merchandisingRank`/insertion fallback), `newest` → `createdAt:-1`, `price-asc`/`price-desc`,
`name` → `name:1`, `best-selling` → `salesCount:-1`. Adding analytics later changes only how
`salesCount` is populated, not this map.

**Deferred (YAGNI):** no live per-value facet counts in B. Filters list values; the grid shows
results. (Correct multi-facet counts need careful aggregation — a later enhancement.)

## 4. CollectionFilterConfig design

A per-collection, ordered list of filter entries. The admin enables/disables each attribute
(and the built-in price/category filters) and reorders them; `PUT` replaces the whole `filters`
array. The public `/filters` endpoint returns only enabled entries, resolved to display-ready
definitions (attribute values pulled live from AttributeValue, so renaming/adding values needs
no config change). When no config is stored, the resolver synthesizes the default described in
§2. This keeps "config is the source of truth" while letting new collections filter immediately.

## 5. Storefront UX flows

`/collections/:slug` renders the `CollectionView` hero (from A) followed by a **browse region**:
filter panel + product grid + sort control + pagination, all driven by **URL query params**
(the URL is the single source of filter/sort/page state — back/forward and link-sharing work).

- **Desktop:** sticky left filter sidebar; product grid right; sort `<select>` top-right;
  numbered pagination at the bottom.
- **Mobile:** a "Filters" button opens a full-height drawer rendering the same `FilterView`;
  "Apply" commits selections to the URL; sort is a compact `<select>`. Genuine responsive
  layout (the shared grid/`FilterView` reflow by container width), not a scaled desktop view.
- Any filter/sort/page change rewrites the query string → refetch `/products` → re-render the
  grid. Empty results show an empty state with a "Clear filters" action.

## 6. Admin Information Architecture

Extend the existing **Catalog → Collections** page. Selecting a collection reveals a **Filters**
configuration panel: a list of the available attributes plus the built-in price and category
filters, each with an enable toggle and move up/down controls, beside a `DevicePreview` showing
the live `FilterView` (desktop sidebar + mobile drawer) built from the in-progress config — no
save required for the preview to update. A Save button persists via `PUT /filter-config`. No new
sidebar entry.

## 7. Shared Component Plan

```
packages/shared-web/src/catalog/
  ProductCard.jsx       // extracted from CollectionView's inline card (single source of truth)
  ProductGrid.jsx       // responsive grid of ProductCard + empty state
  SortControl.jsx       // controlled <select> of sort options
  FilterView.jsx        // renders resolved filter definitions → controls; desktop sidebar +
                        //   mobile drawer; composes (controlled) AttributeFilterView per
                        //   attribute + a price range control + a category control
  AttributeFilterView.jsx  // EXTENDED to controlled: selected[] + onToggle (back-compatible)
  CollectionView.jsx       // REFACTORED to render via ProductCard (no behavior change)
```

All pure/presentational, token-driven CSS in the shared `catalog-views.css`; consumed by the
storefront browse page **and** the admin preview — single source of truth, no admin-only
rendering.

## 8. TDD Execution Plan (task outline)

Each task strict TDD (failing test → minimal impl → pass → commit). Detailed per-step code is
produced by writing-plans on approval. Logical grouping: models → services → APIs/wiring →
shared components → storefront → admin → verification.

1. `CollectionFilterConfig` model + tests
2. Product `salesCount` / `isFeatured` / `merchandisingRank` fields + tests
3. Filter-config service (get-with-synthesized-default, replace/save) + tests
4. Filter-definition resolver service (config → resolved filters; price min/max; category options) + tests
5. Product query service (filter + sort + paginate; slug→id resolution; `SORT_SPECS`) + tests
6. Catalog controller additions + public `/filters` and `/products` routes + tests
7. Admin `/filter-config` GET/PUT routes + tests
8. Extend `AttributeFilterView` to controlled (selected + onToggle) + tests
9. `ProductCard` (extract; refactor `CollectionView`) + tests
10. `ProductGrid` (+ empty state) + tests
11. `SortControl` + tests
12. `FilterView` (desktop sidebar + mobile drawer; composes the above) + tests
13. `useFilterState` URL-state hook (parse/serialize query params) + tests
14. Storefront collection browse page (compose hero + FilterView + grid + sort + pagination, URL-driven) + tests
15. Admin Collections filter-config panel + live preview + tests
16. Full-suite verification + final review

---

## Architecture Self-Review

1. **Placeholders:** none. Deferred items (facet counts, rule-based membership, merchandising
   *use* of isFeatured/merchandisingRank) are explicitly assigned out of B, not vague.
2. **Consistency:** models ↔ APIs ↔ IA ↔ components align. `f_<slug>` query keys are consistent
   across §3/§5/§7 (the `useFilterState` hook). Config-as-source-of-truth with a synthesized
   default is consistent across §2/§3/§4. `/collections/:slug` URL preserved from A.
3. **Scope:** focused on B. Merchandising fields are schema-only foundation; only `salesCount`
   is read (best-selling sort).
4. **Ambiguity resolved:** filter combination (OR within / AND across); slugs resolved
   server-side; unknown slugs ignored; no-config → all filterable attributes + price; sort via a
   fixed extensible map; pagination is page-based with totals.

## Remaining Scalability Concerns (and mitigations)

1. **Filter queries over `attributeValueIds`.** Multikey-indexed `$in` + indexed `price` scale to
   thousands of products per collection. Mitigation in place; a denormalized facet-count cache can
   be added later (when counts ship) without schema change.
2. **`featured`/`best-selling` sorts.** Backed by indexed `merchandisingRank` / `salesCount`, so
   sorted+paginated reads stay index-friendly.
3. **Default (no-config) collections.** The resolver builds the default from a small set of
   filterable attributes per request; cheap. If attribute counts grow large, cache the resolved
   default per collection — no schema change.
4. **Pagination.** `skip/limit` is fine to mid-depth; if very deep pagination appears, switch to a
   keyset cursor on the sort key — isolated to the query service.
