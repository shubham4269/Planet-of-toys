// apps/admin/src/pages/admin/marketing/SubscribersPage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SubscribersPage from "./SubscribersPage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.patch.mockReset(); });
afterEach(() => vi.restoreAllMocks());

const PAGE = { subscribers: [{ id: "s1", email: "a@x.com", status: "subscribed", source: "footer", subscribedAt: "2026-06-15T00:00:00Z" }], total: 1, page: 1, limit: 20 };

describe("SubscribersPage", () => {
  it("loads subscribers and can unsubscribe one", async () => {
    apiMock.get.mockResolvedValue(PAGE);
    apiMock.patch.mockResolvedValue({ subscriber: { ...PAGE.subscribers[0], status: "unsubscribed" } });
    render(<SubscribersPage />);
    expect(await screen.findByText("a@x.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /unsubscribe a@x.com/i }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith(
      "/api/admin/newsletter/subscribers/s1/unsubscribe", undefined, { token: "t" }
    ));
  });
  it("searches by email", async () => {
    apiMock.get.mockResolvedValue(PAGE);
    render(<SubscribersPage />);
    await screen.findByText("a@x.com");
    fireEvent.change(screen.getByLabelText(/search subscribers/i), { target: { value: "beta" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(apiMock.get).toHaveBeenLastCalledWith(
      expect.stringContaining("search=beta"), { token: "t" }
    ));
  });
});
