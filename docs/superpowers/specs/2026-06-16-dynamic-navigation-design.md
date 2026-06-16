# Dynamic Navigation — Design Specification (Sub-project C)

> **Status:** Approved design (with adjustments), pending final spec review before the TDD plan.
> **Scope:** Sub-project C of the Catalog Foundation. Makes storefront navigation fully
> CMS-driven from the existing `NavigationItem` model (no second model): admin editor, public
> navigation tree API with server-resolved hrefs, shared `NavigationView` (desktop mega-menu +
> mobile drawer) for storefront and admin preview, and first-class `/category/:slug` browse
> pages that reuse the Sub-project B browse experience. After C, no hardcoded header categories
> remain.

## Decomposition context

Builds on A (taxonomy, NavigationItem foundation) and B (collection browse: FilterView,
ProductGrid, SortControl, pagination, URL state). Same `catalog` module + shared `*View`
conventions, strict TDD, all work on `dev`. Later: D (Landing Pages), E (Homepage
Merchandising), F (Search).

## 1. Architecture Review

C extends the **existing** `NavigationItem` model and `navigation.service` from A — it does not
introduce a second navigation model. New: a public navigation tree API and admin CRUD (both in
the `catalog` module); a shared `NavigationView` (desktop bar + mega panel + featured collection
cards; `variant="mobile"` drawer) consumed by the storefront `Header` and admin preview; a
Content → Navigation admin editor; a CMS-driven `Header`; and `/category/:slug` browse pages.

To make category pages first-class without duplicating B, the B filter/query services are
**generalized to a "browse scope"** ({ field: `collectionIds` | `categoryIds`, id }). Collections
and categories share one resolve-filters + query-products code path; the storefront browse region
is extracted into one shared client component used by both page types.

**Internal-link integrity:** category/collection nav targets are stored as `targetType` +
`targetId` only — never a raw URL. The public API resolves the entity's current slug into an
`href` server-side. The admin service rejects a raw `url` for `category`/`collection` targets.

## 2. Data Model (extend NavigationItem — no new model)

```js
// add to the existing NavigationItem schema (from Sub-project A):
+ menuKey:    { String,  default "header", index: true }  // menu grouping; future-proof
                                                           //   (header/mobile/footer/account/membership…)
+ isMegaMenu: { Boolean, default false }                  // top-level item opens a mega panel
+ featured:   { Boolean, default false }                  // render this child as a collection card
+ image:      { String,  default null }                   // media filename for the featured card
// existing: label, targetType (category|collection|internalRoute|externalUrl), targetId, url,
//   menu (legacy enum — superseded by menuKey; left in place, unused), parentId, sortOrder,
//   openInNewTab, isActive, deletedAt
```

`menuKey` is the canonical grouping (a free-form string so future menus need no enum change).
The legacy `menu` enum stays defined for back-compat but is no longer used. Tree via `parentId`:
a header item with `isMegaMenu` opens a panel of its children (link columns + `featured` cards).

## 3. API Contracts

```
Public   GET /api/catalog/navigation?menuKey=header
  → { items: [ nested tree of ACTIVE items ] }, each resolved server-side:
    { id, label, href, openInNewTab, isMegaMenu, featured, image, children:[...] }
    href: collection → /collections/:slug · category → /category/:slug
          internalRoute/externalUrl → url   (category/collection NEVER use a raw url)

  GET /api/catalog/categories/:slug/filters    → { filters:[...] }   (browse scope = category)
  GET /api/catalog/categories/:slug/products?f_<slug>=&price=&category=&sort=&page=&limit=
      → { category, products, total, page, limit, pageCount }

Admin (auth)  /api/admin/catalog/navigation
  GET /              (full tree, ?archived=true to include archived)
  POST /             create   ·   PUT /:id   update
  POST /:id/archive  ·  POST /:id/restore  ·  PUT /reorder  ([{id,parentId,sortOrder}])
  Validation: targetType category/collection requires targetId and forbids a raw url;
              internalRoute/externalUrl require url.
```

## 4. CollectionFilterConfig / browse scope

A scope-generic browse layer:
- `resolveFilters(scope, configFilters)` and `queryProducts(scope, query)` where
  `scope = { field, id }` (`collectionIds` or `categoryIds`).
- **Collections:** scope `collectionIds`; `configFilters` from `CollectionFilterConfig`
  (stored, or synthesized default) — unchanged behavior.
- **Categories:** scope `categoryIds`; `configFilters` = the synthesized default (all active
  filterable attributes + price). No per-category stored config model in C (categories get
  first-class *browse*, not per-category curation yet — a clean future extension).
