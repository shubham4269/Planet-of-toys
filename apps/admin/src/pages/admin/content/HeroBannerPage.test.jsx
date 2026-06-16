// apps/admin/src/pages/admin/content/HeroBannerPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import HeroBannerPage from "./HeroBannerPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); apiMock.patch.mockReset(); });
afterEach(cleanup);

function mock(slides) {
  apiMock.get.mockImplementation((url) => {
    if (url.includes("/admin/hero")) return Promise.resolve({ slides: slides ?? [{ id: "h1", type: "campaign", displayMode: "full_banner", title: "Summer Sale", status: "published", active: true, sortOrder: 0, priority: 0 }] });
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

  it("shows media slots conditionally by displayMode", async () => {
    mock();
    render(<HeroBannerPage />);
    await screen.findByRole("heading", { name: "Hero Banner" });
    // full_banner (default): desktop + mobile image uploads, no video.
    expect(screen.getByLabelText(/upload desktop image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload mobile image/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload video/i)).toBeNull();
    // switch to video: video + poster + fallback image slots appear.
    fireEvent.change(screen.getByLabelText(/display mode/i), { target: { value: "video" } });
    expect(screen.getByLabelText(/upload video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload poster image/i)).toBeInTheDocument();
    // collection_grid: no per-slide media (grid comes from the collection).
    fireEvent.change(screen.getByLabelText(/display mode/i), { target: { value: "collection_grid" } });
    expect(screen.queryByLabelText(/upload desktop image/i)).toBeNull();
    expect(screen.getByText(/grid images come from the linked collection/i)).toBeInTheDocument();
  });

  it("previews and removes uploaded media", async () => {
    mock([{ id: "h1", type: "campaign", displayMode: "full_banner", title: "Sale", status: "published", active: true, desktopMedia: "d.webp", sortOrder: 0, priority: 0 }]);
    render(<HeroBannerPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    // The loaded desktop asset shows a Replace + Remove affordance.
    expect(await screen.findByRole("button", { name: /remove desktop image/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/replace desktop image/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove desktop image/i }));
    expect(screen.queryByRole("button", { name: /remove desktop image/i })).toBeNull();
    expect(screen.getByLabelText(/upload desktop image/i)).toBeInTheDocument();
  });
});
