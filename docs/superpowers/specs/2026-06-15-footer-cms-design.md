# Footer CMS + Newsletter + Marketing — Design (Planet of Toys)

**Date:** 2026-06-15
**Branch:** dev
**Status:** Design for review (pre-plan). Do not implement until approved.

Spans three cohesive subsystems: **(A) Footer Content CMS**, **(B) Newsletter subscription
system**, **(C) Marketing admin (subscribers)**. One design doc; the plan sequences them.

---

## 1. Final Design Review (scope + decisions)

- Footer is the next **content type** in the existing `content` module, admin-write /
  public-read, singleton — same pattern as Promotional Banner. Reuses `content.service`,
  `content.controller`, the admin/public routers, validation, and the `decodeEntities` helper
  (mandatory so links survive the global `/`→`&#x2F;` escaping).
- **Newsletter is a real system** (not a shell): a dedicated `newsletter` module with a
  `NewsletterSubscriber` model and a public subscribe endpoint; footer form posts to it.
- **Marketing** is a new admin area (sidebar group) to view/search/export/unsubscribe — no
  campaigns, no Mailchimp, no email sending.
- **Membership promo** in the footer is promotion-only (title/description/button). Plans,
  pricing, and benefits belong to a future Membership module and are **out of scope**.
- **Colors are token-driven, not CMS-editable** (see §color strategy).
- Content unique to Planet of Toys; reference used for layout/proportion only.

### Color strategy (tokens only)
- **Left section:** light neutral / subtle blue tint surface; **headings blue**
  (`--color-secondary`); **links** dark blue-gray (`--color-text-primary`/secondary).
- **Right community panel:** **brand blue** (`--color-secondary`) background; **white** text
  and input; **Subscribe button = primary red** (`--color-primary`); **yellow**
  (`--color-accent`) only as small accents (trust/membership badges, tiny highlights) — never
  large yellow fills.

---

## 2. Data Model

### A. `FooterContent` (singleton, content module)
`server/src/modules/content/footerContent.model.js`, registered in `models/index.js`. Fixed
`singleton:"footer"` + unique index; `toJSON` maps `_id`→`id` (doc + subdocs), strips
`__v`/`singleton`.

```
FooterContent {
  enabled: Boolean (default true)
  columns: [ { _id, title, enabled(default true),
               links: [ { _id, label, url, enabled(default true) } ] } ]
  newsletter:     { enabled(default true), title, subtitle, placeholder(default "Enter your email"),
                    buttonLabel(default "Subscribe") }
  membershipPromo:{ enabled(default true), title, description, buttonLabel, buttonUrl }
  social: [ { _id, platform: enum[facebook,instagram,youtube,whatsapp,twitter], url } ]
  contact: { companyName, address, phone, email, whatsapp, supportHours }   // all String, optional
  trustHighlights: [ { _id, iconKey: enum[shield,truck,lock,gift,star,heart], title, subtitle } ]
  bottomLinks: [ { _id, label, url, enabled(default true) } ]
  copyrightText: String
}
```
All strings pass through the service's validation + `decodeEntities`.

### B. `NewsletterSubscriber` (new `newsletter` module)
`server/src/modules/newsletter/subscriber.model.js`, registered in `models/index.js`.

```
NewsletterSubscriber {
  email: String (required, unique, lowercased, trimmed)
  status: enum[subscribed, unsubscribed] (default subscribed)
  source: String (default "footer")
  subscribedAt: Date (default now)
  unsubscribedAt: Date | null (default null)
  ipAddress: String | null (default null)   // optional, captured at subscribe time
  userAgent: String | null (default null)   // optional, captured at subscribe time
  timestamps: true
}
```
Unique index on `email` for dedup. `toJSON` → `id`, strip `__v`. The public subscribe handler
captures `ipAddress` (from `req.ip`) and `userAgent` (from the request header) when present;
both are optional and are **not** exposed in any public response. They are admin-only fields
(included in the admin subscriber list/CSV if useful, omitted from public output).

---

## 3. API Contract

### Footer (content module)
- Admin (auth): `GET /api/admin/content/footer` → `{ footer }`; `PUT /api/admin/content/footer` → `{ footer }`.
- Public: `GET /api/content/footer` → `{ footer }` — filtered: `{enabled:false}` when off; drops
  disabled/empty columns + disabled links + disabled bottomLinks; newsletter/membershipPromo
  included only when their `enabled`; social only entries with a url; **no admin-only flags**.

### Newsletter (new module)
- Public: `POST /api/newsletter/subscribe` `{ email, source? }` →
  - validates email (format), normalizes (lowercase/trim);
  - **dedup:** if a `subscribed` record exists → idempotent `200 {ok:true, already:true}`; if an
    `unsubscribed` record exists → re-subscribe; else create. Never throws on duplicate.
  - returns `200 {ok:true}` on success; `400` on invalid email. Rate-limited (reuse the global
    limiter; add a tighter per-route limiter like the OTP one).
- Admin (auth), mount `/api/admin/newsletter`:
  - `GET /subscribers?search=&status=&page=&limit=` → `{ subscribers, total, page, limit }`
    (search matches email substring; paginated, newest first).
  - `GET /subscribers/export` → `text/csv` attachment (all matching rows: email,status,source,subscribedAt).
  - `PATCH /subscribers/:id/unsubscribe` → sets `status:"unsubscribed"`, `unsubscribedAt:now` → `{ subscriber }`.

`ROUTER_MOUNTS` additions: `newsletter:"/api/newsletter"`, `newsletterAdmin:"/api/admin/newsletter"`.
Wire all routers in `server/src/index.js` (admin routers behind `requireAuth`).

