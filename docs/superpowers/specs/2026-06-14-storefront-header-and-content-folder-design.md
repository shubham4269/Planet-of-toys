# Storefront Header + Admin Content Folder + Editor Polish (Design)

**Date:** 2026-06-14
**Branch:** dev
**Status:** Approved design, pre-implementation

## Goal

Three related pieces of storefront/admin work, building on the just-shipped dynamic
promotional header:

- **A. Storefront header** — a static, branded site header (logo, search, account, loyalty,
  cart, wishlist, category nav) rendered site-wide beneath the dynamic promo banner. Visual
  shell only; all icons inline SVG.
- **B. Admin Content folder** — turn the admin "Content" sidebar entry into an expandable
  parent group with sub-items, starting with "Promotional Banner", structured so future
  content types (Hero Slider, etc.) slot in.
- **C. Promotional Header editor polish** — restyle `PromoBannerEditor` to match the admin
  theme, replace the `↑ ↓ ✕` glyph buttons with inline SVG icons, and guide the right-text
  field toward the "Customer Care: …" pattern.

## Context

- Monorepo: `apps/client` (storefront), `apps/admin` (admin SPA), `server`.
- Storefront layout `apps/client/src/components/CustomerLayout.jsx` currently renders
  `<PromoBanner />` then `<Outlet />` inside `.customer-shell`. Routes live in
  `apps/client/src/App.jsx` (catalogue routes are scaffolded placeholders today).
- Logo asset exists at `apps/client/src/assets/logo.webp`.
- Admin sidebar nav is a flat `NAV_ITEMS` array in
  `apps/admin/src/components/AdminLayout.jsx`; admin routes in `apps/admin/src/App.jsx`.
  The Content section is currently a single route `/admin/content` → `ContentPage` →
  `PromoBannerEditor`.
- Project rule: **inline SVG only — never icon fonts.**

## Decisions (from brainstorming)

- Header is a **visual shell** (no real auth/cart/search logic yet) and a **static**
  component (only the promo banner stays admin-managed).
- Admin Content uses an **expandable sidebar group** with per-sub-item routes.
- Adding placeholder pages for `/account`, `/loyalty`, `/wishlist`, `/products` is approved.
- Default nav categories: **New Arrivals, Shop by Age, Brands, Sale**.

---

## A. Storefront Header

**Files**
- Create `apps/client/src/components/Header.jsx` + `Header.css`.
- Modify `apps/client/src/components/CustomerLayout.jsx` to render `<Header />` between
  `<PromoBanner />` and `<Outlet />`.
- Modify `apps/client/src/App.jsx` to add placeholder routes.

**Structure** (all icons inline SVG):
- **Row 1 (main bar):**
  - Logo (left), `<Link to="/">`, using `assets/logo.webp` with descriptive alt text.
  - Search (center): a `<form>` with a text input and an SVG-magnifier submit button.
    Submitting navigates to `/products?q=<query>` (`useNavigate`). Empty query → `/products`.
  - Actions (right): four icon+label items, each a `<Link>`:
    - Account / "Sign in" → `/account` (user SVG)
    - Loyalty → `/loyalty` (star/gift SVG)
    - Wishlist → `/wishlist` (heart SVG)
    - Cart → `/cart` (bag SVG) with a small count badge (static `0` placeholder for now,
      rendered as a styled span so wiring a real count later is a one-line change).
- **Row 2 (category nav):** horizontal links — New Arrivals, Shop by Age, Brands, Sale —
  each routing to `/products` (placeholders) for now.
- **Behavior:** header is sticky on scroll. On mobile (≤768px) the category nav collapses
  behind a hamburger toggle (local `useState`); the search box and action labels condense
  (labels hidden, icons remain). No external UI libraries; plain React + CSS.

**Placeholder pages:** reuse the existing inline `Placeholder` pattern already in
`apps/client/src/App.jsx`. Add routes `/account`, `/loyalty`, `/wishlist`, and `/products`
(if `/products` is not already routed) rendering `<Placeholder title="…" />`. `/cart`
already exists.

