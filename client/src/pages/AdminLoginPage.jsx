import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import apiClient, { ApiError } from "../lib/apiClient.js";
import { isAuthenticated, setToken } from "../lib/adminAuth.js";

/**
 * Admin login page (Req 14, 21, 25).
 *
 * Collects an administrator email + password and authenticates against
 * `POST /api/admin/login`. On success the returned JWT is persisted (see
 * adminAuth) and the administrator is forwarded to the dashboard (or back to the
 * protected location that triggered the redirect). On failure the backend
 * returns a single generic message for both unknown emails and wrong passwords
 * (Req 25.3, 25.4); this page surfaces that generic message and never reveals
 * which field was wrong.
 *
 * Requirements: 21.3 (login destination for expired/guarded sessions), 15.2.
 */
const GENERIC_AUTH_ERROR = "Invalid email or password.";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await apiClient.post("/api/admin/login", { email, password });
      const token = res?.token;
      if (!token) {
        // A 2xx response without a token is treated as a generic failure.
        setError(GENERIC_AUTH_ERROR);
        return;
      }
      setToken(token);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // Surface only a generic, non-revealing message (Req 25.3, 25.4). For
      // unexpected/network errors fall back to the same generic copy.
      if (err instanceof ApiError && err.status === 401) {
        setError(GENERIC_AUTH_ERROR);
      } else if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError(GENERIC_AUTH_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="admin-login">
      <form className="admin-login__card" onSubmit={handleSubmit} noValidate>
        <h1 className="admin-login__title">Admin sign in</h1>
        <p className="admin-login__subtitle">
          Sign in to manage products, orders, and settings.
        </p>

        {error ? (
          <p className="admin-login__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-login__field">
          <label className="admin-login__label" htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            className="admin-login__input"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="admin-login__field">
          <label className="admin-login__label" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            className="admin-login__input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="admin-login__submit"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

/**
 * Convenience guard for the login route itself: if a valid session already
 * exists, callers may use {@link isAuthenticated} to skip the form. Exported for
 * reuse/testing.
 */
export { isAuthenticated };
