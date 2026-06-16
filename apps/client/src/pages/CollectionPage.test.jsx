// apps/client/src/pages/CollectionPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CollectionPage from "./CollectionPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function route(qs = "") {
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/catalog/collections/stem") return Promise.resolve({ collection: { id: "c", name: "STEM Toys", heroTitle: "Learn by Play" } });
    if (url.startsWith("/api/catalog/collections/stem/filters")) return Promise.resolve({ filters: [
      { key: "f_age", type: "attribute", attributeSlug: "age", name: "Age", displayType: "checkbox", values: [{ slug: "0-12", name: "0-12 Months" }] },
      { key: "price", type: "price", min: 100, max: 900 },
    ] });
    if (url.startsWith("/api/catalog/collections/stem/products")) return Promise.resolve({ products: [{ id: "p", slug: "blocks", name: "Blocks", price: 499, images: [] }], total: 1, page: 1, limit: 24, pageCount: 1 });
    return Promise.resolve({});
  });
  return render(
    <MemoryRouter initialEntries={[`/collections/stem${qs}`]}>
      <Routes><Route path="/collections/:slug" element={<CollectionPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("CollectionPage (browse)", () => {
  it("renders hero, filters, and the product grid", async () => {
    route();
    expect(await screen.findByText("Learn by Play")).toBeInTheDocument();
    expect(await screen.findByText("Age")).toBeInTheDocument();
    expect(await screen.findByText("Blocks")).toBeInTheDocument();
  });

  it("refetches products with the sort param when sort changes", async () => {
    route();
    await screen.findByText("Blocks");
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "price-asc" } });
    await waitFor(() =>
      expect(apiMock.get.mock.calls.some(([u]) => u.includes("/products") && u.includes("sort=price-asc"))).toBe(true)
    );
  });

  it("shows a not-found message when the collection 404s", async () => {
    apiMock.get.mockImplementation((url) => {
      if (url === "/api/catalog/collections/missing") return Promise.reject(Object.assign(new Error("nf"), { status: 404 }));
      return Promise.resolve({});
    });
    render(
      <MemoryRouter initialEntries={["/collections/missing"]}>
        <Routes><Route path="/collections/:slug" element={<CollectionPage />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
