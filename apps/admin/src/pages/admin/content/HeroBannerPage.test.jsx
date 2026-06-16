// apps/admin/src/pages/admin/content/HeroBannerPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import HeroBannerPage from "./HeroBannerPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); apiMock.patch.mockReset(); });
afterEach(cleanup);

function mock() {
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/admin/hero")) return Promise.resolve({ slides: [{ id: "h1", type: "campaign", displayMode: "full_banner", title: "Summer Sale", status: "published", active: true, sortOrder: 0, priority: 0 }] });
    if (url.includes("/categories")) return Promise.resolve({ categories: [] });
    if (url.includes("/collections")) return Promise.resolve({ collections: [] });
    return Promise.resolve({});
  });
}

describe("HeroBannerPage", () => {
  it("loads hero slides", async () => {
    mock();
    render(<HeroBannerPage />);
    expect((await screen.findAllByText(/Summer Sale/)).length).toBeGreaterThan(0);
  });

  it("creates a slide", async () => {
    mock();
    apiMock.post.mockResolvedValue({ slide: { id: "h2", title: "New Campaign" } });
    render(<HeroBannerPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/slide title/i), { target: { value: "New Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /add slide/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/hero", expect.objectContaining({ title: "New Campaign", type: expect.any(String), displayMode: expect.any(String) }), expect.any(Object)));
  });
});