- The attribute/price/category condition builder and `SORT_SPECS` are reused as-is.

## 5. Admin IA

New **Content → Navigation** sidebar child (`/admin/content/navigation`; matches the target IA).
Editor for the `menuKey="header"` tree: add top-level / child items; choose `targetType` and pick
a Category/Collection (or enter an internal/external URL); toggle `isMegaMenu` / `featured`;
upload the featured `image` via the existing media endpoint; reorder (move up/down); archive /
restore — beside a live `NavigationView` in `DevicePreview` (desktop bar+panel and mobile
drawer). C manages the **header** menu; the mobile drawer derives from the same items.

## 6. Storefront UX

- **Desktop:** `Header` renders `NavigationView` — a bar of top-level items; an `isMegaMenu` item
  opens a panel (child link columns + featured collection cards: image + label) on click
  (accessible/testable), closing on outside-click/Esc.
- **Mobile:** the existing hamburger opens a drawer rendering the same items as expandable
  sections.
- Links use the server-resolved `href` (`/collections/:slug`, `/category/:slug`, internal,
  external; new tab when `openInNewTab`).
- **Category & collection pages share one browse experience:** filter sidebar + product grid +
  sort + pagination, fully URL-driven — they feel like equally first-class destinations.

## 7. Shared Component Plan

```
packages/shared-web/src/catalog/
  NavigationView.jsx        // desktop bar + mega panel + featured cards; variant="mobile" → drawer
  (catalog-views.css)       // + navigation styles
apps/client/src/components/
  CatalogBrowse.jsx         // shared browse region (FilterView + SortControl + ProductGrid +
                            //   pagination + useFilterState), fed by endpoint base + meta;
                            //   used by BOTH CollectionPage and CategoryPage (DRY)
```
`NavigationView` is pure/controlled; consumed by the storefront `Header` and the admin preview.
`CatalogBrowse` centralizes the B browse logic so collection and category pages stay identical.

## 8. TDD Execution Plan (outline)

1. Extend `NavigationItem` (menuKey, isMegaMenu, featured, image) + service writables + target validation + tests
2. `navigation.service`: `getNavigationTree({menuKey})` (active tree, server-resolved href), reorder, archive (extend) + tests
3. Generalize browse to scope: refactor `filterResolver`/`collectionQuery` to scope-generic `resolveFilters(scope,…)` / `queryProducts(scope,…)`; keep collection entry points green + tests
4. Category browse service functions (`resolveCategoryFilters`, `queryCategoryProducts` via scope) + tests
5. Controller + public routes (`/navigation`, `/categories/:slug/filters`, `/categories/:slug/products`) + tests
6. Admin navigation CRUD routes (`/admin/catalog/navigation` …) + tests
7. shared `NavigationView` desktop (mega + featured cards) + tests
8. `NavigationView` mobile drawer variant + nav CSS + tests
9. Admin Content → Navigation editor + sidebar child + route + preview + tests
10. Client `CatalogBrowse` shared component; refactor `CollectionPage` to use it + tests
11. Storefront `/category/:slug` page (uses `CatalogBrowse`) + route + tests
12. Storefront `Header` CMS-driven (remove `CATEGORIES`, render `NavigationView` from API) + tests
13. Full-suite verification + final review

---

## Architecture Self-Review

1. **Placeholders:** none. Deferred (per-category stored filter config, footer/account/membership
   menus) are explicit future extensions enabled by `menuKey` + the scope-generic browse layer.
2. **Consistency:** one model (`NavigationItem`); one browse code path (scope-generic) for
   collections + categories; hrefs resolved server-side everywhere; `/collections/:slug` and
   `/category/:slug` both first-class.
3. **Scope:** C = header menu + mobile drawer + category browse. No second nav model; no footer
   takeover (footer keeps its FooterContent CMS).
4. **Ambiguity resolved:** menuKey canonical (legacy `menu` retired); category/collection targets
   are entity-based (no raw URLs); mega panels open on click; category pages reuse the full B
   browse experience.

## Remaining Scalability Concerns (and mitigations)

1. **Navigation tree resolution** (resolving targetId→slug for hrefs): small per-request join over
   a handful of menu items; batch-load targets by id. Cache later if menus grow large.
2. **Category browse** rides B's indexed `categoryIds` + `attributeValueIds` + `price`; same
   scaling profile as collection browse.
3. **Scope generalization** keeps one tested query path — less surface area than parallel
   collection/category implementations.
