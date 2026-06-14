# Storefront Header + Content Folder + Editor Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static branded storefront header (logo, SVG search, account/loyalty/wishlist/cart actions, config-driven category nav, mobile hamburger) rendered site-wide; turn the admin "Content" sidebar entry into an expandable folder with a Promotional Banner sub-route; and restyle the Promotional Header editor (themed cards, SVG reorder icons, Desktop/Mobile preview toggle).

**Architecture:** Pure front-end. Storefront gets a new `Header` component mounted in `CustomerLayout` between the dynamic `PromoBanner` and `<Outlet>`, plus placeholder routes. Admin gets nested sidebar nav + nested content routes (`ContentPage` becomes an `<Outlet>` layout) and a redesigned `PromoBannerEditor` (markup/CSS/SVG only — load/save/validation/reorder logic unchanged). No backend changes.

**Tech Stack:** React 18 + Vite + react-router-dom, Vitest + Testing Library, existing `@planet-of-toys/shared-web` (`PromoBannerView`, `apiClient`).

---

## File Structure

**Storefront (`apps/client/src/`)**
- Create `components/Header.jsx` — header layout, config-driven category nav, search submit, mobile toggle, inline SVG icons.
- Create `components/Header.css` — header styles (responsive, sticky).
- Create `components/Header.test.jsx` — render/search/nav/toggle tests.
- Modify `components/CustomerLayout.jsx` — render `<Header />` below `<PromoBanner />`.
- Modify `App.jsx` — add `/account`, `/loyalty`, `/wishlist` placeholder routes.

**Admin (`apps/admin/src/`)**
- Modify `components/AdminLayout.jsx` — `NAV_ITEMS` supports `children`; render expandable group.
- Modify `App.jsx` — nested `content` routes (index redirect → `promo-banner`).
- Modify `pages/admin/ContentPage.jsx` — thin `<Outlet>` layout.
- Create `pages/admin/content/PromoBannerPage.jsx` — wraps `PromoBannerEditor`.
- Create `pages/admin/content/ContentRouting.test.jsx` — redirect + nested nav link tests.
- Modify `pages/admin/PromoBannerEditor.jsx` — redesigned markup, SVG icons, preview device toggle (logic preserved).
- Modify `pages/admin/ContentPage.css` — restyle.
- Modify `pages/admin/PromoBannerEditor.test.jsx` — add a device-toggle test (keep existing tests).

---

## Task 1: Storefront header

**Files:**
- Create: `apps/client/src/components/Header.jsx`
- Create: `apps/client/src/components/Header.css`
- Create: `apps/client/src/components/Header.test.jsx`
- Modify: `apps/client/src/components/CustomerLayout.jsx`
- Modify: `apps/client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/client/src/components/Header.test.jsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Header from "./Header.jsx";

/** Echoes the current location so we can assert navigation. */
function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Header />
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe("Header", () => {
  it("renders the logo, search box, and action links", () => {
    renderHeader();
    expect(screen.getByAltText(/planet of toys/i)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search the store/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /loyalty/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /wishlist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^cart$/i })).toBeInTheDocument();
  });

  it("renders the category nav from the config array", () => {
    renderHeader();
    for (const label of ["New Arrivals", "Shop by Age", "Brands", "Sale"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("submits search to /products with the query", () => {
    renderHeader();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lego" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/products?q=lego");
  });

  it("navigates to /products for an empty search", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/products");
  });

  it("toggles the mobile category menu", () => {
    renderHeader();
    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@planet-of-toys/client -- Header`
Expected: FAIL — cannot find module `./Header.jsx`.

- [ ] **Step 3: Write the Header component**

