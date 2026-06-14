// apps/admin/src/pages/admin/content/FooterEditor.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import FooterEditor from "./FooterEditor.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

const EMPTY = { footer: { id: "1", enabled: true, columns: [], newsletter: { enabled: true, title: "", subtitle: "", placeholder: "", buttonLabel: "" }, membershipPromo: { enabled: true, title: "", description: "", buttonLabel: "", buttonUrl: "" }, social: [], contact: {}, trustHighlights: [], bottomLinks: [], copyrightText: "" } };

beforeEach(() => { apiMock.get.mockReset(); apiMock.put.mockReset(); globalThis.matchMedia ??= vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }); });
afterEach(() => vi.restoreAllMocks());

describe("FooterEditor", () => {
  it("loads, adds a column + link, and saves the payload", async () => {
    apiMock.get.mockResolvedValue(EMPTY);
    apiMock.put.mockResolvedValue(EMPTY);
    render(<FooterEditor />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/api/admin/content/footer", { token: "t" }));
    fireEvent.click(screen.getByRole("button", { name: /add column/i }));
    fireEvent.change(screen.getByLabelText(/column 1 title/i), { target: { value: "Shop" } });
    fireEvent.click(screen.getByRole("button", { name: /add link to column 1/i }));
    fireEvent.change(screen.getByLabelText(/column 1 link 1 label/i), { target: { value: "Sale" } });
    fireEvent.change(screen.getByLabelText(/column 1 link 1 url/i), { target: { value: "/sale" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const payload = apiMock.put.mock.calls[0][1];
    expect(payload.columns[0].title).toBe("Shop");
    expect(payload.columns[0].links[0]).toMatchObject({ label: "Sale", url: "/sale" });
  });
});
