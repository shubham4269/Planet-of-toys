import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock the API client so the page exercises the admin endpoints against
// in-test fakes rather than the network. ApiError / API_BASE_URL stay real.
vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual("../../lib/apiClient.js");
  return {
    ...actual,
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Mock the admin session helpers so a token is always present and the
// unauthorized signal is observable.
vi.mock("../../lib/adminAuth.js", () => ({
  getToken: vi.fn(() => "test-token"),
  notifyUnauthorized: vi.fn(),
}));

import apiClient, { ApiError } from "../../lib/apiClient.js";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import ProductsPage from "./ProductsPage.jsx";

const PRODUCT = {
  id: "p1",
  slug: "rainbow-blocks",
  name: "Rainbow Building Blocks",
  price: 1200,
  compareAtPrice: 2000,
  description: "A colorful set.",
  features: ["120 pieces"],
  specifications: [{ key: "Age", value: "3+" }],
  faqs: [{ question: "Washable?", answer: "Yes." }],
  images: ["a.webp"],
  video: null,
  stock: 5,
  active: true,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsPage />
    </MemoryRouter>
  );
}

describe("Admin ProductsPage (Req 16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ products: [PRODUCT] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the catalog from GET /api/admin/products", async () => {
    renderPage();
    expect(
      await screen.findByText("Rainbow Building Blocks")
    ).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/admin/products",
      expect.objectContaining({ token: "test-token" })
    );
  });

  it("creates a product via POST with derived field payload (Req 16.1)", async () => {
    apiClient.post.mockResolvedValue({ product: { ...PRODUCT, id: "p2" } });
    renderPage();
    await screen.findByText("Rainbow Building Blocks");

    fireEvent.click(screen.getByRole("button", { name: /new product/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "New Toy" },
    });
    fireEvent.change(screen.getByLabelText(/^price \(₹\)/i), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create product/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [path, payload, options] = apiClient.post.mock.calls[0];
    expect(path).toBe("/api/admin/products");
    expect(payload).toMatchObject({ name: "New Toy", price: 999 });
    expect(options).toMatchObject({ token: "test-token" });
  });

  it("updates an existing product via PUT (Req 16.1)", async () => {
    apiClient.put.mockResolvedValue({ product: PRODUCT });
    renderPage();
    await screen.findByText("Rainbow Building Blocks");

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    const [path, payload] = apiClient.put.mock.calls[0];
    expect(path).toBe("/api/admin/products/p1");
    expect(payload).toMatchObject({ name: "Renamed" });
  });

  it("toggles active state via PATCH /state (Req 16.4)", async () => {
    apiClient.patch.mockResolvedValue({
      product: { ...PRODUCT, active: false },
    });
    renderPage();
    await screen.findByText("Rainbow Building Blocks");

    fireEvent.click(screen.getByRole("button", { name: /^active$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/api/admin/products/p1/state",
      { active: false },
      expect.objectContaining({ token: "test-token" })
    );
  });

  it("toggles stock state via PATCH /state (Req 16.4)", async () => {
    apiClient.patch.mockResolvedValue({ product: { ...PRODUCT, stock: 0 } });
    renderPage();
    await screen.findByText("Rainbow Building Blocks");

    fireEvent.click(screen.getByRole("button", { name: /in stock/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/api/admin/products/p1/state",
      { stock: 0 },
      expect.objectContaining({ token: "test-token" })
    );
  });

  it("deletes a product via DELETE after confirmation (Req 16.5)", async () => {
    apiClient.delete.mockResolvedValue(null);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    renderPage();
    await screen.findByText("Rainbow Building Blocks");

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalled());
    expect(apiClient.delete).toHaveBeenCalledWith(
      "/api/admin/products/p1",
      expect.objectContaining({ token: "test-token" })
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Rainbow Building Blocks")
      ).not.toBeInTheDocument()
    );
  });

  it("uploads an image to POST /api/admin/media and associates it (Req 16.3)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ media: { filename: "uploaded.webp" } }),
    });
    renderPage();
    await screen.findByText("Rainbow Building Blocks");

    fireEvent.click(screen.getByRole("button", { name: /new product/i }));

    const file = new File(["x"], "toy.png", { type: "image/png" });
    const imageInput = document.querySelector('input[type="file"][accept="image/*"]');
    fireEvent.change(imageInput, { target: { files: [file] } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/admin\/media$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
    // The stored reference becomes a product image thumbnail.
    await waitFor(() =>
      expect(
        screen.getByAltText(/product image 1/i).getAttribute("src")
      ).toMatch(/uploaded\.webp/)
    );
  });

  it("signals unauthorized on a 401 response (Req 21.3)", async () => {
    apiClient.get.mockRejectedValue(
      new ApiError("Unauthorized", { status: 401 })
    );
    renderPage();
    await waitFor(() => expect(notifyUnauthorized).toHaveBeenCalled());
    expect(getToken).toHaveBeenCalled();
  });
});
