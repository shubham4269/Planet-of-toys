import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock the pixel lib so we can assert the mount-time Purchase side effect.
vi.mock("../lib/pixel.js", () => {
  const purchase = vi.fn();
  return { purchase, default: { purchase } };
});

import pixel from "../lib/pixel.js";
import OrderSuccessPage from "./OrderSuccessPage.jsx";

const ORDER = {
  orderId: "POT-240517-0042",
  amount: 2400,
  paymentMethod: "COD",
  items: [
    { productId: "p1", name: "Rainbow Building Blocks", quantity: 2, unitPrice: 1200 },
  ],
};

/**
 * Render the success page at /order/success, optionally seeding router
 * location state (mirrors how the checkout flow navigates here).
 */
function renderSuccess(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/order/success", state }]}>
      <Routes>
        <Route path="/order/success" element={<OrderSuccessPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  pixel.purchase.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OrderSuccessPage", () => {
  it("renders the order identifier and summary (Req 20.1)", () => {
    renderSuccess({ order: ORDER });

    expect(screen.getByTestId("order-id")).toHaveTextContent("POT-240517-0042");
    expect(screen.getByTestId("order-summary")).toBeInTheDocument();
    expect(screen.getByTestId("order-item")).toHaveTextContent(
      /rainbow building blocks/i
    );
    expect(screen.getByTestId("order-total")).toHaveTextContent("2,400");
    expect(screen.getByTestId("payment-method")).toHaveTextContent(
      /cash on delivery/i
    );
  });

  it("fires the Purchase event with the order value on mount (Req 3.3)", () => {
    renderSuccess({ order: ORDER });

    expect(pixel.purchase).toHaveBeenCalledTimes(1);
    expect(pixel.purchase).toHaveBeenCalledWith(2400);
  });

  it("accepts the order object directly as location state", () => {
    renderSuccess(ORDER);

    expect(screen.getByTestId("order-id")).toHaveTextContent("POT-240517-0042");
    expect(pixel.purchase).toHaveBeenCalledWith(2400);
  });

  it("exposes footer policy links on the success page (Req 20.2)", () => {
    renderSuccess({ order: ORDER });

    expect(
      screen.getByRole("link", { name: /privacy policy/i })
    ).toHaveAttribute("href", "/privacy-policy");
    expect(
      screen.getByRole("link", { name: /refund policy/i })
    ).toHaveAttribute("href", "/refund-policy");
    expect(
      screen.getByRole("link", { name: /shipping policy/i })
    ).toHaveAttribute("href", "/shipping-policy");
    expect(
      screen.getByRole("link", { name: /terms & conditions/i })
    ).toHaveAttribute("href", "/terms-of-service");
  });

  it("shows a fallback and does not fire Purchase when reached without order state", () => {
    renderSuccess(undefined);

    expect(
      screen.getByRole("heading", { name: /order confirmed/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("order-id")).not.toBeInTheDocument();
    expect(pixel.purchase).not.toHaveBeenCalled();
  });
});
