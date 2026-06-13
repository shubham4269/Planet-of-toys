import { BrowserRouter, Routes, Route } from "react-router-dom";
import CustomerLayout from "./components/CustomerLayout.jsx";
import AdminLayout from "./components/AdminLayout.jsx";
import RequireAdminAuth from "./components/RequireAdminAuth.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import AdminLoginPage from "./pages/AdminLoginPage.jsx";
import DashboardPage from "./pages/admin/DashboardPage.jsx";
import ProductsPage from "./pages/admin/ProductsPage.jsx";
import OrdersPage from "./pages/admin/OrdersPage.jsx";
import SettingsPage from "./pages/admin/SettingsPage.jsx";
import OrderSuccessPage from "./pages/OrderSuccessPage.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import TermsOfServicePage from "./pages/TermsOfServicePage.jsx";
import ShippingPolicyPage from "./pages/ShippingPolicyPage.jsx";
import RefundPolicyPage from "./pages/RefundPolicyPage.jsx";
import "./styles/tokens.css";

/**
 * Root application: SPA shell and routing.
 *
 * Establishes the customer/admin route split. Customer routes render under
 * <CustomerLayout> (light, conversion-first theme); admin routes render under
 * <AdminLayout> (dark theme). The placeholder route elements below are replaced
 * by full page implementations in later tasks (landing 16, checkout 17, success
 * + policies 18, admin panel 19). Visual styling consumes the shared design
 * tokens defined in styles/tokens.css.
 *
 * Requirements: 20.2.
 */

/** Temporary placeholder used until a route's real page is implemented. */
function Placeholder({ title }) {
  return (
    <section>
      <h1>{title}</h1>
    </section>
  );
}

/**
 * Forbidden view shown for every URL outside the paid-ads funnel
 * (checkout, order success, policy pages) and the admin panel. Deliberately
 * link-free so blocked paths are a dead end rather than a way into the site.
 */
function Forbidden() {
  return (
    <section style={{ textAlign: "center", padding: "96px 24px" }}>
      <h1>403 Forbidden</h1>
      <p>You don't have permission to access this page.</p>
    </section>
  );
}

/**
 * Route table for the SPA. Exported separately from <App> so tests can mount it
 * inside a MemoryRouter at an arbitrary initial path.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Customer storefront — restricted to the paid-ads funnel. Only the
          direct-to-checkout routes, order success, and the policy pages are
          reachable; everything else (including / and the old /p/:slug landing
          pages) renders the 403 view. */}
      <Route element={<CustomerLayout />}>
        <Route index element={<Forbidden />} />
        {/* Checkout — order summary, customer form, serviceability, payment (Req 4,5,6). */}
        <Route path="checkout" element={<CheckoutPage />} />
        {/* Direct-to-checkout — Facebook Ad traffic lands here with product in the URL. */}
        <Route path="checkout/:slug" element={<CheckoutPage />} />
        {/* Order success — displays order id/summary, fires Purchase (Req 3.3, 20.1). */}
        <Route path="order/success" element={<OrderSuccessPage />} />
        {/* Legal/policy pages reachable from footer links (Req 20.2). */}
        <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="terms-of-service" element={<TermsOfServicePage />} />
        <Route path="shipping-policy" element={<ShippingPolicyPage />} />
        <Route path="refund-policy" element={<RefundPolicyPage />} />
        <Route path="*" element={<Forbidden />} />
      </Route>

      {/* Admin panel — dark theme with a client-side route guard (Req 15.2,
          19.5, 21.3). The login route is public; all other admin routes render
          only for a present, unexpired session, otherwise redirect to login. */}
      <Route path="admin" element={<AdminLayout />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<RequireAdminAuth />}>
          <Route index element={<DashboardPage />} />
          {/* Product management — CRUD, media upload, state toggles (Req 16). */}
          <Route path="products" element={<ProductsPage />} />
          {/* Order management — list/detail, cancel, manual courier/AWB (Req 17). */}
          <Route path="orders" element={<OrdersPage />} />
          {/* System settings — integration credential management (Req 30). */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Placeholder title="Not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
