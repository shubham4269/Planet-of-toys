// apps/client/src/pages/CollectionPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CollectionPage from "./CollectionPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function renderAt(slug) {
  return render(
    <MemoryRouter initialEntries={[`/collections/${slug}`]}>
      <Routes><Route path="/collections/:slug" element={<CollectionPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("CollectionPage", () => {
  it("fetches and renders the collection with products", async () => {
    apiMock.get.mockResolvedValue({
      collection: { id: "c", name: "STEM Toys", heroTitle: "Learn by Play" },
      products: [{ id: "p", slug: "blocks", name: "Blocks", price: 499, images: [] }],
    });
    renderAt("stem-toys");
    expect(await screen.findByText("Learn by Play")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/api/catalog/collections/stem-toys");
  });

  it("shows a not-found message on 404", async () => {
    const err = Object.assign(new Error("nf"), { status: 404 });
    apiMock.get.mockRejectedValue(err);
    renderAt("missing");
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
