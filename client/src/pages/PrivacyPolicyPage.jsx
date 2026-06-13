import PolicyPage from "./PolicyPage.jsx";

/**
 * Privacy Policy page (Req 20.2).
 *
 * Static legal content describing how customer data is collected and used.
 * Reachable from the footer policy links present on every customer page.
 */
export default function PrivacyPolicyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        Planet of Toys ("we", "us") respects your privacy. This policy explains
        what information we collect when you shop with us and how we use it.
      </p>

      <h2>Information We Collect</h2>
      <p>
        When you place an order we collect the details you provide at checkout:
        your name, phone number, email address, and delivery address. We also
        capture marketing attribution parameters from the link you arrived
        through so we can understand which campaigns reach our customers.
      </p>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To process, fulfil, and deliver your order.</li>
        <li>To send order and delivery updates over WhatsApp.</li>
        <li>To verify Cash on Delivery orders with a one-time password.</li>
        <li>To measure and improve the performance of our advertising.</li>
      </ul>

      <h2>Sharing Your Information</h2>
      <p>
        We share order details only with the partners needed to complete your
        purchase, such as our payment processor and shipping courier. We never
        sell your personal information.
      </p>

      <h2>Data Security</h2>
      <p>
        Payment and credential data is handled on secure servers and is never
        exposed to the browser. We apply industry-standard safeguards to protect
        the information you share with us.
      </p>

      <h2>Contact Us</h2>
      <p>
        For any privacy questions or requests, please reach us through the
        contact options on our store.
      </p>
    </PolicyPage>
  );
}
