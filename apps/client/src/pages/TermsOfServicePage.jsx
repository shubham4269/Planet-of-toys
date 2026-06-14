import PolicyPage from "./PolicyPage.jsx";

/**
 * Terms of Service page (Req 20.2).
 *
 * Static legal content describing the terms governing use of the store.
 * Reachable from the footer policy links present on every customer page.
 */
export default function TermsOfServicePage() {
  return (
    <PolicyPage title="Terms of Service">
      <p>
        These terms govern your use of the Planet of Toys store and your
        purchases. By placing an order you agree to the terms set out below.
      </p>

      <h2>Orders</h2>
      <p>
        All orders are subject to product availability and acceptance. Prices
        and offers shown on the product page apply at the time you place your
        order. We reserve the right to cancel an order if a product is
        unavailable or if a pricing error occurs.
      </p>

      <h2>Pricing and Payment</h2>
      <p>
        Prices are listed in Indian Rupees and include applicable taxes unless
        stated otherwise. We accept online payment and Cash on Delivery. Cash on
        Delivery orders require verification through a one-time password sent to
        your phone.
      </p>

      <h2>Delivery</h2>
      <p>
        We deliver to serviceable pincodes across India. Delivery timelines are
        estimates and may vary with location and courier availability. See our
        Shipping Policy for details.
      </p>

      <h2>Returns and Refunds</h2>
      <p>
        Eligibility for returns and refunds is described in our Refund Policy,
        which forms part of these terms.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        Products are intended for the age groups indicated on each listing.
        Please supervise children during play. To the extent permitted by law,
        our liability is limited to the value of the order in question.
      </p>

      <h2>Contact Us</h2>
      <p>
        For questions about these terms, please reach us through the contact
        options on our store.
      </p>
    </PolicyPage>
  );
}
