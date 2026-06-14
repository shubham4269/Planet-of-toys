import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import PromoBanner from "./PromoBanner.jsx";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";

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
      <Footer />
    </div>
  );
}
