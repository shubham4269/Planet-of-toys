import PolicyPage from "./PolicyPage.jsx";

/**
 * Refund Policy page (Req 20.2).
 *
 * Static legal content describing returns, cancellations, and refunds.
 * Reachable from the footer policy links present on every customer page.
 */
export default function RefundPolicyPage() {
  return (
    <PolicyPage title="Refund Policy">
      <p>
        We want you to love your purchase. If something isn't right, this policy
        explains how returns, cancellations, and refunds work.
      </p>

      <h2>Cancellations</h2>
      <p>
        You can request to cancel an order before it is dispatched. Once an
        order has shipped it can no longer be cancelled, but it may be eligible
        for a return as described below.
      </p>

      <h2>Returns</h2>
      <p>
        Returns and replacements are available within 7 days of delivery only
        for:
      </p>
      <ul>
        <li>Damaged products</li>
        <li>Manufacturing defects</li>
        <li>Missing parts or accessories</li>
        <li>Incorrect products delivered</li>
      </ul>
      <p>Returns are not accepted for:</p>
      <ul>
        <li>Change of mind after purchase</li>
        <li>Child did not like the product</li>
        <li>Damage caused due to misuse or improper handling</li>
        <li>Products returned without original packaging and proof of purchase</li>
      </ul>

      <h2>Refunds</h2>
      <ul>
        <li>
          Approved refunds for online payments are returned to the original
          payment method.
        </li>
        <li>
          For Cash on Delivery orders, refunds are processed to a bank account
          or UPI ID you provide.
        </li>
        <li>
          Refunds are typically completed within five to seven business days
          after we receive and inspect the returned item.
        </li>
      </ul>

      <h2>Damaged or Incorrect Items</h2>
      <p>
        If you receive a damaged or incorrect item, please contact us promptly
        with your order ID and a photo so we can arrange a replacement or
        refund.
      </p>

      <h2>Contact Us</h2>
      <p>
        For any return or refund request, please reach us through the contact
        options on our store.
      </p>
    </PolicyPage>
  );
}