```jsx
// apps/client/src/components/Header.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.webp";
import "./Header.css";

/**
 * Storefront site header (static branded shell). Renders the logo, a search box,
 * the account/loyalty/wishlist/cart actions, and a config-driven category nav.
 * Visual only — no real auth/cart/search logic yet; links route to existing or
 * placeholder routes and search submits to /products. All icons are inline SVG.
 */

/** Category nav links — edit here to change the menu (config, not hardcoded JSX). */
const CATEGORIES = [
  { label: "New Arrivals", to: "/products" },
  { label: "Shop by Age", to: "/products" },
  { label: "Brands", to: "/products" },
  { label: "Sale", to: "/products" },
];

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconLoyalty() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M12 20s-7-4.3-9.3-8.3C1 8.5 2.6 5 6 5c2 0 3.2 1.1 4 2.3C10.8 6.1 12 5 14 5c3.4 0 5 3.5 3.3 6.7C19 15.7 12 20 12 20z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M6 8h12l-1 12H7L6 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  }

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <button
          type="button"
          className="site-header__menu-toggle"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="site-header-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <IconMenu />
        </button>

        <Link to="/" className="site-header__logo" aria-label="Planet of Toys home">
          <img src={logo} alt="Planet of Toys" />
        </Link>

        <form className="site-header__search" role="search" onSubmit={handleSearch}>
          <input
            type="search"
            className="site-header__search-input"
            aria-label="Search the store"
            placeholder="Search the store"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="site-header__search-btn" aria-label="Search">
            <IconSearch />
          </button>
        </form>

        <nav className="site-header__actions" aria-label="Account and cart">
          <Link to="/account" className="site-header__action">
            <IconUser />
            <span>Sign in</span>
          </Link>
          <Link to="/loyalty" className="site-header__action">
            <IconLoyalty />
            <span>Loyalty</span>
          </Link>
          <Link to="/wishlist" className="site-header__action">
            <IconHeart />
            <span>Wishlist</span>
          </Link>
          <Link to="/cart" className="site-header__action site-header__action--cart">
            <span className="site-header__cart-icon">
              <IconBag />
              <span className="site-header__badge" aria-hidden="true">0</span>
            </span>
            <span>Cart</span>
          </Link>
        </nav>
      </div>

      <nav
        id="site-header-nav"
        className={`site-header__nav${menuOpen ? " site-header__nav--open" : ""}`}
        aria-label="Categories"
      >
        {CATEGORIES.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="site-header__nav-link"
            onClick={() => setMenuOpen(false)}
          >
            {c.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Write the header stylesheet**

```css
/* apps/client/src/components/Header.css */
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #ffffff;
  border-bottom: 1px solid #eee;
  font-family: inherit;
}
.site-header__bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.75rem 1.25rem;
}
.site-header__menu-toggle {
  display: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: #c8102e;
  padding: 0.25rem;
}
.site-header__logo img {
  display: block;
  height: 44px;
  width: auto;
}
.site-header__search {
  flex: 1;
  display: flex;
  align-items: center;
  background: #f3efe9;
  border-radius: 999px;
  padding: 0.25rem 0.5rem 0.25rem 1rem;
  max-width: 640px;
}
.site-header__search-input {
  flex: 1;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 0.95rem;
  outline: none;
  color: #222;
}
.site-header__search-btn {
  background: transparent;
  border: 0;
  cursor: pointer;
  color: #555;
  display: inline-flex;
  padding: 0.35rem;
}
.site-header__actions {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.site-header__action {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  text-decoration: none;
  color: #c8102e;
  font-size: 0.72rem;
  font-weight: 600;
}
.site-header__cart-icon {
  position: relative;
  display: inline-flex;
}
.site-header__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #c8102e;
  color: #fff;
  font-size: 0.65rem;
  line-height: 16px;
  text-align: center;
}
.site-header__nav {
  display: flex;
  justify-content: center;
  gap: 1.75rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.6rem 1.25rem;
  flex-wrap: wrap;
}
.site-header__nav-link {
  text-decoration: none;
  color: #222;
  font-weight: 600;
  font-size: 0.95rem;
}
.site-header__nav-link:hover { color: #c8102e; }

@media (max-width: 768px) {
  .site-header__menu-toggle { display: inline-flex; }
  .site-header__action span:last-child { display: none; }
  .site-header__actions { gap: 0.85rem; }
  .site-header__nav {
    display: none;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .site-header__nav--open { display: flex; }
}
```

- [ ] **Step 5: Mount the header in the layout**

Replace the contents of `apps/client/src/components/CustomerLayout.jsx` with:

```jsx
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import PromoBanner from "./PromoBanner.jsx";
import Header from "./Header.jsx";

/**
 * Layout wrapper for the customer-facing storefront routes. Activates the light
 * customer theme, renders the site-wide promotional header (dynamic banner +
 * static site header), then the matched child route via <Outlet>.
 *
 * Requirements: 20.2.
 */
export default function CustomerLayout() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
  }, []);

  return (
    <div className="customer-shell">
      <PromoBanner />
      <Header />
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 6: Add placeholder routes**

In `apps/client/src/App.jsx`, inside the `<Route element={<CustomerLayout />}>` group, add these three routes right after the existing `cart` route (`<Route path="cart" … />`). `/products` already exists, so do not add it again:

```jsx
        <Route path="account" element={<Placeholder title="Account" />} />
        <Route path="loyalty" element={<Placeholder title="Loyalty & Rewards" />} />
        <Route path="wishlist" element={<Placeholder title="Your wishlist" />} />
```

- [ ] **Step 7: Run the header test to verify it passes**

Run: `npm test --workspace=@planet-of-toys/client -- Header`
Expected: PASS (5 tests).

- [ ] **Step 8: Run the full client suite (no regressions)**

Run: `npm run test:client`
Expected: PASS. The header now renders inside `CustomerLayout`; if any existing test that mounts `CustomerLayout`/`AppRoutes` breaks, investigate and fix (most page tests render pages directly). Report findings.

- [ ] **Step 9: Commit**

```bash
git add apps/client/src/components/Header.jsx apps/client/src/components/Header.css apps/client/src/components/Header.test.jsx apps/client/src/components/CustomerLayout.jsx apps/client/src/App.jsx
git commit -m "feat(client): add static storefront header with search, actions, and category nav"
```

End the commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: Admin Content folder (nested nav + routes)

**Files:**
- Modify: `apps/admin/src/components/AdminLayout.jsx`
- Modify: `apps/admin/src/App.jsx`
- Modify: `apps/admin/src/pages/admin/ContentPage.jsx`
- Create: `apps/admin/src/pages/admin/content/PromoBannerPage.jsx`
- Create: `apps/admin/src/pages/admin/content/ContentRouting.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/admin/src/pages/admin/content/ContentRouting.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../../App.jsx";
import { ADMIN_TOKEN_KEY } from "../../../lib/adminAuth.js";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
}));

function makeJwt(claims) {
  const b64 = (o) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  apiMock.get.mockResolvedValue({
    banner: {
      id: "1", enabled: false, bgColor: "#E11B22", textColor: "#FFFFFF",
      rotationIntervalMs: 5000, rightText: null, announcements: [],
    },
  });
  localStorage.setItem(
    ADMIN_TOKEN_KEY,
    makeJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })
  );
  globalThis.matchMedia ??= vi.fn().mockReturnValue({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("admin content routing + nav", () => {
  it("redirects /admin/content to the promo-banner sub-route", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/content"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("heading", { name: /promotional header/i })
    ).toBeInTheDocument();
  });

  it("shows the Content group with a Promotional Banner sub-link", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/content/promo-banner"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("link", { name: /promotional banner/i })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@planet-of-toys/admin -- ContentRouting`
Expected: FAIL — the `/admin/content/promo-banner` route and the "Promotional Banner" nav link don't exist yet.

- [ ] **Step 3: Create the Promotional Banner page**

```jsx
// apps/admin/src/pages/admin/content/PromoBannerPage.jsx
import PromoBannerEditor from "../PromoBannerEditor.jsx";

/**
 * Content > Promotional Banner sub-page. Thin wrapper so the Content section can
 * host additional sub-pages (Hero Slider, etc.) alongside this one.
 */
export default function PromoBannerPage() {
  return <PromoBannerEditor />;
}
```

- [ ] **Step 4: Make ContentPage a thin layout**

Replace the contents of `apps/admin/src/pages/admin/ContentPage.jsx` with:

```jsx
// apps/admin/src/pages/admin/ContentPage.jsx
import { Outlet } from "react-router-dom";
import "./ContentPage.css";

/**
 * Admin Content section layout. Hosts the active content sub-page via <Outlet>
 * (Promotional Banner now; Hero Slider, etc. later).
 */
export default function ContentPage() {
  return (
    <section className="content-page">
      <Outlet />
    </section>
  );
}
```

- [ ] **Step 5: Nest the content routes**

In `apps/admin/src/App.jsx`:

Add an import next to the other page imports:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
```
(`Navigate` is already imported — confirm it's in the import list; if not, add it.)

Add the page import:

```jsx
import PromoBannerPage from "./pages/admin/content/PromoBannerPage.jsx";
```

Replace the existing single content route:

```jsx
          {/* Content management — promotional header (Content section). */}
          <Route path="content" element={<ContentPage />} />
```

with the nested form:

```jsx
          {/* Content management — folder hosting storefront content sub-pages. */}
          <Route path="content" element={<ContentPage />}>
            <Route index element={<Navigate to="promo-banner" replace />} />
            <Route path="promo-banner" element={<PromoBannerPage />} />
          </Route>
```

- [ ] **Step 6: Make the sidebar "Content" item an expandable group**

In `apps/admin/src/components/AdminLayout.jsx`:

Add a chevron icon near the other `Icon*` components:

```jsx
function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" className="admin-nav__chevron" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

Change the Content entry in `NAV_ITEMS` from the flat item to a group with `children` (replace the line `{ to: "/admin/content", label: "Content", Icon: IconContent },`):

```jsx
  {
    label: "Content",
    Icon: IconContent,
    basePath: "/admin/content",
    children: [{ to: "/admin/content/promo-banner", label: "Promotional Banner" }],
  },
```

Add `useLocation` usage (already imported) to drive auto-expansion, and replace the nav rendering block:

```jsx
        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? " admin-nav__link--active" : ""}`
              }
            >
              <item.Icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
