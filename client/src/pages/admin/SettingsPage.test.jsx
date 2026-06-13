import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";

// Mock the API client so the settings page resolves from test fixtures
// instead of hitting the network.
vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual("../../lib/apiClient.js");
  return {
    ...actual,
    default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  };
});

// Mock adminAuth so we can assert the unauthorized signal without storage.
vi.mock("../../lib/adminAuth.js", () => {
  const getToken = vi.fn(() => "test-token");
  const notifyUnauthorized = vi.fn();
  return {
    getToken,
    notifyUnauthorized,
    default: { getToken, notifyUnauthorized },
  };
});

import apiClient, { ApiError } from "../../lib/apiClient.js";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import SettingsPage from "./SettingsPage.jsx";

/** A representative masked-settings payload as returned by the backend. */
const MASKED = {
  razorpay: {
    keyId: { configured: true, masked: "••••••3456" },
    keySecret: { configured: true },
  },
  shiprocket: {
    email: { configured: false, masked: null },
    password: { configured: false },
  },
  whatsapp: {
    phoneNumberId: { configured: false, masked: null },
    accessToken: { configured: false },
    verifyToken: { configured: false },
  },
  metaPixel: {
    pixelId: { configured: false, masked: null },
  },
};

/**
 * Switch to a settings tab and return its now-visible section element. The
 * page renders only the active tab's section, so interacting with a given
 * integration requires opening its tab first.
 */
async function openTab(id) {
  const tab = await screen.findByTestId(`settings-tab-${id}`);
  fireEvent.click(tab);
  return screen.getByTestId(`settings-section-${id}`);
}

