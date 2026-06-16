// apps/admin/src/pages/admin/catalog/AttributesPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import AttributesPage from "./AttributesPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.put.mockReset(); });
afterEach(cleanup);

const ATTR = { id: "a", name: "Age Group", displayType: "checkbox", values: [{ id: "v1", name: "0-12 Months" }] };

describe("AttributesPage", () => {
  it("loads attributes and previews the selected one as its control", async () => {
    apiMock.get.mockResolvedValue({ attributes: [ATTR] });
    render(<AttributesPage />);
    await screen.findAllByText("Age Group");
    // DevicePreview renders the View twice (desktop + mobile frames).
    expect(screen.getAllByLabelText("0-12 Months").length).toBeGreaterThan(0); // preview checkbox
  });

  it("adds a value to the selected attribute", async () => {
    apiMock.get.mockResolvedValue({ attributes: [ATTR] });
    apiMock.post.mockResolvedValue({ value: { id: "v2", name: "1-2 Years" } });
    render(<AttributesPage />);
    await screen.findAllByText("Age Group");
    fireEvent.change(screen.getByLabelText(/new value name/i), { target: { value: "1-2 Years" } });
    fireEvent.click(screen.getByRole("button", { name: /add value/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/attributes/a/values", expect.objectContaining({ name: "1-2 Years" }), expect.any(Object)));
  });

  it("creates an attribute with a chosen displayType", async () => {
    apiMock.get.mockResolvedValue({ attributes: [] });
    apiMock.post.mockResolvedValue({ attribute: { id: "n", name: "Theme", displayType: "checkbox", values: [] } });
    render(<AttributesPage />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/new attribute name/i), { target: { value: "Theme" } });
    fireEvent.click(screen.getByRole("button", { name: /add attribute/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/admin/catalog/attributes", expect.objectContaining({ name: "Theme", displayType: "checkbox" }), expect.any(Object)));
  });
});
