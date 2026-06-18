import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock the API client so the page exercises the admin order endpoints against
// in-test fakes rather than the network. ApiError / API_BASE_URL stay real.
vi.mock("@planet-of-toys/shared-web/apiClient", async () => {
  const actual = await vi.importActual("@planet-of-toys/shared-web/apiClient");
  return {
    ...actual,
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Mock the admin session helpers so a token is always present and the
// unauthorized signal is observable.
vi.mock("../../lib/adminAuth.js", () => ({
  getToken: vi.fn(() => "test-token"),
  notifyUnauthorized: vi.fn(),
}));

import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import OrdersPage from "./OrdersPage.jsx";

const ORDER_SUMMARY = {
  id: "o1",
  orderId: "POT-1001",
  customer: { name: "Asha Rao", phone: "+919812345678" },
  amount: 1499,
  orderStatus: "CONFIRMED",
  shipmentStatus: "PENDING",
  createdAt: "2024-05-01T10:00:00.000Z",
};

const ORDER_DETAIL = {
  ...ORDER_SUMMARY,
  customer: {
    name: "Asha Rao",
    phone: "+919812345678",
    email: "asha@example.com",
    address: "12 MG Road",
    city: "Bengaluru",
    state: "KA",
    pincode: "560001",
  },
  // Shape mirrors the API's toAdminOrderDetail serialization: payment and
  // shipment are nested objects and the history arrives as `timeline`.
  payment: { method: "ONLINE", status: "PAID", razorpay: {} },
  shipment: { courier: null, awb: null },
  items: [{ productId: "p1", name: "Rainbow Blocks", quantity: 2, unitPrice: 600 }],
  timeline: [
    { status: "CONFIRMED", timestamp: "2024-05-01T10:00:00.000Z" },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>
  );
}

describe("Admin OrdersPage (Req 17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockImplementation((path) => {
      if (path.startsWith("/api/admin/orders/")) {
        return Promise.resolve({ order: ORDER_DETAIL });
      }
      return Promise.resolve({ orders: [ORDER_SUMMARY], total: 1 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists orders from GET /api/admin/orders with pagination params (Req 17.1)", async () => {
    renderPage();
    expect(await screen.findByText("POT-1001")).toBeInTheDocument();
    const [path, options] = apiClient.get.mock.calls[0];
    expect(path).toMatch(/^\/api\/admin\/orders\?/);
    expect(path).toMatch(/page=1/);
    expect(path).toMatch(/pageSize=\d+/);
    expect(options).toMatchObject({ token: "test-token" });
  });

  it("applies a status filter to the list request (Req 17.1)", async () => {
    renderPage();
    await screen.findByText("POT-1001");

    fireEvent.change(screen.getByLabelText(/filter by status/i), {
      target: { value: "DELIVERED" },
    });

    await waitFor(() =>
      expect(
        apiClient.get.mock.calls.some(
          ([p]) => p.includes("status=DELIVERED") && p.includes("page=1")
        )
      ).toBe(true)
    );
  });

  it("applies a free-text search to the list request (Req 17.1)", async () => {
    renderPage();
    await screen.findByText("POT-1001");

    fireEvent.change(screen.getByLabelText(/search orders/i), {
      target: { value: "Asha" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() =>
      expect(
        apiClient.get.mock.calls.some(([p]) => p.includes("search=Asha"))
      ).toBe(true)
    );
  });

  it("clears active search/status filters via the clear-filters control", async () => {
    renderPage();
    await screen.findByText("POT-1001");

    // No clear control while no filter is active.
    expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search orders/i), {
      target: { value: "Asha" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    const clear = await screen.findByTestId("clear-filters");
    expect(screen.getByTestId("active-filters")).toHaveTextContent("Asha");
    fireEvent.click(clear);

    // The control and summary disappear, the input resets, and the list is
    // requested without a search query.
    expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/search orders/i)).toHaveValue("");
    await waitFor(() => {
      const lastListCall = apiClient.get.mock.calls
        .map(([p]) => p)
        .filter((p) => p.startsWith("/api/admin/orders?"))
        .at(-1);
      expect(lastListCall).not.toContain("search=");
    });
  });

  it("opens order detail with customer, payment, shipment, and timeline (Req 17.2)", async () => {
    renderPage();
    await screen.findByText("POT-1001");

    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/admin/orders/o1",
      expect.objectContaining({ token: "test-token" })
    );
    expect(within(dialog).getByText("asha@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText("Online (Razorpay)")).toBeInTheDocument();
    expect(within(dialog).getByText("Paid")).toBeInTheDocument();
    // Status-history timeline entry rendered (scoped to the timeline list,
    // since "Confirmed" also appears as the order-status value).
    expect(within(dialog).getByText(/status timeline/i)).toBeInTheDocument();
    const timeline = dialog.querySelector(".admin-orders__timeline");
    expect(timeline).not.toBeNull();
    expect(within(timeline).getByText("Confirmed")).toBeInTheDocument();
  });

  it("cancels an order via POST /cancel after confirmation (Req 17.3)", async () => {
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    apiClient.post.mockResolvedValue({
      order: { ...ORDER_DETAIL, orderStatus: "CANCELLED" },
    });
    renderPage();
    await screen.findByText("POT-1001");
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: /cancel order/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/admin/orders/o1/cancel",
      {},
      expect.objectContaining({ token: "test-token" })
    );
  });

  it("shows a persistent manual-Shiprocket action for cancelled orders with a live shipment", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.startsWith("/api/admin/orders/")) {
        return Promise.resolve({
          order: {
            ...ORDER_DETAIL,
            orderStatus: "CANCELLED",
            shipmentStatus: "CREATED",
            shipment: { courier: "Delhivery", awb: "AWB123", shiprocketOrderId: "456789" },
          },
        });
      }
      return Promise.resolve({ orders: [ORDER_SUMMARY], total: 1 });
    });
    renderPage();
    await screen.findByText("POT-1001");
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));

    const action = await screen.findByTestId("manual-shiprocket-action");
    expect(action).toHaveTextContent(/manual cancellation required/i);
    expect(action).toHaveTextContent("AWB123");
    const link = within(action).getByRole("link", {
      name: /open shiprocket \/ cancel manually/i,
    });
    expect(link).toHaveAttribute("href", "https://app.shiprocket.in/seller/orders");

    // Shipment detail rows show the Shiprocket references directly.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("456789")).toBeInTheDocument();
    // The derived shipment state flags the required action.
    expect(within(dialog).getByText(/cancel in shiprocket/i)).toBeInTheDocument();
  });

  it("surfaces the server's manual-Shiprocket warning after a cancellation", async () => {
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const WARNING =
      "Refund completed successfully. However, the Shiprocket shipment could not be cancelled automatically. Please cancel it manually from the Shiprocket dashboard.";
    apiClient.post.mockResolvedValue({
      order: { ...ORDER_DETAIL, orderStatus: "CANCELLED" },
      warning: WARNING,
    });
    renderPage();
    await screen.findByText("POT-1001");
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: /cancel order/i }));

    expect(await screen.findByTestId("cancel-warning")).toHaveTextContent(
      /cancel it manually from the shiprocket dashboard/i
    );
  });

  it("triggers manual courier assignment/AWB for a PENDING shipment (Req 11.8, 17.4)", async () => {
    apiClient.post.mockResolvedValue({
      order: {
        ...ORDER_DETAIL,
        shipmentStatus: "CREATED",
        shipment: { courier: "Delhivery", awb: "AWB123" },
      },
    });
    renderPage();
    await screen.findByText("POT-1001");
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await screen.findByRole("dialog");

    fireEvent.click(
      screen.getByRole("button", { name: /assign courier & generate awb/i })
    );

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [path, body, options] = apiClient.post.mock.calls[0];
    expect(path).toBe("/api/admin/orders/o1/fulfill");
    expect(body).toEqual({});
    expect(options).toMatchObject({ token: "test-token" });
  });

  it("does not offer the courier trigger when shipment is already CREATED (Req 17.4)", async () => {
    apiClient.get.mockImplementation((path) => {
      if (path.startsWith("/api/admin/orders/")) {
        return Promise.resolve({
          order: { ...ORDER_DETAIL, shipmentStatus: "CREATED" },
        });
      }
      return Promise.resolve({ orders: [ORDER_SUMMARY], total: 1 });
    });
    renderPage();
    await screen.findByText("POT-1001");
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await screen.findByRole("dialog");

    expect(
      screen.queryByRole("button", { name: /assign courier & generate awb/i })
    ).not.toBeInTheDocument();
  });

  it("signals unauthorized on a 401 response (Req 21.3)", async () => {
    apiClient.get.mockRejectedValue(
      new ApiError("Unauthorized", { status: 401 })
    );
    renderPage();
    await waitFor(() => expect(notifyUnauthorized).toHaveBeenCalled());
    expect(getToken).toHaveBeenCalled();
  });
});
