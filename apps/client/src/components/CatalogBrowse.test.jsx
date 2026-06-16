// apps/client/src/components/CatalogBrowse.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CatalogBrowse from "./CatalogBrowse.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/filters")) return Promise.resolve({ filters: [{ key: "price", type: "price", min: 0, max: 900 }] });
    if (url.includes("/products")) return Promise.resolve({ products: [{ id: "p", slug: "b", name: "Blocks", price: 99, images: [] }], total: 1, page: 1, limit: 24, pageCount: 1 });
    return Promise.resolve({});
  });
});
afterEach(cleanup);

describe("CatalogBrowse", () => {
  it("fetches filters + products for the endpoint and renders the grid", async () => {
    render(<MemoryRouter><CatalogBrowse endpoint="/api/catalog/collections/stem" /></MemoryRouter>);
    expect(await screen.findByText("Blocks")).toBeInTheDocument();
    expect(apiMock.get.mock.calls.some(([u]) => u === "/api/catalog/collections/stem/filters")).toBe(true);
  });

  it("refetches with sort when sort changes", async () => {
    render(<MemoryRouter><CatalogBrowse endpoint="/api/catalog/categories/blocks" /></MemoryRouter>);
    await screen.findByText("Blocks");
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "price-asc" } });
    await waitFor(() => expect(apiMock.get.mock.calls.some(([u]) => u.includes("/products") && u.includes("sort=price-asc"))).toBe(true));
  });
});
