import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

import pixel from "../lib/pixel.js";
import { formatINR } from "../lib/format.js";
import "./OrderSuccessPage.css";

/**
 * Order Success Page (Req 3.3, 20.1).
 *
 * Shown after an order is successfully created. The Checkout flow navigates
 * here with the created order in router location state, e.g.
 *   navigate("/order/success", { state: { order } })
 * where `order` carries at least `orderId` and `amount`, and (optionally) the
 * line `items` and `paymentMethod` used to render the summary.
 *
 * Behaviors:
 *   - Displays the order identifier and an order summary (Req 20.1).
 *   - On mount, fires the Meta Pixel `Purchase` event including the order value
 *     exactly once (Req 3.3).
 *   - Degrades gracefully when reached without order state (e.g. a direct
 *     visit or a page refresh) by showing a confirmation fallback and a link
 *     back to the storefront, without firing a Purchase event.
 *
 * All visual styling consumes the shared design tokens in styles/tokens.css via
 * OrderSuccessPage.css.
 */

/** Footer legal/policy links shared across customer pages (Req 20.2). */
const FOOTER_LINKS = [
  { to: "/privacy-policy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/shipping-policy", label: "Shipping Policy" },
  { to: "/terms-of-service", label: "Terms & Conditions" },
];

/** Resolve the order payload from router location state. */
function resolveOrder(state) {
  if (!state || typeof state !== "object") return null;
  // Accept either { order: {...} } or the order object directly.
  const order = state.order ?? state;
  if (!order || typeof order !== "object") return null;
  if (!order.orderId && !Number.isFinite(Number(order.amount))) return null;
  return order;
}

export default function OrderSuccessPage() {
  const location = useLocation();
  const order = useMemo(
    () => resolveOrder(location.state),
    [location.state]
  );

  // Guard against double-firing in React 18 StrictMode / re-renders (Req 3.3).
  const purchaseFired = useRef(false);

  useEffect(() => {
    if (purchaseFired.current) return;
    if (!order) return;
    const value = Number(order.amount);
    if (!Number.isFinite(value)) return;
    purchaseFired.current = true;
    // Fire the standard Purchase event including the order value (Req 3.3).
    pixel.purchase(value);
  }, [order]);

  if (!order) {
    return (
      <main className="success success--state">
        <section className="success__card success__fallback">
          <h1 className="success__title">Order confirmed</h1>
          <p className="success__lead">
            Thank you for your purchase. A confirmation has been sent to you on
            WhatsApp.
          </p>
          <a className="success__home-cta" href="https://wa.me/918448617222" target="_blank" rel="noreferrer">
            Need help? WhatsApp us
          </a>
        </section>
      </main>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const hasItems = items.length > 0;
  const amount = Number(order.amount);
  const hasAmount = Number.isFinite(amount);

  return (
    <main className="success">
      <section className="success__card">
        <span className="success__check" aria-hidden="true">
          ✓
        </span>
        <h1 className="success__title">Order confirmed!</h1>
        <p className="success__lead">
          Thank you for your purchase. We've started preparing your order and
          will keep you updated on WhatsApp.
        </p>

        {order.orderId ? (
          <p className="success__order-id">
            Order ID:{" "}
            <strong data-testid="order-id">{order.orderId}</strong>
          </p>
        ) : null}

        <div className="success__summary" data-testid="order-summary">
          <h2 className="success__summary-title">Order Summary</h2>

          {hasItems ? (
            <ul className="success__items">
              {items.map((item, index) => {
                const quantity = Number(item.quantity) || 1;
                const unitPrice = Number(item.unitPrice);
                const lineTotal = Number.isFinite(unitPrice)
                  ? unitPrice * quantity
                  : null;
                return (
                  <li
                    key={`${item.productId ?? item.name ?? "item"}-${index}`}
                    className="success__item"
                    data-testid="order-item"
                  >
                    <span className="success__item-name">
                      {item.name ?? "Item"}
                      {item.color ? (
                        <span className="success__item-color" data-testid="order-item-color">
                          {" "}— {item.color}
                        </span>
                      ) : null}
                      <span className="success__item-qty">× {quantity}</span>
                    </span>
                    {lineTotal !== null ? (
                      <span className="success__item-price">
                        {formatINR(lineTotal)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {order.paymentMethod ? (
            <p className="success__payment">
              Payment:{" "}
              <span data-testid="payment-method">
                {order.paymentMethod === "COD"
                  ? "Cash on Delivery"
                  : "Paid Online"}
              </span>
            </p>
          ) : null}

          {hasAmount ? (
            <p className="success__total">
              <span>Total</span>
              <strong data-testid="order-total">{formatINR(amount)}</strong>
            </p>
          ) : null}
        </div>

        <a className="success__home-cta" href="https://wa.me/918448617222" target="_blank" rel="noreferrer">
          Need help? WhatsApp us
        </a>
      </section>

      <footer className="success__footer">
        <nav className="success__footer-links">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="success__footer-link"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}