beforeEach(() => {
  apiClient.get.mockReset();
  apiClient.put.mockReset();
  apiClient.post.mockReset();
  getToken.mockClear();
  notifyUnauthorized.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("renders a tab for each of the four configuration sections (Req 30.2–30.6)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("settings-tab-whatsapp")).toBeInTheDocument()
    );
    expect(screen.getByTestId("settings-tab-razorpay")).toBeInTheDocument();
    expect(screen.getByTestId("settings-tab-shiprocket")).toBeInTheDocument();
    expect(screen.getByTestId("settings-tab-metaPixel")).toBeInTheDocument();

    // The first tab (WhatsApp) is shown by default; others appear on selection.
    expect(screen.getByTestId("settings-section-whatsapp")).toBeInTheDocument();
    await openTab("razorpay");
    expect(screen.getByTestId("settings-section-razorpay")).toBeInTheDocument();
  });

  it("loads masked settings from the authenticated endpoint on mount (Req 30.1)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({ token: "test-token" })
      )
    );
  });

  it("displays stored credentials only in masked form (Req 30.9)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    render(<SettingsPage />);

    await openTab("razorpay");
    // Non-secret masked value is shown.
    expect(
      await screen.findByTestId("current-razorpay-keyId")
    ).toHaveTextContent("Configured: ••••••3456");
    // Secret field shows only a "Configured" indicator, never a value.
    expect(screen.getByTestId("current-razorpay-keySecret")).toHaveTextContent(
      "Configured"
    );
    expect(
      screen.getByTestId("current-razorpay-keySecret")
    ).not.toHaveTextContent("3456");

    // Unset field reports "Not set" on its own tab.
    await openTab("shiprocket");
    expect(screen.getByTestId("current-shiprocket-email")).toHaveTextContent(
      "Not set"
    );
  });

  it("shows the Shiprocket webhook URL with a copy action (Req 12, 24)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    render(<SettingsPage />);

    const section = await openTab("shiprocket");
    const url = within(section).getByTestId("webhook-url-shiprocket");
    // Absolute URL pointing at the inbound webhook path; read-only.
    expect(url).toHaveValue(`${window.location.origin}/api/webhooks/shiprocket`);
    expect(url).toHaveAttribute("readonly");

    // Razorpay surfaces its own webhook block (payment event deliveries).
    const razorpaySection = await openTab("razorpay");
    expect(
      within(razorpaySection).getByTestId("webhook-url-razorpay")
    ).toHaveValue(`${window.location.origin}/api/webhooks/razorpay`);

    // Meta Pixel has no inbound webhook and surfaces no webhook block.
    await openTab("metaPixel");
    expect(screen.queryByTestId("webhook-metaPixel")).not.toBeInTheDocument();
  });

  it("shows per-field format validation feedback (Req 30.14)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    render(<SettingsPage />);

    const section = await openTab("razorpay");
    const keyId = within(section).getByLabelText(/razorpay key id/i);

    // An invalid value flags an inline error and marks the input invalid.
    fireEvent.change(keyId, { target: { value: "not-a-key" } });
    expect(within(section).getByRole("alert")).toHaveTextContent(
      /not in a valid format/i
    );
    expect(keyId).toHaveAttribute("aria-invalid", "true");

    // A correctly formatted value clears the error.
    fireEvent.change(keyId, { target: { value: "rzp_live_ABC123" } });
    expect(keyId).toHaveAttribute("aria-invalid", "false");
  });

  it("does not submit when a provided field has an invalid format (Req 30.14)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    render(<SettingsPage />);

    const section = await openTab("razorpay");
    fireEvent.change(within(section).getByLabelText(/razorpay key id/i), {
      target: { value: "bad" },
    });
    fireEvent.click(within(section).getByRole("button", { name: /^save$/i }));

    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it("saves only the provided fields and refreshes masked state (Req 30.3)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    const updated = {
      ...MASKED,
      razorpay: {
        keyId: { configured: true, masked: "••••••wxyz" },
        keySecret: { configured: true },
      },
    };
    apiClient.put.mockResolvedValue({ settings: updated });
    render(<SettingsPage />);

    const section = await openTab("razorpay");
    fireEvent.change(within(section).getByLabelText(/razorpay key id/i), {
      target: { value: "rzp_live_NEWKEYwxyz" },
    });
    fireEvent.click(within(section).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        "/api/admin/settings/razorpay",
        { keyId: "rzp_live_NEWKEYwxyz" },
        expect.objectContaining({ token: "test-token" })
      )
    );
    // Masked state refreshes from the response.
    await waitFor(() =>
      expect(
        within(section).getByTestId("current-razorpay-keyId")
      ).toHaveTextContent("••••••wxyz")
    );
  });

  it("performs a Test-Connection / Verify action and shows the result (Req 30.15)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    apiClient.post.mockResolvedValue({
      section: "razorpay",
      verified: true,
      message: "Connection verified successfully.",
    });
    render(<SettingsPage />);

    const section = await openTab("razorpay");
    fireEvent.click(
      within(section).getByRole("button", { name: /test connection/i })
    );

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/admin/settings/razorpay/verify",
        expect.any(Object),
        expect.objectContaining({ token: "test-token" })
      )
    );
    expect(
      await within(section).findByTestId("verify-result-razorpay")
    ).toHaveTextContent(/verified successfully/i);
  });

  it("shows a failed verification result without saving (Req 30.18)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    apiClient.post.mockResolvedValue({
      section: "razorpay",
      verified: false,
      message: "Verification failed. Please check the credentials and try again.",
    });
    render(<SettingsPage />);

    const section = await openTab("razorpay");
    fireEvent.click(
      within(section).getByRole("button", { name: /test connection/i })
    );

    expect(
      await within(section).findByTestId("verify-result-razorpay")
    ).toHaveTextContent(/verification failed/i);
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it("surfaces a server-side format rejection from save (Req 30.14)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    apiClient.put.mockRejectedValue(
      new ApiError("Razorpay Key ID is not in a valid format.", {
        status: 400,
        data: null,
      })
    );
    render(<SettingsPage />);

    const section = await openTab("shiprocket");
    fireEvent.change(within(section).getByLabelText(/shiprocket email/i), {
      target: { value: "ops@example.com" },
    });
    fireEvent.click(within(section).getByRole("button", { name: /^save$/i }));

    expect(await within(section).findByText(/not in a valid format/i)).toBeInTheDocument();
  });

  it("signals unauthorized on a 401 so the shell can redirect (Req 21.3)", async () => {
    apiClient.get.mockRejectedValue(
      new ApiError("Unauthorized", { status: 401, data: null })
    );
    render(<SettingsPage />);

    await waitFor(() => expect(notifyUnauthorized).toHaveBeenCalledTimes(1));
  });

  it("signals unauthorized when a save is rejected with 401 (Req 21.3)", async () => {
    apiClient.get.mockResolvedValue({ settings: MASKED });
    apiClient.put.mockRejectedValue(
      new ApiError("Unauthorized", { status: 401, data: null })
    );
    render(<SettingsPage />);

    const section = await openTab("metaPixel");
    fireEvent.change(within(section).getByLabelText(/meta pixel id/i), {
      target: { value: "1234567890" },
    });
    fireEvent.click(within(section).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(notifyUnauthorized).toHaveBeenCalledTimes(1));
  });
});
