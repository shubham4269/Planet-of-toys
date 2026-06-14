# Promotional Header — Content Management (Design)

**Date:** 2026-06-14
**Branch:** dev
**Status:** Approved design, pre-implementation

## Goal

Introduce admin-managed, dynamic **storefront content** to Planet of Toys, starting
with a **Promotional Header** (the top announcement bar). This is the first item of a
new **Content** section in the admin panel. The Content module is structured so future
items — Hero Sliders, Homepage Sections, Membership Promotions, Footer Content — slot in
under the same menu without rework.

**This round implements ONLY the Promotional Header** (data model, admin UI, admin + public
APIs, storefront rendering). The other content types are accounted for in structure only.

## Context

- Monorepo: `apps/client` (storefront), `apps/admin` (admin SPA), `server` (Express + Mongo).
- Server pattern: each domain = `*.model.js` + `*.service.js` + `*.controller.js` + router,
  registered in `server/src/models/index.js`, mounted via `ROUTER_MOUNTS` in
  `server/src/shared/constants/routerMounts.js`, wired in `server/src/app.js`.
- Existing precedent for admin-write / public-read split: `settings` module
  (`/api/admin/settings`, authenticated) vs `config` router (`/api/config`, public-safe values).
- Storefront `CustomerLayout` currently has **no shared header** — it renders only `<Outlet>`.
- Constraints: **inline SVG only — never icon fonts.** Banner is site-wide branding and
  renders on every storefront page (the ad-funnel checkout constraints live on `main`, not `dev`).

## Architecture — chosen: Option A

A dedicated **`content` server module** with an **admin-write router** (`/api/admin/content`,
auth-guarded) and a **public-read router** (`/api/content`, unauthenticated, filtered output).
This mirrors the existing `settings`/`config` split and gives future content types a home.

Rejected: extending `SystemSettings`/`/api/config` (those are for integration credentials/IDs,
not content) and a generic key-value content table (under-typed, awkward UI/validation; YAGNI).

## Data Model — `PromoBanner` (singleton)

A single document (one row, like `SystemSettings`). Mongoose model
`server/src/modules/content/promoBanner.model.js`, registered in `models/index.js`.

Banner-level fields:

| Field | Type | Notes |
|---|---|---|
| `enabled` | boolean | Master on/off for the whole banner. Default `false`. |
| `bgColor` | string (hex) | Default background for slides that don't override. Default brand red. |
| `textColor` | string (hex) | Default text color. Default white. |
| `rotationIntervalMs` | number | Auto-rotate cadence. Default `5000`. Min clamp `2000`. |
| `rightText` | string \| null | Persistent right-side slot (e.g. "Customer Care: 011-…"). Optional. |
| `announcements` | array | Ordered rotating slides (below). |

Per-announcement (`announcements[]`, order = array order):

| Field | Type | Notes |
|---|---|---|
| `text` | string | Required. The announcement copy. |
| `url` | string \| null | Optional. Makes the slide clickable. |
| `couponCode` | string \| null | Optional. Rendered as a click-to-copy chip. |
| `bgColor` | string \| null | Optional per-slide background override. |
| `textColor` | string \| null | Optional per-slide text override. |
| `startAt` | Date \| null | Optional. Slide hidden before this time. |
| `endAt` | Date \| null | Optional. Slide hidden after this time. |
| `showOnMobile` | boolean | Default `true`. |
| `showOnDesktop` | boolean | Default `true`. |
| `enabled` | boolean | Default `true`. Per-slide on/off. |

`toJSON` transform maps `_id`→`id` and strips `__v`, consistent with existing models.

## Server

New module `server/src/modules/content/`:

- `promoBanner.model.js` — schema above.
- `content.service.js`:
  - `getPromoBanner()` — full doc for admin (creates the singleton on first read).
  - `updatePromoBanner(payload)` — validates + upserts the singleton.
  - `getPublicPromoBanner({ now })` — returns the banner only when `enabled`, with
    `announcements` filtered to those that are `enabled` AND within their `[startAt, endAt]`
    window at `now`. **Device filtering is NOT done server-side** (UA sniffing is unreliable);
    the `showOnMobile`/`showOnDesktop` flags are passed through and the storefront filters by
    viewport. Returns `null`/empty shape when nothing is eligible.
