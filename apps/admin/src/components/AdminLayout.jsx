import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link, NavLink } from "react-router-dom";

import {
  ADMIN_UNAUTHORIZED_EVENT,
  clearToken,
  isAuthenticated,
} from "../lib/adminAuth.js";
import "./AdminLayout.css";

/**
 * Admin Layout — sidebar navigation + content area.
 *
 * Black & white theme with a persistent sidebar on desktop and a
 * hamburger-triggered side panel on mobile.
 */

/** SVG icons for sidebar nav items. */
function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconProducts() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 8l9 5 9-5M12 13v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconContent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <rect x="3" y="4" width="18" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 12h16M4 16h10M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-nav__icon">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", Icon: IconDashboard, end: true },
  { to: "/admin/products", label: "Products", Icon: IconProducts },
  { to: "/admin/orders", label: "Orders", Icon: IconOrders },
  { to: "/admin/content", label: "Content", Icon: IconContent },
  { to: "/admin/settings", label: "Settings", Icon: IconSettings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const onLoginRoute = location.pathname === "/admin/login";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Activate the admin theme.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "admin");
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  // Close mobile sidebar on route change.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Listen for unauthorized events.
  useEffect(() => {
    function handleUnauthorized() {
      navigate("/admin/login", { replace: true });
    }
    globalThis.addEventListener?.(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      globalThis.removeEventListener?.(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [navigate]);

  function handleSignOut() {
    clearToken();
    navigate("/admin/login", { replace: true });
  }

  const showChrome = !onLoginRoute && isAuthenticated();

  if (!showChrome) {
    return (
      <div className="admin-shell admin-shell--no-sidebar">
        <main className="admin-shell__main">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      {/* Mobile top bar */}
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-topbar__hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
        <span className="admin-topbar__title">Planet of Toys</span>
        <span className="admin-topbar__tag">Admin</span>
      </header>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="admin-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? " admin-sidebar--open" : ""}`}>
        <div className="admin-sidebar__header">
          <Link to="/admin" className="admin-sidebar__brand">
            Planet of Toys
            <span className="admin-sidebar__brand-tag">Admin</span>
          </Link>
          <button
            type="button"
            className="admin-sidebar__close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

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

        <div className="admin-sidebar__footer">
          <button
            type="button"
            className="admin-nav__link admin-nav__signout"
            onClick={handleSignOut}
          >
            <IconSignOut />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
