# Hero Engine — Design Specification

> **Status:** Approved architecture (with required changes), pending final spec review before the TDD plan.
> **Scope:** A reusable, admin-managed homepage Hero Engine: multiple slide *types* rendered
> in selectable *display modes*, scheduling + priority on every slide, soft-delete/restore,
> analytics-ready fields, shared storefront/admin render path, and a real `HomePage` wrapper
> with the Hero as one section. No changes to checkout, orders, payments, shipping, WhatsApp,
> auth, or existing business logic.

## 1. Revised architecture tree

```
server/src/modules/hero/                 (new module)
  heroSlide.model.js        # HeroSlide schema (type + displayMode + scheduling + priority +
                            #   soft-delete + analytics fields)
  hero.service.js           # CRUD, list/active filtering, reorder, activate/deactivate,
                            #   softDelete/restore; resolves ctaHref + gridItems
  hero.controller.js        # thin HTTP layer
  hero.public.router.js     # GET /api/hero
  hero.admin.router.js      # admin CRUD (auth)
  *.test.js

server/src/shared/constants/routerMounts.js   # + hero, heroAdmin
server/src/index.js                            # wire routers
server/src/models/index.js                     # register HeroSlide
server/src/scripts/seed-hero.js + seed:hero    # sample slides

packages/shared-web/src/hero/            (new, shared by storefront + admin preview)
  HeroEngineView.jsx        # carousel engine (autoplay/swipe/keyboard/dots/arrows/lazy)
  HeroSlideView.jsx         # dispatches to a layout by displayMode
  layouts/HeroFullBanner.jsx · HeroSplit.jsx · HeroVideo.jsx · HeroCollectionGrid.jsx · HeroEvent.jsx
  hero-views.css            # token-driven styles
  index.js
  (main barrel re-exports HeroEngineView)

apps/client/src/
  pages/HomePage.jsx        # <HomePage><HeroEngine/>{future sections}</HomePage>  (index route)
  components/HeroEngine.jsx  # homepage SECTION: fetches /api/hero, renders HeroEngineView

apps/admin/src/pages/admin/content/HeroBannerPage.jsx   # real editor (replaces placeholder)
```

