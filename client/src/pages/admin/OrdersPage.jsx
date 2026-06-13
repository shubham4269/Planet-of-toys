import { useCallback, useEffect, useState } from "react";

import apiClient, { ApiError } from "../../lib/apiClient.js";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import { formatINR } from "../../lib/format.js";
import "./OrdersPage.css";

/**
 * Admin order management page (Req 17).
 *
 * Provides the operations surface an administrator uses to view and manage
 * orders against the admin order API:
 *   - List orders with filtering (by Order_Status), free-text search, and
 *     pagination (`GET /api/admin/orders`) (Req 17.1).
 *   - Open an order detail showing customer, payment, shipment information,
 *     Shipment_Status, and the status-history timeline
 *     (`GET /api/admin/orders/:id`) (Req 17.2).
 *   - Cancel an order, which sets Order_Status to CANCELLED and appends a
 *     status-history entry (`POST /api/admin/orders/:id/cancel`) (Req 17.3).
 *   - For an order whose Shipment_Status is PENDING, manually trigger Shiprocket
 *     courier assignment and AWB generation
 *     (`POST /api/admin/orders/:id/fulfill`). On success the backend stores the
 *     AWB + courier and sets Shipment_Status to CREATED; on failure the status
 *     stays PENDING (Req 11.8, 17.4, 17.5, 17.6).
 *
 * Shipping status is webhook-driven and never manually editable here; the only
 * shipment control exposed is the PENDING courier/AWB trigger (Req 12.3).
 *
 * Every call carries the admin bearer token (see adminAuth). A 401 clears the
 * session and signals the admin shell to redirect to login (Req 21.3).
 *
 * Requirements: 11.8, 17.1, 17.2, 17.3, 17.4; 15.2 (dark theme).
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

const PAGE_SIZE = 20;

/** Human-friendly label for a status enum value (e.g. OUT_FOR_DELIVERY). */
function statusLabel(status) {
  if (typeof status !== "string" || status === "") return "—";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Human shipment state derived from the shipment record plus the
 * webhook-driven order lifecycle, so an admin can see at a glance whether
 * Shiprocket action is required.
 */
function shipmentLabel(order) {
  if (!order) return "—";
  if (order.shipmentStatus === "CANCELLED") return "Cancelled";
  if (order.shipmentStatus === "PENDING") {
    return order.orderStatus === "CANCELLED" ? "No Shipment" : "Pending";
  }
  // CREATED — an AWB exists; refine by the courier lifecycle status.
  switch (order.orderStatus) {
    case "PACKED":
      return "Pickup Scheduled";
    case "SHIPPED":
      return "In Transit";
    case "OUT_FOR_DELIVERY":
      return "Out for Delivery";
    case "DELIVERED":
      return "Delivered";
    case "RTO":
      return "Return (RTO)";
    case "CANCELLED":
      // Order cancelled but the shipment was not — pickup is still live.
      return "⚠ Cancel in Shiprocket";
    default:
      return "AWB Generated";
  }
}

/** Format an ISO/epoch timestamp for display; tolerant of missing values. */
function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function OrdersPage() {
  // ---- List state ----
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Post-action warning needing admin follow-up (e.g. manual Shiprocket cancel).
  const [warning, setWarning] = useState(null);

  // ---- Detail state ----
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [acting, setActing] = useState(false);

  /** Translate an unauthorized error into a redirect-to-login signal. */
  const handleApiError = useCallback((err, fallback, setter) => {
    if (err instanceof ApiError && err.status === 401) {
      notifyUnauthorized();
      return;
    }
    setter(
      (err instanceof ApiError && err.message) || fallback || "Request failed."
    );
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await apiClient.get(
        `/api/admin/orders?${params.toString()}`,
        { token: getToken() }
      );
      setOrders(Array.isArray(res?.orders) ? res.orders : []);
      setTotal(Number(res?.total ?? res?.orders?.length ?? 0));
    } catch (err) {
      handleApiError(err, "Unable to load orders.", setError);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, handleApiError]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const loadDetail = useCallback(
    async (id) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await apiClient.get(`/api/admin/orders/${id}`, {
          token: getToken(),
        });
        setDetail(res?.order ?? res ?? null);
      } catch (err) {
        handleApiError(err, "Unable to load order detail.", setDetailError);
      } finally {
        setDetailLoading(false);
      }
    },
    [handleApiError]
  );

  function openDetail(order) {
    const id = order.id ?? order._id ?? order.orderId;
    setNotice(null);
    setWarning(null);
    setSelectedId(id);
    setDetail(null);
    loadDetail(id);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setActing(false);
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function changeStatusFilter(value) {
    setPage(1);
    setStatusFilter(value);
  }

  /** Reset the free-text search and status filter back to the full list. */
  function clearFilters() {
    setPage(1);
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
  }

  const hasActiveFilters = search !== "" || statusFilter !== "";

  /** Cancel the open order (Req 17.3); paid online orders are auto-refunded. */
  async function handleCancel() {
    if (!detail || acting) return;
    const id = detail.id ?? detail._id ?? selectedId;
    const isPaidOnline =
      detail.payment?.method === "ONLINE" && detail.payment?.status === "PAID";
    const ok = globalThis.confirm?.(
      isPaidOnline
        ? `Cancel order ${detail.orderId ?? id}? A full refund of ${formatINR(detail.amount)} will be issued to the customer via Razorpay. This cannot be undone.`
        : `Cancel order ${detail.orderId ?? id}? This cannot be undone.`
    );
    if (ok === false) return;
    setActing(true);
    setDetailError(null);
    try {
      const res = await apiClient.post(
        `/api/admin/orders/${id}/cancel`,
        {},
        { token: getToken() }
      );
      const updated = res?.order ?? null;
      if (updated) setDetail(updated);
      setNotice(
        isPaidOnline
          ? `Order ${detail.orderId ?? id} cancelled and refund initiated.`
          : `Order ${detail.orderId ?? id} cancelled.`
      );
      // Surface any follow-up the server flagged (e.g. the Shiprocket
      // shipment could not be cancelled automatically).
      setWarning(res?.warning ?? null);
      await loadOrders();
    } catch (err) {
      handleApiError(err, "Unable to cancel order.", setDetailError);
    } finally {
      setActing(false);
    }
  }

  /**
   * Manually trigger Shiprocket courier assignment + AWB generation for an
   * order whose Shipment_Status is PENDING (Req 11.8, 17.4). Success transitions
   * the order to CREATED; a provider failure leaves it PENDING with a generic,
   * non-revealing message (Req 17.6).
   */
  async function handleFulfill() {
    if (!detail || acting) return;
    const id = detail.id ?? detail._id ?? selectedId;
    setActing(true);
    setDetailError(null);
    try {
      const res = await apiClient.post(
        `/api/admin/orders/${id}/fulfill`,
        {},
        { token: getToken() }
      );
      const updated = res?.order ?? null;
      if (updated) setDetail(updated);
      if (updated?.shipmentStatus === "CREATED") {
        setNotice(`Courier assigned and AWB generated for ${detail.orderId ?? id}.`);
      } else {
        setNotice(
          "Shipment is still pending. The system will keep retrying automatically."
        );
      }
      await loadOrders();
    } catch (err) {
      handleApiError(
        err,
        "Unable to trigger courier assignment. Please try again.",
        setDetailError
      );
    } finally {
      setActing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="admin-orders">
      <header className="admin-orders__head">
        <div>
          <h1 className="admin-orders__title">Orders</h1>
          <p className="admin-orders__subtitle">
            View, search, and manage customer orders.
          </p>
        </div>
      </header>

      <div className="admin-orders__toolbar">
        <form className="admin-orders__search" onSubmit={submitSearch} role="search">
          <input
            className="admin-orders__input"
            type="search"
            placeholder="Search by order id, name, or phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search orders"
          />
          <button type="submit" className="admin-orders__ghost">
            Search
          </button>
        </form>

        <label className="admin-orders__filter">
          <span className="admin-orders__filter-label">Status</span>
          <select
            className="admin-orders__select"
            value={statusFilter}
            onChange={(e) => changeStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters ? (
          <button
            type="button"
            className="admin-orders__ghost admin-orders__clear-filters"
            onClick={clearFilters}
            data-testid="clear-filters"
          >
            ✕ Clear filters
          </button>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <p className="admin-orders__muted" data-testid="active-filters">
          Showing{" "}
          {search ? <>results for “{search}”</> : "all orders"}
          {statusFilter ? <> with status {statusLabel(statusFilter)}</> : null}
        </p>
      ) : null}

      {error ? (
        <p className="admin-orders__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-orders__notice" role="status">
          {notice}
        </p>
      ) : null}
      {warning ? (
        <p className="admin-orders__warning" role="alert" data-testid="cancel-warning">
          ⚠ {warning}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-orders__muted">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="admin-orders__muted">No orders match the current view.</p>
      ) : (
        <div className="admin-orders__table-wrap">
          <table className="admin-orders__table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Shipment</th>
                <th scope="col">Placed</th>
                <th scope="col" className="admin-orders__actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const id = order.id ?? order._id ?? order.orderId;
                return (
                  <tr key={id}>
                    <td>
                      <span className="admin-orders__order-id">
                        {order.orderId ?? id}
                      </span>
                    </td>
                    <td>
                      <span className="admin-orders__customer">
                        {order.customer?.name ?? "—"}
                      </span>
                      <span className="admin-orders__muted-inline">
                        {order.customer?.phone ?? ""}
                      </span>
                    </td>
                    <td>{formatINR(order.amount)}</td>
                    <td>
                      <span
                        className={`admin-orders__badge admin-orders__badge--${(
                          order.orderStatus || ""
                        ).toLowerCase()}`}
                      >
                        {statusLabel(order.orderStatus)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-orders__chip admin-orders__chip--${(
                          order.shipmentStatus || ""
                        ).toLowerCase()}`}
                      >
                        {shipmentLabel(order)}
                      </span>
                    </td>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td className="admin-orders__actions-col">
                      <button
                        type="button"
                        className="admin-orders__link"
                        onClick={() => openDetail(order)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && orders.length > 0 ? (
        <nav className="admin-orders__pager" aria-label="Pagination">
          <button
            type="button"
            className="admin-orders__ghost"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="admin-orders__page-info">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="admin-orders__ghost"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </nav>
      ) : null}

      {selectedId ? (
        <div
          className="admin-orders__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Order detail"
        >
          <div className="admin-orders__panel">
            <div className="admin-orders__panel-head">
              <h2 className="admin-orders__panel-title">
                Order {detail?.orderId ?? selectedId}
              </h2>
              <button
                type="button"
                className="admin-orders__link"
                onClick={closeDetail}
              >
                Close
              </button>
            </div>

            {detailError ? (
              <p className="admin-orders__error" role="alert">
                {detailError}
              </p>
            ) : null}

            {detailLoading ? (
              <p className="admin-orders__muted">Loading order…</p>
            ) : detail ? (
              <div className="admin-orders__detail">
                {/* Persistent call-to-action: the order is cancelled but its
                    Shiprocket shipment is still live, so the courier pickup
                    must be called off manually. */}
                {detail.orderStatus === "CANCELLED" &&
                Boolean(
                  detail.shipment?.shiprocketOrderId || detail.shipment?.awb
                ) &&
                detail.shipmentStatus !== "CANCELLED" ? (
                  <div
                    className="admin-orders__manual-action"
                    role="alert"
                    data-testid="manual-shiprocket-action"
                  >
                    <span>
                      ⚠ Manual cancellation required — this cancelled order's
                      Shiprocket shipment
                      {detail.shipment?.awb ? ` (AWB ${detail.shipment.awb})` : ""} is
                      still active and may be picked up by the courier.
                    </span>
                    <a
                      className="admin-orders__primary admin-orders__manual-link"
                      href="https://app.shiprocket.in/seller/orders"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Shiprocket / Cancel Manually
                    </a>
                  </div>
                ) : null}
                <div className="admin-orders__detail-grid">
                  {/* Customer information (Req 17.2). */}
                  <section className="admin-orders__section">
                    <h3 className="admin-orders__section-title">Customer</h3>
                    <dl className="admin-orders__dl">
                      <dt>Name</dt>
                      <dd>{detail.customer?.name ?? "—"}</dd>
                      <dt>Phone</dt>
                      <dd>{detail.customer?.phone ?? "—"}</dd>
                      <dt>Email</dt>
                      <dd>{detail.customer?.email || "—"}</dd>
                      <dt>Address</dt>
                      <dd>
                        {[
                          detail.customer?.address,
                          detail.customer?.city,
                          detail.customer?.state,
                          detail.customer?.pincode,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </dd>
                    </dl>
                  </section>

                  {/* Payment information (Req 17.2). */}
                  <section className="admin-orders__section">
                    <h3 className="admin-orders__section-title">Payment</h3>
                    <dl className="admin-orders__dl">
                      <dt>Method</dt>
                      <dd>
                        {detail.payment?.method === "ONLINE"
                          ? "Online (Razorpay)"
                          : detail.payment?.method === "COD"
                            ? "Cash on Delivery"
                            : detail.payment?.method ?? "—"}
                      </dd>
                      <dt>Status</dt>
                      <dd>{statusLabel(detail.payment?.status)}</dd>
                      <dt>Amount</dt>
                      <dd>{formatINR(detail.amount)}</dd>
                      {detail.payment?.razorpay?.paymentId ? (
                        <>
                          <dt>Payment ID</dt>
                          <dd>{detail.payment.razorpay.paymentId}</dd>
                        </>
                      ) : null}
                    </dl>
                  </section>

                  {/* Shipment information + status (Req 17.2). */}
                  <section className="admin-orders__section">
                    <h3 className="admin-orders__section-title">Shipment</h3>
                    <dl className="admin-orders__dl">
                      <dt>Order status</dt>
                      <dd>{statusLabel(detail.orderStatus)}</dd>
                      <dt>Shipment status</dt>
                      <dd>{shipmentLabel(detail)}</dd>
                      <dt>Shiprocket ID</dt>
                      <dd>{detail.shipment?.shiprocketOrderId || "—"}</dd>
                      <dt>Courier</dt>
                      <dd>{detail.shipment?.courier || "—"}</dd>
                      <dt>AWB</dt>
                      <dd>{detail.shipment?.awb || "—"}</dd>
                      <dt>Last updated</dt>
                      <dd>{formatDateTime(detail.updatedAt)}</dd>
                    </dl>
                  </section>
                </div>

                {/* Line items. */}
                <section className="admin-orders__section">
                  <h3 className="admin-orders__section-title">Items</h3>
                  <ul className="admin-orders__items">
                    {(detail.items ?? []).map((item, index) => (
                      <li
                        className="admin-orders__item"
                        key={item.productId ?? `item-${index}`}
                      >
                        <span className="admin-orders__item-name">
                          {item.name}
                          {item.color ? (
                            <span className="admin-orders__muted-inline">
                              {" "}({item.color})
                            </span>
                          ) : null}
                        </span>
                        <span className="admin-orders__muted-inline">
                          {item.quantity} × {formatINR(item.unitPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Status-history timeline (Req 17.2). */}
                <section className="admin-orders__section">
                  <h3 className="admin-orders__section-title">
                    Status timeline
                  </h3>
                  {Array.isArray(detail.timeline) &&
                  detail.timeline.length > 0 ? (
                    <ol className="admin-orders__timeline">
                      {detail.timeline.map((entry, index) => (
                        <li
                          className="admin-orders__timeline-item"
                          key={`history-${index}`}
                        >
                          <span className="admin-orders__timeline-dot" aria-hidden="true" />
                          <div className="admin-orders__timeline-body">
                            <span className="admin-orders__timeline-status">
                              {statusLabel(entry.status)}
                            </span>
                            <span className="admin-orders__muted-inline">
                              {formatDateTime(entry.timestamp)}
                            </span>
                            {entry.note ? (
                              <span className="admin-orders__timeline-note">
                                {entry.note}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="admin-orders__muted">No history recorded.</p>
                  )}
                </section>

                {/* Actions: manual fulfilment trigger + cancellation. */}
                <div className="admin-orders__panel-foot">
                  {detail.shipmentStatus === "PENDING" ? (
                    <button
                      type="button"
                      className="admin-orders__primary"
                      onClick={handleFulfill}
                      disabled={acting}
                    >
                      {acting ? "Working…" : "Assign courier & generate AWB"}
                    </button>
                  ) : null}
                  {detail.orderStatus !== "CANCELLED" ? (
                    <button
                      type="button"
                      className="admin-orders__danger"
                      onClick={handleCancel}
                      disabled={acting}
                    >
                      {acting ? "Working…" : "Cancel order"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
