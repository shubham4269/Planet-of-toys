import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { NavigationView } from "@planet-of-toys/shared-web";
import logo from "../assets/logo.webp";
import "./Header.css";

/**
 * Storefront site header (static branded shell). Renders the logo, a search box,
 * the account/loyalty/wishlist/cart actions, and a config-driven category nav.
 * Visual only — no real auth/cart/search logic yet; links route to existing or
 * placeholder routes and search submits to /products. All icons are inline SVG.
 */

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
      <circle cx="13" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.8 14.2L4.5 18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconLoyalty() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" aria-hidden="true">
      <path d="M7 4.5h10V9a5 5 0 01-10 0V4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 6H4.5v1A3 3 0 007 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 6h2.5v1a3 3 0 01-2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 20h7l-1.2-3.5H9.7L8.5 20z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" aria-hidden="true">
      <path d="M12 20.8C12 20.8 3 14.5 3 8.8C3 5.6 5.4 3.2 8.4 3.2C10.3 3.2 11.4 4.3 12 5.4C12.6 4.3 13.7 3.2 15.6 3.2C18.6 3.2 21 5.6 21 8.8C21 14.5 12 20.8 12 20.8Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" aria-hidden="true">
      <path d="M3 4h2l2.2 10.6a1.5 1.5 0 001.5 1.2h7.5a1.5 1.5 0 001.45-1.1L21 7.5H6"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="19.5" r="1.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="19.5" r="1.4" stroke="currentColor" strokeWidth="1.5" />
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
  const [navItems, setNavItems] = useState([]);

  useEffect(() => {
    let active = true;
    apiClient.get("/api/catalog/navigation?menuKey=header")
      .then((res) => { if (active) setNavItems(res.items || []); })
      .catch(() => { if (active) setNavItems([]); });
    return () => { active = false; };
  }, []);

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
          <button type="submit" className="site-header__search-btn" aria-label="Search">
            <IconSearch />
          </button>
          <input
            type="search"
            className="site-header__search-input"
            aria-label="Search the store"
            placeholder="Search the store"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>

        <nav className="site-header__actions" aria-label="Account and cart">
          <Link to="/account" className="site-header__action" aria-label="Sign in">
            <IconUser />
            <span>Sign in</span>
          </Link>
          <Link to="/loyalty" className="site-header__action" aria-label="Loyalty">
            <IconLoyalty />
            <span>Loyalty</span>
          </Link>
          <Link to="/wishlist" className="site-header__action" aria-label="Wishlist">
            <IconHeart />
            <span>Wishlist</span>
          </Link>
          <Link to="/cart" className="site-header__action site-header__action--cart" aria-label="Cart">
            <span className="site-header__cart-icon">
              <IconBag />
              <span className="site-header__badge" aria-hidden="true">0</span>
            </span>
            <span>Cart</span>
          </Link>
        </nav>
      </div>

      <div id="site-header-nav" className={`site-header__nav${menuOpen ? " site-header__nav--open" : ""}`}>
        <div className="site-header__nav-desktop">
          <NavigationView items={navItems} variant="desktop" resolveImageUrl={(f) => mediaUrl(f)} onNavigate={() => setMenuOpen(false)} />
        </div>
        <div className="site-header__nav-mobile">
          <NavigationView items={navItems} variant="mobile" resolveImageUrl={(f) => mediaUrl(f)} onNavigate={() => setMenuOpen(false)} />
        </div>
      </div>
    </header>
  );
}
