import { Navigate, Outlet, useLocation } from "react-router-dom";

import { isAuthenticated } from "../lib/adminAuth.js";

/**
 * Client-side route guard for the admin panel.
 *
 * Renders the matched admin child route only when a valid (present, well-formed,
 * unexpired) JWT is in storage. When the session is missing or expired the guard
 * redirects to the admin login page, preserving the attempted location in router
 * state so the login flow can return the administrator there after sign-in.
 *
 * The server independently enforces auth on every protected request (signature +
 * expiry); this guard is the UX layer that keeps protected views from rendering
 * for an unauthenticated or expired session (Req 19.5, 21.3).
 *
 * Requirements: 19.5, 21.3.
 */
export default function RequireAdminAuth() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return (
      <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}
