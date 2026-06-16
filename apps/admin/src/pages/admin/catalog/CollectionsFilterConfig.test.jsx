// apps/admin/src/pages/admin/catalog/CollectionsFilterConfig.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import CollectionsPage from "./CollectionsPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

function mock() {
  apiMock.get.mockImplementation((url) => {
    if (url.endsWith("/filter-config")) return Promise.resolve({ config: { isDefault: true, filters: [
      { type: "attribute", attributeId: "a1", enabled: true, sortOrder: 0 }, { type: "price", attributeId: null, enabled: true, sortOrder: 1 },
    ] } });
    if (url.includes("/attributes")) return Promise.resolve({ attributes: [{ id: "a1", name: "Age", displayType: "checkbox", values: [{ id: "v1", slug: "0-12", name: "0-12" }] }] });
    if (url.includes("/collections")) return Promise.resolve({ collections: [{ id: "c1", name: "STEM Toys" }] });
    return Promise.resolve({});
  });
  apiMock.put.mockResolvedValue({ config: { isDefault: false, filters: [] } });
}

describe("CollectionsPage filter config", () => {
  it("loads the selected collection's filter config and shows the Filters panel", async () => {
    mock();
    render(<CollectionsPage />);
    await screen.findAllByText("STEM Toys");
    expect(await screen.findByRole("heading", { name: /^Filters —/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /save filters/i })).toBeInTheDocument();
  });

  it("saves the filter config via PUT", async () => {
    mock();
    render(<CollectionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /save filters/i }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith(
      "/api/admin/catalog/collections/c1/filter-config",
      expect.objectContaining({ filters: expect.any(Array) }),
      expect.any(Object)
    ));
  });
});
