import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock the API client so checkout flows resolve from test fixtures rather than
// hitting the network.
vi.mock("@planet-of-toys/shared-web/apiClient", async () => {
  const actual = await vi.importActual("@planet-of-toys/shared-web/apiClient");
  return {
    ...actual,
    default: { get: vi.fn(), post: vi.fn() },
  };
});

// Mock the pixel + UTM libs to assert mount-time side effects and payloads.
vi.mock("../lib/pixel.js", () => {
  const initiateCheckout = vi.fn();
  return { initiateCheckout, default: { initiateCheckout } };
});

vi.mock("../lib/utm.js", () => {
  const getUtm = vi.fn(() => ({ utm_source: "meta" }));
  return { getUtm, default: { getUtm } };
});

import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import pixel from "../lib/pixel.js";
import { getUtm } from "../lib/utm.js";
import CheckoutPage from "./CheckoutPage.jsx";

const PRODUCT = {
  id: "p1",
  slug: "rainbow-blocks",
  name: "Rainbow Building Blocks",
  price: 1200,
  compareAtPrice: 2000,
  images: ["a.webp", "b.webp"],
  stock: 5,
};

const VALID_FORM = {
  name: "Asha Rao",
  phone: "9876543210",
  email: "asha@example.com",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

function renderCheckout(state = { slug: "rainbow-blocks", quantity: 2 }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/checkout", state }]}>
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order/success" element={<div>Order Confirmed</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/** Fill every customer field with valid data. */
function fillValidForm() {
  for (const [name, value] of Object.entries(VALID_FORM)) {
    fireEvent.change(screen.getByLabelText(labelFor(name)), {
      target: { value },
    });
  }
}

function labelFor(name) {
  return {
    name: /full name/i,
    phone: /phone number/i,
    email: /^email$/i,
    address: /full address/i,
    city: /city/i,
    state: /state/i,
    pincode: /pincode/i,
  }[name];
}

beforeEach(() => {
  sessionStorage.clear();
  apiClient.get.mockReset();
  apiClient.post.mockReset();
  pixel.initiateCheckout.mockClear();
  getUtm.mockClear();
  delete window.Razorpay;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CheckoutPage", () => {
  it("fires InitiateCheckout on entry and renders the order summary (Req 3.2, 4.1)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderCheckout();

    expect(pixel.initiateCheckout).toHaveBeenCalledTimes(1);

    expect(await screen.findByTestId("summary-name")).toHaveTextContent(
      "Rainbow Building Blocks"
    );
    // The enhanced summary renders quantity inside a +/- control.
    expect(screen.getByTestId("summary-quantity")).toHaveTextContent("2");
    // total = 1200 * 2
    expect(screen.getByTestId("summary-total")).toHaveTextContent("2,400");
  });

  it("adjusts quantity with the +/- control and recomputes the total (Req 4.1)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderCheckout({ slug: "rainbow-blocks", quantity: 2 });

    await screen.findByTestId("summary-name");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("2,400");

    // Increase: 3 * 1200 = 3,600.
    fireEvent.click(screen.getByLabelText(/increase quantity/i));
    expect(screen.getByTestId("summary-quantity")).toHaveTextContent("3");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("3,600");

    // Decrease twice back to 1; the control never drops below 1.
    fireEvent.click(screen.getByLabelText(/decrease quantity/i));
    fireEvent.click(screen.getByLabelText(/decrease quantity/i));
    expect(screen.getByTestId("summary-quantity")).toHaveTextContent("1");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("1,200");
  });

  it("renders all required customer fields and the payment selector (Req 4.2, 4.6)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderCheckout();

    await screen.findByTestId("summary-name");
    for (const name of Object.keys(VALID_FORM)) {
      expect(screen.getByLabelText(labelFor(name))).toBeInTheDocument();
    }
    expect(screen.getByTestId("payment-online")).toBeInTheDocument();
    expect(screen.getByTestId("payment-cod")).toBeInTheDocument();
  });

  it("shows per-field validation messages and blocks submission (Req 4.5)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderCheckout();

    await screen.findByTestId("place-order");
    fireEvent.click(screen.getByTestId("place-order"));

    expect(await screen.findByTestId("error-name")).toBeInTheDocument();
    expect(screen.getByTestId("error-phone")).toBeInTheDocument();
    expect(screen.getByTestId("error-email")).toBeInTheDocument();
    expect(screen.getByTestId("error-pincode")).toBeInTheDocument();
    // No order or serviceability call attempted while the form is invalid.
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("validates phone, email, and pincode formats (Req 4.5)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderCheckout();

    await screen.findByLabelText(labelFor("phone"));
    fireEvent.change(screen.getByLabelText(labelFor("phone")), {
      target: { value: "123" },
    });
    fireEvent.blur(screen.getByLabelText(labelFor("phone")));
    expect(await screen.findByTestId("error-phone")).toHaveTextContent(
      /valid 10-digit/i
    );

    fireEvent.change(screen.getByLabelText(labelFor("email")), {
      target: { value: "not-an-email" },
    });
    fireEvent.blur(screen.getByLabelText(labelFor("email")));
    expect(await screen.findByTestId("error-email")).toHaveTextContent(
      /valid email/i
    );

    fireEvent.change(screen.getByLabelText(labelFor("pincode")), {
      target: { value: "12" },
    });
    fireEvent.blur(screen.getByLabelText(labelFor("pincode")));
    expect(await screen.findByTestId("error-pincode")).toHaveTextContent(
      /valid 6-digit/i
    );
  });

  it("checks serviceability on pincode blur and confirms availability (Req 4.4)", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: true });
      }
      return Promise.resolve({ product: PRODUCT });
    });
    renderCheckout();

    const pincode = await screen.findByLabelText(labelFor("pincode"));
    fireEvent.change(pincode, { target: { value: "560001" } });
    fireEvent.blur(pincode);

    expect(await screen.findByTestId("serviceability-ok")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringContaining("serviceability?pincode=560001")
    );
  });

  it("blocks submission for a non-serviceable pincode (Req 4.4)", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: false });
      }
      return Promise.resolve({ product: PRODUCT });
    });
    renderCheckout();

    await screen.findByTestId("place-order");
    fillValidForm();
    fireEvent.blur(screen.getByLabelText(labelFor("pincode")));

    expect(
      await screen.findByTestId("serviceability-blocked")
    ).toBeInTheDocument();
    // Submit must not create an order or a payment for a non-serviceable pincode.
    fireEvent.click(screen.getByTestId("place-order"));
    await waitFor(() => {
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });

  it("runs the Razorpay checkout-and-verify flow for Online payment (Req 5.1)", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: true });
      }
      return Promise.resolve({ product: PRODUCT });
    });
    apiClient.post.mockImplementation((path) => {
      if (path.includes("razorpay-order")) {
        return Promise.resolve({
          razorpayOrderId: "order_rzp_1",
          amount: 240000,
          currency: "INR",
          keyId: "rzp_test_key",
        });
      }
      if (path.includes("/api/orders")) {
        return Promise.resolve({ order: { orderId: "POT-240101-0001" } });
      }
      return Promise.resolve({});
    });

    // Capture the Razorpay options and immediately invoke the success handler.
    const openSpy = vi.fn();
    let capturedOptions;
    window.Razorpay = vi.fn(function Razorpay(options) {
      capturedOptions = options;
      this.on = vi.fn();
      this.open = () => {
        openSpy();
        options.handler({
          razorpay_order_id: "order_rzp_1",
          razorpay_payment_id: "pay_1",
          razorpay_signature: "sig_1",
        });
      };
    });

    renderCheckout();
    await screen.findByTestId("place-order");
    fillValidForm();
    fireEvent.click(screen.getByTestId("place-order"));

    expect(await screen.findByText("Order Confirmed")).toBeInTheDocument();
    expect(openSpy).toHaveBeenCalled();
    expect(capturedOptions.order_id).toBe("order_rzp_1");

    // The order-creation call posts the Razorpay signature for verification.
    const orderCall = apiClient.post.mock.calls.find((c) =>
      c[0].includes("/api/orders")
    );
    expect(orderCall[1]).toMatchObject({
      paymentMethod: "ONLINE",
      razorpay: { orderId: "order_rzp_1", paymentId: "pay_1", signature: "sig_1" },
      utm: { utm_source: "meta" },
    });
  });

  it("shows a failure message and re-enables retry when a Razorpay payment fails", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: true });
      }
      return Promise.resolve({ product: PRODUCT });
    });
    apiClient.post.mockImplementation((path) => {
      if (path.includes("razorpay-order")) {
        return Promise.resolve({
          razorpayOrderId: "order_rzp_1",
          amount: 240000,
          currency: "INR",
          keyId: "rzp_test_key",
        });
      }
      return Promise.resolve({});
    });

    // Razorpay stub whose open() immediately fires the payment.failed event.
    window.Razorpay = vi.fn(function Razorpay() {
      const handlers = {};
      this.on = (event, cb) => {
        handlers[event] = cb;
      };
      this.open = () => {
        handlers["payment.failed"]?.({ error: { description: "declined" } });
      };
    });

    renderCheckout();
    await screen.findByTestId("summary-name");
    fillValidForm();
    fireEvent.click(screen.getByTestId("place-order"));

    expect(await screen.findByTestId("submit-error")).toHaveTextContent(
      /payment failed/i
    );
    // The customer can retry: the Pay button is enabled again.
    expect(screen.getByTestId("place-order")).not.toBeDisabled();
    // No order was created for the failed payment attempt.
    const orderCall = apiClient.post.mock.calls.find((c) =>
      c[0].includes("/api/orders")
    );
    expect(orderCall).toBeUndefined();
  });

  it("keeps phone and pincode digits-only with capped length", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderCheckout();

    const phone = await screen.findByLabelText(labelFor("phone"));
    fireEvent.change(phone, { target: { value: "98a76-54321 0999" } });
    expect(phone).toHaveValue("9876543210");

    const pincode = screen.getByLabelText(labelFor("pincode"));
    fireEvent.change(pincode, { target: { value: "56-00-019999" } });
    expect(pincode).toHaveValue("560001");
  });

  it("runs the COD OTP request and verification flow (Req 6.1, 6.2)", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: true });
      }
      return Promise.resolve({ product: PRODUCT });
    });
    apiClient.post.mockImplementation((path) => {
      if (path.includes("/api/otp/request")) return Promise.resolve({ ok: true });
      if (path.includes("/api/orders")) {
        return Promise.resolve({ order: { orderId: "POT-240101-0002" } });
      }
      return Promise.resolve({});
    });

    renderCheckout();
    await screen.findByTestId("place-order");
    fillValidForm();
    fireEvent.click(screen.getByTestId("payment-cod"));
    fireEvent.click(screen.getByTestId("place-order"));

    // OTP entry stage appears after the request succeeds.
    const otpInput = await screen.findByTestId("otp-input");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/otp/request",
      { phone: "9876543210" }
    );

    fireEvent.change(otpInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-otp"));

    expect(await screen.findByText("Order Confirmed")).toBeInTheDocument();
    const orderCall = apiClient.post.mock.calls.find((c) =>
      c[0].includes("/api/orders")
    );
    expect(orderCall[1]).toMatchObject({
      paymentMethod: "COD",
      otp: { phone: "9876543210", code: "123456" },
    });
  });

  it("renders color options, defaults to the first in-stock color, and swaps images", async () => {
    const VARIANT_PRODUCT = {
      ...PRODUCT,
      variants: [
        { color: "Red", stock: 5, images: ["red-1.webp"] },
        { color: "Blue", stock: 2, images: ["blue-1.webp"] },
        { color: "Green", stock: 0, images: [] },
      ],
    };
    apiClient.get.mockResolvedValue({ product: VARIANT_PRODUCT });
    renderCheckout();

    await screen.findByTestId("summary-name");
    // First in-stock color is preselected and drives the product image.
    expect(screen.getByTestId("selected-color")).toHaveTextContent("Red");
    expect(screen.getByAltText(PRODUCT.name).src).toContain("red-1.webp");

    // Out-of-stock colors cannot be selected.
    expect(screen.getByTestId("color-Green")).toBeDisabled();

    // Choosing another color swaps the displayed images.
    fireEvent.click(screen.getByTestId("color-Blue"));
    expect(screen.getByTestId("selected-color")).toHaveTextContent("Blue");
    expect(screen.getByAltText(PRODUCT.name).src).toContain("blue-1.webp");
  });

  it("submits the selected color with the order (COD flow)", async () => {
    const VARIANT_PRODUCT = {
      ...PRODUCT,
      variants: [
        { color: "Red", stock: 5, images: ["red-1.webp"] },
        { color: "Blue", stock: 2, images: ["blue-1.webp"] },
      ],
    };
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: true });
      }
      return Promise.resolve({ product: VARIANT_PRODUCT });
    });
    apiClient.post.mockImplementation((path) => {
      if (path.includes("/api/otp/request")) return Promise.resolve({ ok: true });
      if (path.includes("/api/orders")) {
        return Promise.resolve({ order: { orderId: "POT-240101-0003" } });
      }
      return Promise.resolve({});
    });

    renderCheckout();
    await screen.findByTestId("place-order");
    fireEvent.click(screen.getByTestId("color-Blue"));
    fillValidForm();
    fireEvent.click(screen.getByTestId("payment-cod"));
    fireEvent.click(screen.getByTestId("place-order"));

    const otpInput = await screen.findByTestId("otp-input");
    fireEvent.change(otpInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-otp"));

    expect(await screen.findByText("Order Confirmed")).toBeInTheDocument();
    const orderCall = apiClient.post.mock.calls.find((c) =>
      c[0].includes("/api/orders")
    );
    expect(orderCall[1]).toMatchObject({ color: "Blue" });
  });

  it("shows a verification-failed message on OTP mismatch (Req 6.3)", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.includes("serviceability")) {
        return Promise.resolve({ serviceable: true });
      }
      return Promise.resolve({ product: PRODUCT });
    });
    apiClient.post.mockImplementation((path) => {
      if (path.includes("/api/otp/request")) return Promise.resolve({ ok: true });
      if (path.includes("/api/orders")) {
        return Promise.reject(
          new ApiError("Verification failed.", { status: 400, data: null })
        );
      }
      return Promise.resolve({});
    });

    renderCheckout();
    await screen.findByTestId("place-order");
    fillValidForm();
    fireEvent.click(screen.getByTestId("payment-cod"));
    fireEvent.click(screen.getByTestId("place-order"));

    const otpInput = await screen.findByTestId("otp-input");
    fireEvent.change(otpInput, { target: { value: "000000" } });
    fireEvent.click(screen.getByTestId("verify-otp"));

    expect(await screen.findByTestId("otp-error")).toHaveTextContent(
      /incorrect or has expired/i
    );
  });

  it("renders an empty-cart notice when entered without a product (Req 4.1)", () => {
    renderCheckout(null);
    expect(
      screen.getByRole("heading", { name: /checkout/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument();
  });
});
