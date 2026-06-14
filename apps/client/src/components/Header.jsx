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
