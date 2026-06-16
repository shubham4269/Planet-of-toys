// apps/admin/src/pages/admin/catalog/CategoriesPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import CategoriesPage from "./CategoriesPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

describe("CategoriesPage", () => {
  it("loads and renders the category tree with a live preview", async () => {
    apiMock.get.mockResolvedValue({ categories: [{ id: "1", name: "Toys", image: null, sortOrder: 0, children: [] }] });
    render(<CategoriesPage />);
    expect((await screen.findAllByText("Toys")).length).toBeGreaterThan(0); // list + preview
  });

  it("creates a category", async () => {
    apiMock.get.mockResolvedValue({ categories: [] });
    apiMock.post.mockResolvedValue({ category: { id: "9", name: "New", children: [] } });
    render(<CategoriesPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/new category name/i), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: /add category/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/categories", expect.objectContaining({ name: "New" }), expect.any(Object)));
  });
});
