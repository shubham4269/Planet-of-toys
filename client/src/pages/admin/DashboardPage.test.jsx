import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the API client so the dashboard resolves stats from test fixtures
// instead of hitting the network.
vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual("../../lib/apiClient.js");
  return {
    ...actual,
    default: { get: vi.fn() },
  };
});

// Mock adminAuth so we can assert the unauthorized signal without storage.
vi.mock("../../lib/adminAuth.js", () => {
  const getToken = vi.fn(() => "test-token");
  const notifyUnauthorized = vi.fn();
  return { getToken, notifyUnauthorized, default: { getToken, notifyUnauthorized } };
});

import apiClient, { ApiError } from "../../lib/apiClient.js";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import DashboardPage from "./DashboardPage.jsx";

const STATS = {
  orderCount: 42,
  revenue: 125000,
  statusBreakdown: {
    CONFIRMED: 10,
    PACKED: 5,
    SHIPPED: 8,
    OUT_FOR_DELIVERY: 3,
    DELIVERED: 14,
    CANCELLED: 1,
    RTO: 1,
  },
};

beforeEach(() => {
  apiClient.get.mockReset();
  getToken.mockClear();
  notifyUnauthorized.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("renders the dashboard heading immediately while loading (Req 15.1)", () => {
    apiClient.get.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DashboardPage />);
    expect(
      screen.getByRole("heading", { name: /admin dashboard/i })
    ).toBeInTheDocument();
  });

  it("fetches stats from the authenticated dashboard endpoint on mount (Req 15.1)", async () => {
    apiClient.get.mockResolvedValue(STATS);
    render(<DashboardPage />);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        "/api/admin/dashboard",
        expect.objectContaining({ token: "test-token" })
      )
    );
  });

  it("displays order count, revenue, and status breakdown (Req 15.1)", async () => {
    apiClient.get.mockResolvedValue(STATS);
    render(<DashboardPage />);

    // Order count.
    expect(await screen.findByTestId("metric-order-count")).toHaveTextContent("42");
    // Revenue formatted as INR.
    expect(screen.getByTestId("metric-revenue")).toHaveTextContent("1,25,000");

    // Every status from the enumeration is rendered with its tally.
    expect(screen.getByTestId("status-CONFIRMED")).toHaveTextContent("10");
    expect(screen.getByTestId("status-DELIVERED")).toHaveTextContent("14");
    expect(screen.getByTestId("status-OUT_FOR_DELIVERY")).toHaveTextContent("3");
    expect(screen.getByTestId("status-RTO")).toHaveTextContent("1");
  });

  it("defaults missing status tallies to zero (Req 15.1)", async () => {
    apiClient.get.mockResolvedValue({
      orderCount: 2,
      revenue: 500,
      statusBreakdown: { CONFIRMED: 2 },
    });
    render(<DashboardPage />);

    expect(await screen.findByTestId("status-CONFIRMED")).toHaveTextContent("2");
    // A status with no reported tally falls back to 0.
    expect(screen.getByTestId("status-PACKED")).toHaveTextContent("0");
  });

  it("shows an inline error when the stats request fails (Req 15.1)", async () => {
    apiClient.get.mockRejectedValue(
      new ApiError("Server error", { status: 500, data: null })
    );
    render(<DashboardPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /unable to load dashboard statistics/i
    );
  });

  it("signals unauthorized on a 401 so the shell can redirect (Req 21.3)", async () => {
    apiClient.get.mockRejectedValue(
      new ApiError("Unauthorized", { status: 401, data: null })
    );
    render(<DashboardPage />);

    await waitFor(() => expect(notifyUnauthorized).toHaveBeenCalledTimes(1));
    // No generic error surfaced on auth failure; the redirect path handles it.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
