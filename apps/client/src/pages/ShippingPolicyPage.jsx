import PolicyPage from "./PolicyPage.jsx";

/**
 * Shipping Policy page (Req 20.2).
 *
 * Static legal content describing how and where orders are shipped.
 * Reachable from the footer policy links present on every customer page.
 */
export default function ShippingPolicyPage() {
  return (
    <PolicyPage title="Shipping Policy">
      <p>
        We aim to get your toys to you quickly and safely. This policy explains
        where we ship, how long it takes, and how you can track your order.
      </p>

      <h2>Serviceable Areas</h2>
      <p>
        We ship across India to serviceable pincodes. At checkout we check your
        pincode for delivery availability before you place your order. If your
        pincode is not currently serviceable, we will let you know so you can
        try an alternate address.
      </p>

      <h2>Processing and Delivery Time</h2>
      <p>
        Orders are typically processed within one to two business days. Once
        dispatched, delivery usually takes three to seven business days
        depending on your location and courier availability.
      </p>

      <h2>Order Tracking</h2>
      <p>
        After your shipment is created and a courier is assigned, you will
        receive tracking updates over WhatsApp at each stage, from dispatch
        through to delivery.
      </p>

      <h2>Shipping Charges</h2>
      <p>
        Any applicable shipping charges are shown in your order summary before
        you confirm your purchase.
      </p>

      <h2>Contact Us</h2>
      <p>
        For questions about a shipment, please reach us through the contact
        options on our store.
      </p>
    </PolicyPage>
  );
}