```

with a renderer that handles both flat items and groups:

```jsx
        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map((item) =>
            item.children ? (
              <NavGroup key={item.label} item={item} currentPath={location.pathname} />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `admin-nav__link${isActive ? " admin-nav__link--active" : ""}`
                }
              >
                <item.Icon />
                <span>{item.label}</span>
              </NavLink>
            )
          )}
        </nav>
```

Add the `NavGroup` component above `export default function AdminLayout()`:

```jsx
/** Expandable sidebar group: a parent label that toggles a list of child links. */
function NavGroup({ item, currentPath }) {
  const underGroup = currentPath.startsWith(item.basePath);
  const [open, setOpen] = useState(underGroup);

  // Keep the group open whenever the active route is inside it.
  useEffect(() => {
    if (underGroup) setOpen(true);
  }, [underGroup]);

  return (
    <div className="admin-nav__group">
      <button
        type="button"
        className={`admin-nav__link admin-nav__group-toggle${underGroup ? " admin-nav__link--active" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <item.Icon />
        <span>{item.label}</span>
        <span className={`admin-nav__chevron-wrap${open ? " admin-nav__chevron-wrap--open" : ""}`}>
          <IconChevron />
        </span>
      </button>
      {open && (
        <div className="admin-nav__children">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                `admin-nav__link admin-nav__sublink${isActive ? " admin-nav__link--active" : ""}`
              }
            >
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: `useState` and `useEffect` are already imported at the top of `AdminLayout.jsx`; `useLocation` is already imported and `location` is already available in `AdminLayout` (used elsewhere). `NavGroup` uses its own `useState`/`useEffect` and receives `currentPath` as a prop, so it needs no extra imports.

- [ ] **Step 7: Add nested-nav styles**

Append to `apps/admin/src/components/AdminLayout.css`:

```css
/* Expandable nav group (Content folder). */
.admin-nav__group { display: flex; flex-direction: column; }
.admin-nav__group-toggle {
  width: 100%;
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.admin-nav__chevron-wrap {
  margin-left: auto;
  display: inline-flex;
  transition: transform 0.15s ease;
}
.admin-nav__chevron-wrap--open { transform: rotate(90deg); }
.admin-nav__children {
  display: flex;
  flex-direction: column;
  margin-left: 2.25rem;
}
.admin-nav__sublink { font-size: 0.9rem; }
```

- [ ] **Step 8: Run the routing test to verify it passes**

Run: `npm test --workspace=@planet-of-toys/admin -- ContentRouting`
Expected: PASS (2 tests).

- [ ] **Step 9: Run the full admin suite (no regressions)**

Run: `npm run test:admin`
Expected: PASS. The `App.test.jsx` routing tests and existing `PromoBannerEditor.test.jsx` must remain green. Investigate/fix any failure; report findings.

- [ ] **Step 10: Commit**

```bash
git add apps/admin/src/components/AdminLayout.jsx apps/admin/src/components/AdminLayout.css apps/admin/src/App.jsx apps/admin/src/pages/admin/ContentPage.jsx apps/admin/src/pages/admin/content/PromoBannerPage.jsx apps/admin/src/pages/admin/content/ContentRouting.test.jsx
git commit -m "feat(admin): make Content an expandable folder with promo-banner sub-route"
```

End the commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 3: Promotional Header editor redesign

**Files:**
- Modify: `apps/admin/src/pages/admin/PromoBannerEditor.jsx`
- Modify: `apps/admin/src/pages/admin/ContentPage.css`
- Modify: `apps/admin/src/pages/admin/PromoBannerEditor.test.jsx`

This task changes markup, CSS, icons, and adds a preview device toggle. The load/save/validation/reorder LOGIC is unchanged, and all existing accessible names (`/add announcement/i`, `/move up/i`, `/save/i`, `Announcement N text`) are preserved so the existing tests keep passing.

- [ ] **Step 1: Add the failing device-toggle test (keep existing tests)**

Add this `it(...)` block inside the existing `describe("PromoBannerEditor", …)` in `apps/admin/src/pages/admin/PromoBannerEditor.test.jsx` (do not remove the existing two tests):

```jsx
  it("filters the live preview by the selected device", async () => {
    apiMock.get.mockResolvedValue({
      banner: {
        ...EMPTY.banner,
        enabled: true,
        announcements: [
          { id: "d", text: "Desktop slide", showOnMobile: false, showOnDesktop: true, enabled: true },
          { id: "m", text: "Mobile slide", showOnMobile: true, showOnDesktop: false, enabled: true },
        ],
      },
    });
    render(<PromoBannerEditor />);

    // Desktop is the default preview device.
    expect(await screen.findByText("Desktop slide")).toBeInTheDocument();
    expect(screen.queryByText("Mobile slide")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /mobile preview/i }));
    expect(await screen.findByText("Mobile slide")).toBeInTheDocument();
    expect(screen.queryByText("Desktop slide")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@planet-of-toys/admin -- PromoBannerEditor`
Expected: the new test FAILS (no "Mobile preview" button / no device filtering yet); the existing two tests still pass.

- [ ] **Step 3: Rewrite the editor with the redesign**

Replace the entire contents of `apps/admin/src/pages/admin/PromoBannerEditor.jsx` with:

```jsx
// apps/admin/src/pages/admin/PromoBannerEditor.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { PromoBannerView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";

/**
 * Promotional header editor. Loads the banner, lets the admin toggle it, set
 * default colors / rotation interval / rightText, and manage the ordered list of
 * announcements (add / remove / reorder by drag-and-drop with up/down fallback).
 * A framed live preview renders the shared PromoBannerView from current form
 * state, with a Desktop/Mobile toggle. Saves the full banner via PUT.
 */

const API_PATH = "/api/admin/content/promo-banner";

/** Inline SVG icons (project rule: no icon fonts). */
function IconDrag() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" fill="currentColor" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}
function IconUp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconDown() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRemove() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A blank announcement row for the editor. */
function blankAnnouncement() {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    text: "",
    url: "",
    couponCode: "",
    bgColor: "",
    textColor: "",
    startAt: "",
    endAt: "",
    showOnMobile: true,
    showOnDesktop: true,
    enabled: true,
  };
}

/** Convert an ISO date (or null) to a value usable by <input type=datetime-local>. */
function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalize a loaded banner into editable form state. */
function toFormState(banner) {
  return {
    enabled: Boolean(banner?.enabled),
    bgColor: banner?.bgColor || "#E11B22",
    textColor: banner?.textColor || "#FFFFFF",
    rotationIntervalMs: banner?.rotationIntervalMs || 5000,
    rightText: banner?.rightText || "",
    announcements: (banner?.announcements ?? []).map((a) => ({
      id: a.id || `loaded-${Math.random().toString(36).slice(2)}`,
      text: a.text || "",
      url: a.url || "",
      couponCode: a.couponCode || "",
      bgColor: a.bgColor || "",
      textColor: a.textColor || "",
      startAt: toLocalInput(a.startAt),
      endAt: toLocalInput(a.endAt),
      showOnMobile: a.showOnMobile !== false,
      showOnDesktop: a.showOnDesktop !== false,
      enabled: a.enabled !== false,
    })),
  };
}

/** Build the API payload from form state (drop client-only ids/empties). */
function toPayload(form) {
  return {
    enabled: form.enabled,
    bgColor: form.bgColor,
    textColor: form.textColor,
    rotationIntervalMs: Number(form.rotationIntervalMs) || 5000,
    rightText: form.rightText.trim() || null,
    announcements: form.announcements.map((a) => ({
      text: a.text,
      url: a.url.trim() || null,
      couponCode: a.couponCode.trim() || null,
      bgColor: a.bgColor || null,
      textColor: a.textColor || null,
      startAt: a.startAt ? new Date(a.startAt).toISOString() : null,
      endAt: a.endAt ? new Date(a.endAt).toISOString() : null,
      showOnMobile: a.showOnMobile,
      showOnDesktop: a.showOnDesktop,
      enabled: a.enabled,
    })),
  };
}

export default function PromoBannerEditor() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [previewDevice, setPreviewDevice] = useState("desktop");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(API_PATH, { token: getToken() });
      setForm(toFormState(res?.banner));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError("Could not load the promotional header.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateAnnouncement(index, key, value) {
    setForm((f) => {
      const announcements = f.announcements.slice();
      announcements[index] = { ...announcements[index], [key]: value };
      return { ...f, announcements };
    });
  }

  function addAnnouncement() {
    setForm((f) => ({ ...f, announcements: [...f.announcements, blankAnnouncement()] }));
  }

  function removeAnnouncement(index) {
    setForm((f) => ({
      ...f,
      announcements: f.announcements.filter((_, i) => i !== index),
    }));
  }

  function move(from, to) {
    setForm((f) => {
      if (to < 0 || to >= f.announcements.length) return f;
      const announcements = f.announcements.slice();
      const [item] = announcements.splice(from, 1);
      announcements.splice(to, 0, item);
      return { ...f, announcements };
    });
  }

  function onDrop(index) {
    if (dragIndex === null || dragIndex === index) return;
    move(dragIndex, index);
    setDragIndex(null);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiClient.put(API_PATH, toPayload(form), { token: getToken() });
      setForm(toFormState(res?.banner));
      setMessage("Saved.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not save the promotional header.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="promo-editor__status">Loading…</p>;
  if (!form) return <p className="promo-editor__status">{error || "Unavailable."}</p>;

  // Preview mirrors the public endpoint's eligibility (enabled + schedule window)
  // and the storefront's device filter for the currently selected preview device.
  const previewNow = Date.now();
  const withinPreviewWindow = (a) => {
    if (a.startAt && previewNow < new Date(a.startAt).getTime()) return false;
    if (a.endAt && previewNow > new Date(a.endAt).getTime()) return false;
    return true;
  };
  const matchesDevice = (a) =>
    previewDevice === "mobile" ? a.showOnMobile : a.showOnDesktop;
  const previewAnnouncements = form.announcements
    .filter((a) => a.enabled && a.text.trim() && withinPreviewWindow(a) && matchesDevice(a))
    .map((a) => ({
      id: a.id,
      text: a.text,
      url: a.url || null,
      couponCode: a.couponCode || null,
      bgColor: a.bgColor || null,
      textColor: a.textColor || null,
    }));

  return (
    <form className="promo-editor" onSubmit={handleSave}>
      <header className="promo-editor__head">
        <h1>Promotional Header</h1>
        <div className="promo-editor__actions">
          <button type="submit" className="promo-editor__save" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <span className="promo-editor__ok">{message}</span>}
          {error && <span className="promo-editor__err">{error}</span>}
        </div>
      </header>

      <section className="promo-card">
        <div className="promo-card__head">
          <h2>Live preview</h2>
          <div className="promo-editor__device" role="group" aria-label="Preview device">
            <button
              type="button"
              className={`promo-editor__device-btn${previewDevice === "desktop" ? " promo-editor__device-btn--active" : ""}`}
              aria-pressed={previewDevice === "desktop"}
              aria-label="Desktop preview"
              onClick={() => setPreviewDevice("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              className={`promo-editor__device-btn${previewDevice === "mobile" ? " promo-editor__device-btn--active" : ""}`}
              aria-pressed={previewDevice === "mobile"}
              aria-label="Mobile preview"
              onClick={() => setPreviewDevice("mobile")}
            >
              Mobile
            </button>
          </div>
        </div>
        <div className={`promo-editor__preview promo-editor__preview--${previewDevice}`}>
          {form.enabled && previewAnnouncements.length > 0 ? (
            <PromoBannerView
              announcements={previewAnnouncements}
              bgColor={form.bgColor}
              textColor={form.textColor}
              rotationIntervalMs={Number(form.rotationIntervalMs) || 5000}
              rightText={form.rightText || null}
            />
          ) : (
            <p className="promo-editor__preview-empty">
              {form.enabled
                ? "No announcement is eligible for this device/time."
                : "Banner is disabled."}
            </p>
          )}
        </div>
      </section>

      <section className="promo-card">
        <div className="promo-card__head"><h2>Banner settings</h2></div>
        <div className="promo-editor__grid">
          <label className="promo-editor__check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => updateField("enabled", e.target.checked)}
            />
            Enable banner
          </label>
          <label className="promo-editor__field">
            <span>Default background</span>
            <input type="color" value={form.bgColor}
              onChange={(e) => updateField("bgColor", e.target.value)} />
          </label>
          <label className="promo-editor__field">
            <span>Default text color</span>
            <input type="color" value={form.textColor}
              onChange={(e) => updateField("textColor", e.target.value)} />
          </label>
          <label className="promo-editor__field">
            <span>Rotation interval (seconds)</span>
            <input type="number" min="2" step="1"
              value={Math.round(form.rotationIntervalMs / 1000)}
              onChange={(e) => updateField("rotationIntervalMs", Number(e.target.value) * 1000)} />
          </label>
          <label className="promo-editor__field promo-editor__field--wide">
            <span>Right text (e.g. customer care)</span>
            <input type="text" value={form.rightText}
              placeholder="Customer Care: 011-41410060"
              onChange={(e) => updateField("rightText", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="promo-card">
        <div className="promo-card__head">
          <h2>Announcements</h2>
          <button type="button" className="promo-editor__add" onClick={addAnnouncement}>
            Add announcement
          </button>
        </div>
        <ul className="promo-editor__list">
          {form.announcements.map((a, index) => (
            <li
              key={a.id}
              className="promo-editor__item"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
            >
              <div className="promo-editor__item-bar">
                <span className="promo-editor__drag" aria-hidden="true"><IconDrag /></span>
                <span className="promo-editor__item-title">Announcement {index + 1}</span>
                <div className="promo-editor__item-controls">
                  <button type="button" className="promo-editor__icon-btn"
                    aria-label={`Move up announcement ${index + 1}`}
                    onClick={() => move(index, index - 1)} disabled={index === 0}>
                    <IconUp />
                  </button>
                  <button type="button" className="promo-editor__icon-btn"
                    aria-label={`Move down announcement ${index + 1}`}
                    onClick={() => move(index, index + 1)}
                    disabled={index === form.announcements.length - 1}>
                    <IconDown />
                  </button>
                  <button type="button" className="promo-editor__icon-btn promo-editor__icon-btn--danger"
                    aria-label={`Remove announcement ${index + 1}`}
                    onClick={() => removeAnnouncement(index)}>
                    <IconRemove />
                  </button>
                </div>
              </div>

              <div className="promo-editor__grid">
                <label className="promo-editor__field promo-editor__field--wide">
                  <span>Announcement {index + 1} text</span>
                  <input type="text" value={a.text}
                    onChange={(e) => updateAnnouncement(index, "text", e.target.value)} />
                </label>
                <label className="promo-editor__field promo-editor__field--wide">
                  <span>Link URL (optional)</span>
                  <input type="url" value={a.url}
                    onChange={(e) => updateAnnouncement(index, "url", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Coupon code (optional)</span>
                  <input type="text" value={a.couponCode}
                    onChange={(e) => updateAnnouncement(index, "couponCode", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Slide background</span>
                  <input type="color" value={a.bgColor || form.bgColor}
                    onChange={(e) => updateAnnouncement(index, "bgColor", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Slide text color</span>
                  <input type="color" value={a.textColor || form.textColor}
                    onChange={(e) => updateAnnouncement(index, "textColor", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Start date</span>
                  <input type="datetime-local" value={a.startAt}
                    onChange={(e) => updateAnnouncement(index, "startAt", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>End date</span>
                  <input type="datetime-local" value={a.endAt}
                    onChange={(e) => updateAnnouncement(index, "endAt", e.target.value)} />
                </label>
                <label className="promo-editor__check">
                  <input type="checkbox" checked={a.showOnDesktop}
                    onChange={(e) => updateAnnouncement(index, "showOnDesktop", e.target.checked)} />
                  Show on desktop
                </label>
                <label className="promo-editor__check">
                  <input type="checkbox" checked={a.showOnMobile}
                    onChange={(e) => updateAnnouncement(index, "showOnMobile", e.target.checked)} />
                  Show on mobile
                </label>
                <label className="promo-editor__check">
                  <input type="checkbox" checked={a.enabled}
                    onChange={(e) => updateAnnouncement(index, "enabled", e.target.checked)} />
                  Enabled
                </label>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
```

- [ ] **Step 4: Replace the editor styles**

Replace the contents of `apps/admin/src/pages/admin/ContentPage.css` with:

```css
/* apps/admin/src/pages/admin/ContentPage.css */
.content-page { padding: 1.5rem; max-width: 980px; }

.promo-editor__status { padding: 1rem; opacity: 0.8; }

.promo-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.promo-editor__head h1 { margin: 0; }
.promo-editor__actions { display: flex; align-items: center; gap: 0.75rem; }
.promo-editor__save {
  padding: 0.5rem 1.25rem;
  border: 0;
  border-radius: 6px;
  background: var(--admin-accent, #4f8cff);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.promo-editor__save:disabled { opacity: 0.6; cursor: default; }
.promo-editor__ok { color: #2ecc71; }
.promo-editor__err { color: #ff6b6b; }

.promo-card {
  border: 1px solid var(--admin-border, #2a2a33);
  border-radius: 10px;
  margin-bottom: 1.25rem;
  overflow: hidden;
  background: var(--admin-surface, #14141b);
}
.promo-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--admin-border, #2a2a33);
}
.promo-card__head h2 { margin: 0; font-size: 1rem; }

.promo-editor__device { display: inline-flex; border: 1px solid var(--admin-border, #2a2a33); border-radius: 999px; overflow: hidden; }
.promo-editor__device-btn {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.9rem;
  cursor: pointer;
}
.promo-editor__device-btn--active { background: var(--admin-accent, #4f8cff); color: #fff; }

.promo-editor__preview { padding: 1rem; display: flex; justify-content: center; background: #0c0c12; }
.promo-editor__preview--mobile > * { width: 390px; max-width: 100%; }
.promo-editor__preview--desktop > * { width: 100%; }
.promo-editor__preview-empty { opacity: 0.7; }

.promo-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  padding: 1rem;
}
.promo-editor__field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.promo-editor__field--wide { grid-column: 1 / -1; }
.promo-editor__field input {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--admin-border, #2a2a33);
  border-radius: 6px;
  background: var(--admin-input-bg, #0f0f15);
  color: inherit;
  font: inherit;
}
.promo-editor__field input[type="color"] { padding: 0.1rem; height: 38px; }
.promo-editor__check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }

.promo-editor__add {
  border: 1px solid var(--admin-accent, #4f8cff);
  background: transparent;
  color: var(--admin-accent, #4f8cff);
  border-radius: 6px;
  padding: 0.35rem 0.85rem;
  cursor: pointer;
  font-weight: 600;
}

.promo-editor__list { list-style: none; padding: 0 1rem 1rem; margin: 0; display: grid; gap: 1rem; }
.promo-editor__item { border: 1px solid var(--admin-border, #2a2a33); border-radius: 8px; }
.promo-editor__item-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--admin-border, #2a2a33);
}
.promo-editor__drag { cursor: grab; display: inline-flex; opacity: 0.6; }
.promo-editor__item-title { font-weight: 600; font-size: 0.9rem; }
.promo-editor__item-controls { margin-left: auto; display: flex; gap: 0.35rem; }
.promo-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--admin-border, #2a2a33);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
}
.promo-editor__icon-btn:disabled { opacity: 0.35; cursor: default; }
.promo-editor__icon-btn--danger { color: #ff6b6b; }

@media (max-width: 640px) {
  .promo-editor__grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Run the editor test to verify it passes**

Run: `npm test --workspace=@planet-of-toys/admin -- PromoBannerEditor`
Expected: PASS (3 tests — the two existing plus the new device-toggle test).

- [ ] **Step 6: Run the full admin suite (no regressions)**

Run: `npm run test:admin`
Expected: PASS. Investigate/fix any failure; report findings.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/pages/admin/PromoBannerEditor.jsx apps/admin/src/pages/admin/ContentPage.css apps/admin/src/pages/admin/PromoBannerEditor.test.jsx
git commit -m "feat(admin): redesign promo header editor with SVG controls and device preview toggle"
```

End the commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 4: Full-suite verification

- [ ] **Step 1: Run every workspace test suite**

Run: `npm test`
Expected: PASS across server, client, admin, shared-web (server 448; client gains the Header suite; admin gains ContentRouting + the device test).

- [ ] **Step 2: Build sanity**

Run: `npm run build:client && npm run build:admin`
Expected: both builds succeed (confirms the new `logo.webp` import and all new components resolve through Vite).

- [ ] **Step 3: Manual smoke (optional)**

Start the stack (`npm run dev:server`, `npm run dev:admin`, `npm run dev:client`). Storefront: confirm the header renders site-wide below the promo banner, search routes to `/products?q=…`, action links navigate, and the mobile hamburger toggles the category nav. Admin: confirm "Content" expands to "Promotional Banner", `/admin/content` redirects there, the editor looks themed, SVG reorder controls work, and the Desktop/Mobile preview toggle changes the framed preview.

---

## Self-Review Notes

- **Spec coverage:** Header with logo/SVG-search/account/loyalty/wishlist/cart-badge + config-driven category nav + sticky + mobile hamburger + placeholder routes (Task 1); admin Content expandable folder with `/admin/content/promo-banner` sub-route and `ContentPage` as `<Outlet>` layout (Task 2); editor redesign with themed cards, SVG drag/up/down/remove icons, Desktop/Mobile preview toggle, and "Customer Care:" placeholder (Task 3); verification + builds (Task 4). All decisions from the spec (visual shell, static header, expandable group, config array, preview toggle) are implemented.
- **Type/name consistency:** preview device state `previewDevice` ("desktop"|"mobile") used consistently; preview filter combines `enabled` + `text` + `withinPreviewWindow` + `matchesDevice`; `PromoBannerView` props unchanged (`announcements`, `bgColor`, `textColor`, `rotationIntervalMs`, `rightText`); reorder aria-labels (`Move up announcement N`, `Move down announcement N`, `Remove announcement N`) and `Announcement N text` labels preserved so existing tests pass; nav `children`/`basePath` shape consistent between `NAV_ITEMS` and `NavGroup`.
- **Behavior preserved:** editor load/save/validation/reorder logic is byte-for-byte the same as before; only markup/classes/icons and the preview device filter changed.
- **Placeholder scan:** no TBD/TODO; all code blocks complete; all JSX attributes use `className`.
