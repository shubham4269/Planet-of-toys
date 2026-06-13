import { useEffect } from "react";
import { Outlet } from "react-router-dom";

/**
 * Layout wrapper for the customer-facing storefront routes.
 *
 * Ensures the light, conversion-first customer theme is active by clearing any
 * admin theme flag left on the document root, then renders the matched child
 * route via <Outlet>. Customer pages (landing, checkout, success, policies) are
 * implemented in later tasks and mounted as children of this layout.
 *
 * Requirements: 20.2.
 */
export default function CustomerLayout() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
  }, []);

  return (
    <div className="customer-shell">
      <Outlet />
    </div>
  );
}
