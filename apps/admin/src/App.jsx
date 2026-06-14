import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "./components/AdminLayout.jsx";
import RequireAdminAuth from "./components/RequireAdminAuth.jsx";
import AdminLoginPage from "./pages/AdminLoginPage.jsx";
import DashboardPage from "./pages/admin/DashboardPage.jsx";
import ProductsPage from "./pages/admin/ProductsPage.jsx";
import OrdersPage from "./pages/admin/OrdersPage.jsx";
import SettingsPage from "./pages/admin/SettingsPage.jsx";
import ContentPage from "./pages/admin/ContentPage.jsx";
import "./styles/tokens.css";

/**
 * Admin application shell and routing (admin.planetoftoys.in).
 *
 * This is the standalone admin SPA. It keeps the established `/admin/*` route
 * structure so the route guard, navigation, and login redirect behave exactly
 * as before — only the application boundary has changed (the admin panel is no
 * longer bundled with the storefront). The login route is public; every other
 * route renders only for a present, unexpired session (Req 15.2, 19.5, 21.3).
 */

/** Simple in-panel not-found view (admin chrome already provided by layout). */
function NotFound() {
  return (
    <section>
      <h1>Not found</h1>
    </section>
  );
}

/**
 * Route table for the admin SPA. Exported separately from <App> so tests can
 * mount it inside a MemoryRouter at an arbitrary initial path.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="admin" element={<AdminLayout />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<RequireAdminAuth />}>
          {/* Dashboard (Req 25). */}
          <Route index element={<DashboardPage />} />
          {/* Product management — CRUD, media upload, state toggles (Req 16). */}
          <Route path="products" element={<ProductsPage />} />
          {/* Order management — list/detail, cancel, manual courier/AWB (Req 17). */}
          <Route path="orders" element={<OrdersPage />} />
          {/* Content management — promotional header (Content section). */}
          <Route path="content" element={<ContentPage />} />
          {/* System settings — integration credential management (Req 30). */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      {/* Anything outside the panel funnels into it (then the guard handles auth). */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
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
