// apps/admin/src/pages/admin/catalog/CollectionsPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import CollectionsPage from "./CollectionsPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

describe("CollectionsPage", () => {
  it("loads and previews the selected collection", async () => {
    apiMock.get.mockResolvedValue({ collections: [{ id: "1", name: "STEM Toys", heroTitle: "Learn", featuredOnHome: false, showInNavigation: false }] });
    render(<CollectionsPage />);
    expect((await screen.findAllByText(/STEM Toys|Learn/)).length).toBeGreaterThan(0);
  });

  it("creates a collection", async () => {
    apiMock.get.mockResolvedValue({ collections: [] });
    apiMock.post.mockResolvedValue({ collection: { id: "9", name: "Sale" } });
    render(<CollectionsPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/new collection name/i), { target: { value: "Sale" } });
    fireEvent.click(screen.getByRole("button", { name: /add collection/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/collections", expect.objectContaining({ name: "Sale" }), expect.any(Object)));
  });
});