---

## 4. Admin UI Structure

- **Content → Footer Content** (new child under the existing Content group; Promotional Banner +
  Hero Banner placeholder remain). Route `/admin/content/footer` → `FooterPage` → `FooterEditor`.
  - `FooterEditor`: card-based (matches the light admin theme), **live preview** (shared
    `FooterView`) + Save. Cards: Enable · Navigation columns (add/remove/reorder columns &
    links, drag + up/down) · Newsletter copy · Membership promo · Social links · Contact ·
    Trust highlights (add/remove/reorder, iconKey dropdown) · Bottom bar (links + copyright).
    Reuses the SVG drag/up/down/remove control pattern from `PromoBannerEditor`.
- **Marketing → Newsletter Subscribers** (new top-level sidebar group "Marketing", expandable
  like Content). Route `/admin/marketing/subscribers` → `SubscribersPage`:
  - Table: email · status · source · subscribed date.
  - **Search** box (debounced → `?search=`), **pagination**, **Export CSV** button (calls the
    export endpoint with the bearer token, triggers a file download), per-row **Unsubscribe**.

---

## 5. Storefront Component Structure

- Shared `packages/shared-web/src/footer/FooterView.jsx` — pure presentational; renders the
  columns grid, the blue community panel (newsletter + membership promo + social), contact
  block, trust highlights, bottom bar. Inline-SVG icon sets (social per `platform`, trust per
  `iconKey`) live here so storefront + admin preview match. The newsletter `<form>` calls an
  optional `onSubscribe(email)` prop and renders `status`/`message` props; **no fetching inside**.
- `apps/client/src/components/Footer.jsx` — wrapper: fetches `/api/content/footer`; owns the
  newsletter submit (POST `/api/newsletter/subscribe` via `apiClient`, manages
  idle/loading/success/error), passes handler+state into `FooterView`; renders nothing when the
  footer is disabled/empty or on fetch failure. `Footer.css` = responsive layout (desktop
  multi-column + right panel; tablet grid; mobile single-column stack, full-width panel,
  touch spacing).
- Mounted in `CustomerLayout` **after `<Outlet/>`** → site-wide.
- Admin live preview reuses `FooterView` with **no** `onSubscribe` (form inert in preview).

---

## 6. Marketing Module Structure

- Server: `server/src/modules/newsletter/` = `subscriber.model.js`, `newsletter.service.js`
  (`subscribe`, `listSubscribers`, `exportCsv`, `unsubscribe`), `newsletter.controller.js`,
  `newsletter.public.router.js`, `newsletter.admin.router.js`.
- Admin client: `apps/admin/src/pages/admin/marketing/SubscribersPage.jsx` + a `marketing`
  nav group in `AdminLayout`. Reuses `apiClient` + `adminAuth` (401 → `notifyUnauthorized`).
- CSV export is **server-generated** (so it covers all rows, not just the current page).

---

## 7. Testing Plan (Vitest, existing patterns)

- **Models:** FooterContent defaults/singleton/toJSON; NewsletterSubscriber defaults + unique email.
- **Footer service:** validation, `decodeEntities` on link/text urls, public projection
  (disabled shape, dropped disabled/empty items, social-without-url omitted, no admin flags).
- **Newsletter service:** email validation, normalization, dedup (idempotent on existing
  subscribed, re-subscribe on previously unsubscribed), list search+pagination, unsubscribe,
  CSV content.
- **Routers:** admin auth guards (`/api/admin/content/footer`, `/api/admin/newsletter/*`);
  public `POST /api/newsletter/subscribe` (200/400, dedup) and `GET /api/content/footer`
  projection/no-leak; CSV content-type + headers.
- **Shared `FooterView`:** renders columns/links; conditionally renders newsletter/membership/
  social/contact/trust/bottom; hides social without url; calls `onSubscribe`; shows status.
- **Storefront `Footer`:** fetch→render; nothing when disabled/failed; subscribe success +
  error path.
- **Admin `FooterEditor`:** load, add/remove/reorder column+link, edit newsletter, save shape.
- **Admin `SubscribersPage`:** loads list, search query, unsubscribe action, export trigger.
- Full client/admin/server suites stay green; client+admin builds succeed.

---

## 8. TDD Execution Plan (task sequencing for the plan)

1. **FooterContent model** → 2. **Footer service** (validate + decode + public projection) →
3. **Footer controller** → 4. **Footer routers** (admin+public) → 5. **Wire footer mounts**.
6. **NewsletterSubscriber model** → 7. **Newsletter service** (subscribe/dedup/list/export/
unsubscribe) → 8. **Newsletter controllers + routers** (public subscribe, admin list/export/
unsubscribe) → 9. **Wire newsletter mounts + rate limiter**.
10. **Shared `FooterView`** → 11. **Storefront `Footer` wrapper + CSS + newsletter submit + mount**.
12. **Admin `FooterEditor` + Footer Content sub-route/nav** →
13. **Admin Marketing group + `SubscribersPage` (search/pagination/export/unsubscribe) + route**.
14. **Full-suite verification + builds.**

Each task = failing test → run (fail) → implement → run (pass) → commit, executed via
subagent-driven development with spec + quality review between tasks (same workflow as the
Promotional Header CMS).

---

## Resolved decisions (from the master prompt)
- Newsletter = real subscription system (model + API + Marketing admin). ✓
- Trust/social icons = predefined inline-SVG sets, no uploads. ✓
- Footer colors = token-driven, not CMS-editable (left light / right blue / red button / yellow accents). ✓
- Membership = promo-only in the footer; plans/benefits are a separate future module. ✓
- Hero Banner placeholder stays.