- `content.controller.js` — request/response glue, validation errors via shared error types.
- Routers:
  - `content.admin.router.js` → mounted `/api/admin/content`, auth-guarded:
    - `GET /promo-banner` — full doc.
    - `PUT /promo-banner` — replace/update.
  - `content.public.router.js` → mounted `/api/content`, public:
    - `GET /promo-banner` — filtered public shape.
- `ROUTER_MOUNTS` additions: `contentAdmin: "/api/admin/content"`, `content: "/api/content"`.
  Wire both routers in `server/src/app.js`.

**Extensibility:** the module is named `content` (not `promoBanner`) so future types add their
own model + service functions + sub-paths (e.g. `GET /hero-slides`) under the same two mounts
and the same admin Content page.

## Admin UI (`apps/admin`)

- Add a **"Content"** item to `NAV_ITEMS` in `AdminLayout.jsx` with an inline **SVG** icon.
- Route `admin/content` → `ContentPage` (under the auth guard in `App.jsx`).
- `ContentPage` is structured as the container for content types. For now it renders the
  **Promotional Header** section via a `PromoBannerEditor` component. Future types become
  additional sections/tabs here.
- `PromoBannerEditor` controls:
  - Master `enabled` toggle, `rotationIntervalMs` (shown in seconds), default `bgColor`/`textColor`, `rightText`.
  - Announcements editor: add / remove / reorder (up-down), each row with `text`, `url`,
    `couponCode`, `bgColor`, `textColor`, `startAt`, `endAt`, `showOnMobile`, `showOnDesktop`,
    per-slide `enabled`.
  - Save → `PUT /api/admin/content/promo-banner` (reuses the admin API client + auth used by
    existing admin pages).

## Storefront (`apps/client`)

- New `PromoBanner.jsx`, rendered at the **top of `CustomerLayout`** above `<Outlet>` so it
  appears on every storefront page.
- Fetches `GET /api/content/promo-banner`. Renders nothing when disabled or no eligible slides.
- Filters slides by **viewport** using `matchMedia` (`showOnMobile`/`showOnDesktop`); date and
  enabled filtering already applied server-side.
- Auto-rotates on `rotationIntervalMs`; **prev/next SVG arrows** for manual control; pauses on
  hover/focus; respects `prefers-reduced-motion` (no auto-rotate when reduced).
- Coupon chip: click-to-copy via `navigator.clipboard` with a transient "Copied!" state and an
  inline **SVG** copy icon.
- Applies per-slide color overrides, falls back to banner defaults; renders `rightText` slot.
- All icons inline **SVG**; no icon fonts.

## Error Handling

- Admin update: validate hex colors, non-empty announcement text, sane interval (clamp to min),
  and `startAt <= endAt` when both present; return shared validation errors.
- Public read: any resolution failure (e.g. DB down) degrades to "no banner" rather than
  failing the storefront — same philosophy as the existing `/api/config` pixel resolution.
- Storefront fetch failure: render nothing, never block the page.

## Testing (vitest, existing patterns)

- Service: date-window + enabled filtering, singleton create-on-read, validation/clamping.
- Routers: admin auth guard on `/api/admin/content`, public endpoint shape and filtering, no
  admin-only fields leak from the public endpoint.
- Admin component: `PromoBannerEditor` add/remove/reorder + save payload.
- Storefront component: rotation, viewport filtering, coupon copy, disabled/empty renders nothing,
  reduced-motion behavior.

## Out of Scope (this round)

- Hero Sliders, Homepage Sections, Membership Promotions, Footer Content (structure only).
- The full storefront header/nav from the reference (logo, search, account, cart, mega-menu).
- Server-side device detection.
