import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock the API client so the landing page resolves products from test fixtures
// instead of hitting the network.
vi.mock("@planet-of-toys/shared-web/apiClient", async () => {
  const actual = await vi.importActual("@planet-of-toys/shared-web/apiClient");
  return {
    ...actual,
    default: { get: vi.fn() },
  };
});

// Mock the pixel + UTM libs so we can assert mount-time side effects.
vi.mock("../lib/pixel.js", () => {
  const pageView = vi.fn();
  const viewContent = vi.fn();
  const initiateCheckout = vi.fn();
  const purchase = vi.fn();
  return {
    pageView,
    viewContent,
    initiateCheckout,
    purchase,
    default: { pageView, viewContent, initiateCheckout, purchase },
  };
});

vi.mock("../lib/utm.js", () => {
  const captureUtm = vi.fn(() => ({}));
  return { captureUtm, default: { captureUtm } };
});

import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import pixel from "../lib/pixel.js";
import { captureUtm } from "../lib/utm.js";
import LandingPage from "./LandingPage.jsx";

const PRODUCT = {
  id: "p1",
  slug: "rainbow-blocks",
  name: "Rainbow Building Blocks",
  price: 1200,
  compareAtPrice: 2000,
  discountPercent: 40,
  description: "A colorful 120-piece building set.",
  features: ["120 durable pieces", "Storage bag included"],
  specifications: [
    { key: "Age Group", value: "3+" },
    { key: "Material", value: "BPA-free ABS" },
  ],
  faqs: [
    { question: "Is it safe?", answer: "Yes, non-toxic materials." },
    { question: "Washable?", answer: "Yes, wipe clean." },
  ],
  images: ["a.webp", "b.webp"],
  video: "demo.mp4",
  trustBadges: ["Secure Payments", "Fast Shipping"],
  stock: 5,
};

function renderLanding(slug = "rainbow-blocks") {
  return render(
    <MemoryRouter initialEntries={[`/p/${slug}`]}>
      <Routes>
        <Route path="/p/:slug" element={<LandingPage />} />
        <Route path="/checkout" element={<div>Checkout Page</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  apiClient.get.mockReset();
  pixel.pageView.mockClear();
  pixel.viewContent.mockClear();
  captureUtm.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LandingPage", () => {
  it("fires PageView + ViewContent and captures UTM on mount (Req 2.1, 3.1)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });

    renderLanding();

    expect(pixel.pageView).toHaveBeenCalledTimes(1);
    expect(pixel.viewContent).toHaveBeenCalledTimes(1);
    expect(captureUtm).toHaveBeenCalledTimes(1);

    // Flush the async product fetch so state settles before teardown.
    await screen.findByRole("heading", { name: /rainbow building blocks/i });
  });

  it("renders core product info: name, price, compare-at, discount (Req 1.1)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderLanding();

    expect(
      await screen.findByRole("heading", { name: /rainbow building blocks/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("price")).toHaveTextContent("1,200");
    expect(screen.getByTestId("compare-price")).toHaveTextContent("2,000");
    expect(screen.getByTestId("discount")).toHaveTextContent("40% OFF");
  });

  it("renders gallery, video, specifications, features, FAQ, trust badges (Req 1.1, 1.2, 1.3)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderLanding();

    expect(await screen.findByTestId("image-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("product-video")).toBeInTheDocument();

    // Specifications, features, and FAQ live inside collapsed accordion
    // panels; open each panel before asserting its content.
    fireEvent.click(screen.getByRole("button", { name: /specifications/i }));
    expect(screen.getByText("Age Group")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /product features/i }));
    expect(screen.getByText(/120 durable pieces/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /frequently asked questions/i })
    );
    expect(screen.getByText(/is it safe\?/i)).toBeInTheDocument();

    expect(screen.getAllByTestId("trust-badge").length).toBeGreaterThan(0);
    // Sticky buy-now CTA present.
    expect(screen.getByTestId("sticky-cta")).toBeInTheDocument();
  });

  it("updates the displayed total reactively when quantity changes (Req 1.4)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderLanding();

    // The reactive total is displayed in the sticky CTA bar.
    await screen.findByTestId("sticky-cta");
    expect(screen.getByTestId("sticky-cta")).toHaveTextContent("1,200");

    fireEvent.click(
      screen.getAllByRole("button", { name: /increase quantity/i })[0]
    );

    expect(screen.getByTestId("quantity")).toHaveTextContent("2");
    expect(screen.getByTestId("sticky-cta")).toHaveTextContent("2,400");
  });

  it("toggles the FAQ panel open to reveal questions and answers (Req 1.2)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderLanding();

    const faqToggle = await screen.findByRole("button", {
      name: /frequently asked questions/i,
    });
    expect(faqToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(faqToggle);
    expect(faqToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/is it safe\?/i)).toBeInTheDocument();
    expect(screen.getByText(/non-toxic materials/i)).toBeInTheDocument();

    fireEvent.click(faqToggle);
    expect(faqToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/non-toxic materials/i)).not.toBeInTheDocument();
  });

  it("navigates to checkout on Buy Now with quantity (Req 1.3)", async () => {
    apiClient.get.mockResolvedValue({ product: PRODUCT });
    renderLanding();

    await screen.findByTestId("buy-now");
    fireEvent.click(screen.getByTestId("buy-now"));
    expect(screen.getByText("Checkout Page")).toBeInTheDocument();
  });

  it("shows out-of-stock indicator and disables buy-now when stock is zero (Req 1.5)", async () => {
    apiClient.get.mockResolvedValue({
      product: { ...PRODUCT, stock: 0 },
    });
    renderLanding();

    expect(await screen.findByTestId("out-of-stock")).toBeInTheDocument();
    expect(screen.getByTestId("buy-now")).toBeDisabled();
    expect(screen.getByTestId("sticky-buy-now")).toBeDisabled();
  });

  it("renders the not-found view when the slug does not resolve (Req 1.6)", async () => {
    apiClient.get.mockRejectedValue(
      new ApiError("Product not found.", { status: 404, data: null })
    );
    renderLanding("missing-slug");

    expect(
      await screen.findByRole("heading", { name: /product not found/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("buy-now")).not.toBeInTheDocument();
  });
});