**Component boundaries:** `Header.jsx` owns layout + mobile toggle + search submit. Inline
SVG icon components are small local function components within the file (consistent with how
`AdminLayout.jsx` defines its `Icon*` components). It does not fetch data.

---

## B. Admin Content Folder (expandable sidebar group)

**Files**
- Modify `apps/admin/src/components/AdminLayout.jsx` — support nested nav.
- Modify `apps/admin/src/App.jsx` — nested content routes.
- Modify/replace `apps/admin/src/pages/admin/ContentPage.jsx` — becomes a thin layout.
- Add `apps/admin/src/pages/admin/content/PromoBannerPage.jsx` (wraps `PromoBannerEditor`),
  or route the sub-path directly to the editor (see Routing).

**Sidebar nav:** extend `NAV_ITEMS` so an item may declare `children`. Render a parent item
("Content") as a button that toggles a collapsible list of child `NavLink`s. The parent shows
expanded when the current route is under `/admin/content`. Child: "Promotional Banner" →
`/admin/content/promo-banner`. Active-state styling reuses the existing `admin-nav__link`
classes; the expand/collapse chevron is inline SVG. Existing flat items (Dashboard, Products,
Orders, Settings) keep working unchanged.

**Routing** (`apps/admin/src/App.jsx`, inside the `RequireAdminAuth` guarded block):
- `content` → `ContentPage` (layout with `<Outlet />`), with:
  - index route → `<Navigate to="promo-banner" replace />`
  - `promo-banner` → the Promotional Banner page (renders `PromoBannerEditor`).

`ContentPage` becomes a minimal `<section className="content-page"><Outlet /></section>`
container so future sub-sections render through it.

---

## C. Promotional Header Editor Polish

**Files**
- Modify `apps/admin/src/pages/admin/PromoBannerEditor.jsx` (markup/classes + SVG icons).
- Modify `apps/admin/src/pages/admin/ContentPage.css` (or a dedicated
  `PromoBannerEditor.css`) for the restyle.

**Changes (no behavior change to load/save/validation/reorder logic):**
- Card-based sections with clear headings and spacing, using admin theme tokens
  (`apps/admin/src/styles/tokens.css`) so it matches Dashboard/Settings.
- Banner settings laid out in a clean two-column grid (enable toggle, default colors,
  rotation interval, right text).
- Each announcement becomes a card with a header row containing an **SVG drag handle**,
  move-up / move-down (**SVG** chevrons), and remove (**SVG** ✕) — replacing the current
  `↑ ↓ ✕` text glyphs. Fields below in a two-column grid. Drag-and-drop + up/down reorder
  behavior is preserved exactly (and the existing aria-labels remain so tests keep passing).
- Live preview framed to look like the real storefront bar (centered, constrained width).
- Right-text field: update placeholder/help to `Customer Care: 011-41410060` so admins enter
  the full label; the banner renders the text verbatim (no code change to rendering).

**Test stability:** the existing `PromoBannerEditor.test.jsx` asserts on roles + aria-labels
(`/add announcement/i`, `/move up/i`, `/save/i`, label text). Keep those accessible names
intact (SVG buttons keep their `aria-label`s) so the suite stays green.

---

## Out of Scope

- Real authentication, cart state, wishlist persistence, working product search/catalogue.
- Making the header admin-managed/dynamic (deferred; only the promo banner is dynamic).
- Building the other content types (Hero Slider, etc.) — structure only.

## Testing

- **Storefront:** `Header.test.jsx` — renders logo/search/action links, search submit
  navigates to `/products?q=…`, mobile hamburger toggles nav. Full client suite stays green.
- **Admin:** extend/keep `PromoBannerEditor.test.jsx` (unchanged behavior). Add a small test
  that the Content nav group expands and the `/admin/content` route redirects to
  `/admin/content/promo-banner`. Full admin suite stays green.
- All icons asserted/where practical confirmed to be inline SVG (no icon-font classes).