**type vs displayMode (key change #1):** `type` is the slide's *semantic purpose*
(campaign/product/video/collection/category/seasonal); `displayMode` is its *layout*
(full_banner/video/split/collection_grid/event). Rendering keys off `displayMode`, so the same
campaign can render as a full banner, a split layout, or a collection grid without new types.

## 2. Updated schema (`HeroSlide` — many docs)

```js
HeroSlide {
  type: enum [campaign, product, video, collection, category, seasonal],
  displayMode: enum [full_banner, video, split, collection_grid, event],
  title, subtitle, ctaText,
  // CTA destination (resolved to ctaHref server-side):
  ctaType: enum [product, collection, category, customUrl, none],
  productId (ref Product|null), collectionId (ref Collection|null),
  categoryId (ref Category|null), customUrl (String),
  // media (filenames via the existing media endpoint):
  desktopMedia, mobileMedia, video, posterImage,
  // optional manual product selection for displayMode "collection_grid":
  gridProductIds ([ref Product], default []),   // if set, overrides derived grid items
  // status / scheduling / ordering (ALL slide types):
  status: enum [draft, published] (default "draft"),   // Draft/Published (publish gate)
  active (Bool, default true),
  deletedAt (Date|null),                 // soft delete (#2)
  startDate (Date|null), endDate (Date|null),   // scheduling on every type (#3)
  priority (Number, default 0),          // higher shows first (#4)
  sortOrder (Number, default 0),         // tiebreaker within a priority
  // analytics-ready (schema only, no implementation) (#6):
  impressions (Number, default 0), clicks (Number, default 0),
  // future-proofing:
  meta (Mixed, default {}),
  timestamps; toJSON _id -> id
}
// Indexes: { deletedAt:1, active:1 }, { priority:-1, sortOrder:1 }, { startDate:1 }, { endDate:1 }
```

**Public visibility rule:** a slide is shown when `deletedAt == null` AND `status == "published"`
AND `active == true` AND (`startDate == null` OR `startDate <= now`) AND (`endDate == null` OR
`endDate >= now`). **Order:** `priority` desc, then `sortOrder` asc, then `createdAt` desc.
(`status` gates whether a slide is publishable at all; `active` is the quick on/off toggle within
published — both must pass.)

## 3. Updated API contracts

```
Public  GET /api/hero
  → { slides: [ visible+ordered, each resolved ] }
    slide: { id, type, displayMode, title, subtitle, ctaText, ctaHref,
             desktopMedia, mobileMedia, video, posterImage, gridItems? }
    ctaHref: product→/product/:slug · collection→/collections/:slug ·
             category→/category/:slug · customUrl→customUrl · none→null
    gridItems: present only for displayMode "collection_grid" — up to 4 product cards
               {id,slug,name,price,images}. Source: the slide's `gridProductIds` (manual
               selection, in order) when set; otherwise derived from the linked
               collection/category (reuses queryProductsForScope, limit 4).

Admin (auth)   ROUTER_MOUNTS.heroAdmin = /api/admin/hero
  GET    /                 (all; ?includeDeleted=true to include soft-deleted)
  POST   /                 create
  GET    /:id              · PUT /:id   update
  PATCH  /:id/active       { active: bool }     (activate/deactivate)
  POST   /:id/soft-delete  · POST /:id/restore  (soft delete / restore — no hard delete)
  PUT    /reorder          [{ id, sortOrder, priority? }]
ROUTER_MOUNTS.hero = /api/hero
```

## 4. Updated admin UX (Content → Hero Banner)

The reserved Hero Banner page becomes the editor:
- **Slide list:** type + displayMode + **status (Draft/Published)** badges, title, active toggle,
  move up/down (reorder), edit, **soft-delete**; an **"Show deleted"** filter exposes
  soft-deleted slides with a **Restore** action. Priority shown/editable.
- **Add/Edit form (adapts to `type` + `displayMode`):** title/subtitle/CTA text; `ctaType` +
  the matching Product/Collection/Category picker or Custom URL; desktop/mobile image uploads;
  **video + poster** uploads (when displayMode=video); **start/end dates** (all types);
  **status (Draft/Published)**; **priority** + active. When displayMode=`collection_grid`, an
  **optional manual product multi-select** (`gridProductIds`); leaving it empty falls back to the
  linked collection/category. Uploads use the existing media endpoint; pickers reuse the
  `TaxonomyAssignment`/entity-select pattern.
- **Live preview:** `HeroEngineView` in `DevicePreview` (desktop + mobile), fed from the
  in-progress slide(s).
- Actions covered: Add, Edit, Reorder, Activate/Deactivate, Soft Delete, Restore, Preview —
  for all six slide types.

## 5. Homepage integration strategy (#5)

The index route renders a real **`HomePage`** composed of sections, not the hero alone:

```jsx
// apps/client/src/pages/HomePage.jsx
<main className="home">
  <HeroEngine />                 {/* homepage section: fetches /api/hero, renders HeroEngineView */}
  {/* Future sections (placeholders now, built in later sub-projects):
      Shop By Age · Shop By Category · Best Sellers · New Arrivals ·
      Featured Collections · Reviews · Why Choose Us */}
</main>
```

`HeroEngine` is a self-contained homepage **section** (data-fetching wrapper around the pure
`HeroEngineView`), so it can be reused/moved and the homepage can grow without touching the hero.

## 6. Video slide requirements (#8)

`displayMode="video"` (typically `type="video"`): `<video autoplay muted loop playsInline
preload="none" poster>` with MP4 + optional WebM `<source>`s; a user **unmute** toggle; only the
**active** slide plays (others paused). Supports linking a single product → CTA navigates to it.
No hotspots, no product tagging.

## 7. Migration plan

- **New collection only** (`HeroSlide`) — no existing hero data to migrate; no destructive
  changes. Adds the indexes listed in §2.
- **Routes:** the storefront index route changes from a placeholder to `HomePage`; all existing
  routes (checkout, order success, policy pages, collection/category) are untouched.
- **Admin:** the existing `HeroBannerPage` placeholder is replaced in place; its route/sidebar
  entry already exist.
- **Seed:** `seed:hero` inserts a few sample slides (a campaign full-banner, a collection grid,
  a video) so the homepage renders immediately; idempotent (skips by title) and editable after.
- **Back-compat:** no shared schema/field is altered; `mediaUrl`, `DevicePreview`, and the media
  endpoint are reused as-is. Rollback = drop the `HeroSlide` collection + revert the index route.

## 8. Performance considerations

- First (highest-priority) slide media eager for LCP; subsequent slides `loading="lazy"`.
- `<picture>` serves `mobileMedia` to phones, `desktopMedia` to larger screens.
- Video `preload="none"` + poster; plays only when its slide is active; paused otherwise.
- Autoplay = 4s timer cleared on unmount, **paused on hover** and when the tab is hidden
  (`visibilitychange`); disabled under `prefers-reduced-motion`.
- CSS opacity/transform transitions (GPU-friendly); no layout thrash.
- `gridItems` (collection_grid) limited to 4 and resolved server-side in one query.

## 9. SEO & accessibility

Titles/subtitles render as real DOM text; CTAs are real `<a href>`; the carousel uses
`aria-roledescription="carousel"`, per-slide `aria-label`, focusable prev/next + dot controls,
and left/right arrow-key navigation. Inactive slides remain in the DOM (visually hidden) so
content is crawlable.

---

## Architecture Self-Review

1. **Placeholders:** none. Future homepage sections and analytics *implementation* are explicitly
   deferred (schema/wrapper prepared now).
2. **Consistency:** soft-delete/restore + scheduling + priority are uniform across all types;
   displayMode (not type) drives layout everywhere (§1/§2/§4); ctaHref resolution matches the
   navigation pattern from Sub-project C.
3. **Scope:** one cohesive module; no checkout/orders/payments/auth/shipping/WhatsApp changes.
4. **Ambiguity resolved:** type vs displayMode separation explicit; visibility rule and ordering
   defined precisely; soft-delete replaces hard delete; gridItems derivation bounded to 4.

## Remaining Scalability Concerns (and mitigations)

1. **Active-slide query** uses indexed `deletedAt/active` + `priority/sortOrder`; trivial at hero
   volumes; date filtering done in-query.
2. **collection_grid gridItems** reuse the indexed `queryProductsForScope` (limit 4) — cheap;
   cache later if needed.
3. **Future slide types/layouts** add an enum value + a layout component; `meta` absorbs any
   per-type extras — no schema redesign.
4. **Analytics** fields exist now; a later increment can add impression/click endpoints without
   touching the render path.
