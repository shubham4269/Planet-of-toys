import { BrowserRouter, Routes, Route } from "react-router-dom";
import CustomerLayout from "./components/CustomerLayout.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import OrderSuccessPage from "./pages/OrderSuccessPage.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import TermsOfServicePage from "./pages/TermsOfServicePage.jsx";
import ShippingPolicyPage from "./pages/ShippingPolicyPage.jsx";
import RefundPolicyPage from "./pages/RefundPolicyPage.jsx";
import "./styles/tokens.css";

/**
 * Storefront application: SPA shell and routing (www.planetoftoys.in).
 *
 * This is the standalone customer storefront. The previous paid-ads "Forbidden"
 * lockdown has been removed; the storefront is now a full ecommerce surface.
 * The catalogue routes (home, listing, product detail, cart) are scaffolded as
 * placeholders to be implemented in later tasks — only the routing structure is
 * prepared here. The existing checkout, order-success, and policy pages are
 * wired to their real implementations and behave exactly as before.
 *
 * Requirements: 20.2.
 */

/** Placeholder used until a route's real ecommerce page is implemented. */
function Placeholder({ title }) {
  return (
    <section>
      <h1>{title}</h1>
    </section>
  );
}

/**
 * Route table for the storefront SPA. Exported separately from <App> so tests
 * can mount it inside a MemoryRouter at an arbitrary initial path.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        {/* Catalogue — scaffolded for future implementation. */}
        <Route index element={<Placeholder title="Planet of Toys" />} />
        <Route path="products" element={<Placeholder title="Products" />} />
        <Route path="product/:slug" element={<Placeholder title="Product" />} />
        <Route path="cart" element={<Placeholder title="Your cart" />} />
        <Route path="account" element={<Placeholder title="Account" />} />
        <Route path="loyalty" element={<Placeholder title="Loyalty & Rewards" />} />
        <Route path="wishlist" element={<Placeholder title="Your wishlist" />} />

        {/* Checkout — order summary, customer form, serviceability, payment (Req 4,5,6). */}
        <Route path="checkout" element={<CheckoutPage />} />
        {/* Direct-to-checkout — a product slug may be supplied in the URL. */}
        <Route path="checkout/:slug" element={<CheckoutPage />} />
        {/* Order success — displays order id/summary, fires Purchase (Req 3.3, 20.1). */}
        <Route path="order/success" element={<OrderSuccessPage />} />

        {/* Legal/policy pages reachable from footer links (Req 20.2). */}
        <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="terms-of-service" element={<TermsOfServicePage />} />
        <Route path="shipping-policy" element={<ShippingPolicyPage />} />
        <Route path="refund-policy" element={<RefundPolicyPage />} />

        <Route path="*" element={<Placeholder title="Page not found" />} />
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
