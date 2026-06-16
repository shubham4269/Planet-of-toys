// apps/client/src/pages/CategoryPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CategoryPage from "./CategoryPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function renderAt(slug) {
  apiMock.get.mockImplementation((url) => {
    if (url === `/api/catalog/categories/${slug}`) return Promise.resolve({ category: { id: "c", name: "Building Blocks", heroTitle: "Build Big" } });
    if (url.includes("/filters")) return Promise.resolve({ filters: [] });
    if (url.includes("/products")) return Promise.resolve({ products: [{ id: "p", slug: "x", name: "Blocks Set", price: 10, images: [] }], total: 1, page: 1, limit: 24, pageCount: 1 });
    return Promise.resolve({});
  });
  return render(
    <MemoryRouter initialEntries={[`/category/${slug}`]}>
      <Routes><Route path="/category/:slug" element={<CategoryPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("CategoryPage", () => {
  it("renders the category hero and the shared browse grid", async () => {
    renderAt("building-blocks");
    expect(await screen.findByText("Build Big")).toBeInTheDocument();
    expect(await screen.findByText("Blocks Set")).toBeInTheDocument();
  });

  it("shows not-found on 404", async () => {
    apiMock.get.mockImplementation((url) => {
      if (url === "/api/catalog/categories/missing") return Promise.reject(Object.assign(new Error("nf"), { status: 404 }));
      return Promise.resolve({});
    });
    render(<MemoryRouter initialEntries={["/category/missing"]}><Routes><Route path="/category/:slug" element={<CategoryPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
