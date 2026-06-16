// apps/admin/src/pages/admin/content/NavigationPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import NavigationPage from "./NavigationPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

function mock() {
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/navigation")) return Promise.resolve({ items: [{ id: "n1", label: "Sale", targetType: "internalRoute", url: "/sale", parentId: null, isMegaMenu: false, featured: false, menuKey: "header", sortOrder: 0 }] });
    if (url.includes("/categories")) return Promise.resolve({ categories: [{ id: "c1", name: "Edu", children: [] }] });
    if (url.includes("/collections")) return Promise.resolve({ collections: [{ id: "k1", name: "Sale Collection" }] });
    return Promise.resolve({});
  });
}

describe("NavigationPage", () => {
  it("loads navigation items", async () => {
    mock();
    render(<NavigationPage />);
    expect((await screen.findAllByText("Sale")).length).toBeGreaterThan(0);
  });

  it("creates a navigation item", async () => {
    mock();
    apiMock.post.mockResolvedValue({ item: { id: "n2", label: "New Arrivals" } });
    render(<NavigationPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/item label/i), { target: { value: "New Arrivals" } });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/navigation", expect.objectContaining({ label: "New Arrivals" }), expect.any(Object)));
  });
});
