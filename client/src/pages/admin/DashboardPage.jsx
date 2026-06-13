import { useEffect, useState } from "react";

import apiClient, { ApiError } from "../../lib/apiClient.js";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import { formatINR } from "../../lib/format.js";
import "./DashboardPage.css";

/**
 * Admin dashboard view (Req 15.1).
 *
 * Renders the key business statistics an administrator monitors at a glance:
 * total order count, total revenue, and the order-status breakdown. The figures
 * are aggregated on the backend (see design Property 28 — dashboard aggregates
 * match the order set) and fetched here as a read-only projection.
 *
 * Endpoint: GET /api/admin/dashboard (bearer-authenticated). Expected response
 * shape:
 *   {
 *     orderCount: number,
 *     revenue: number,                       // INR, sum of revenue-eligible orders
 *     statusBreakdown: { CONFIRMED: n, ... }  // per-status tallies
 *   }
 *
 * A 401 surfaces the global unauthorized signal so the admin shell redirects to
 * login (Req 21.3); any other failure shows a non-revealing inline error.
 *
 * Requirements: 15.1 (order count, revenue, status breakdown), 15.2 (dark theme).
 */

/** Canonical Order_Status enumeration, in lifecycle order (Req 9.2). */
const ORDER_STATUSES = [
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RTO",
];

/** Human-friendly label for a status enum value (e.g. OUT_FOR_DELIVERY). */
function statusLabel(status) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get("/api/admin/dashboard", {
          token: getToken(),
          signal: controller.signal,
        });
        if (active) setStats(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          // Expired/invalid session — let the shell redirect to login.
          notifyUnauthorized();
          return;
        }
        setError("Unable to load dashboard statistics. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStats();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const breakdown = stats?.statusBreakdown ?? {};

  return (
    <section className="admin-dashboard">
      <header className="admin-dashboard__header">
        <h1 className="admin-dashboard__title">Admin Dashboard</h1>
        <p className="admin-dashboard__subtitle">
          Key business statistics at a glance.
        </p>
      </header>

      {error ? (
        <p className="admin-dashboard__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-dashboard__metrics">
        <article className="admin-card admin-card--metric" data-testid="metric-order-count">
          <span className="admin-card__label">Total orders</span>
          <span className="admin-card__value">
            {loading ? "—" : Number(stats?.orderCount ?? 0).toLocaleString("en-IN")}
          </span>
        </article>

        <article className="admin-card admin-card--metric" data-testid="metric-revenue">
          <span className="admin-card__label">Revenue</span>
          <span className="admin-card__value">
            {loading ? "—" : formatINR(stats?.revenue ?? 0)}
          </span>
        </article>
      </div>

      <section className="admin-card admin-dashboard__breakdown" data-testid="status-breakdown">
        <h2 className="admin-card__heading">Order status breakdown</h2>
        <ul className="admin-dashboard__status-list">
          {ORDER_STATUSES.map((status) => (
            <li
              key={status}
              className="admin-dashboard__status-item"
              data-testid={`status-${status}`}
            >
              <span className="admin-dashboard__status-name">
                {statusLabel(status)}
              </span>
              <span className="admin-dashboard__status-count">
                {loading ? "—" : Number(breakdown[status] ?? 0).toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
