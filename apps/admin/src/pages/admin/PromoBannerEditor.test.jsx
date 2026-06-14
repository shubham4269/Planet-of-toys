// apps/admin/src/pages/admin/PromoBannerEditor.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PromoBannerEditor from "./PromoBannerEditor.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
}));
vi.mock("../../lib/adminAuth.js", () => ({
  getToken: () => "test-token",
  notifyUnauthorized: vi.fn(),
}));

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  globalThis.matchMedia = vi.fn().mockReturnValue({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
});

afterEach(() => vi.restoreAllMocks());

const EMPTY = {
  banner: {
    id: "1", enabled: false, bgColor: "#E11B22", textColor: "#FFFFFF",
    rotationIntervalMs: 5000, rightText: null, announcements: [],
  },
};

describe("PromoBannerEditor", () => {
  it("loads the banner and can add an announcement and save", async () => {
    apiMock.get.mockResolvedValue(EMPTY);
    apiMock.put.mockResolvedValue({ banner: { ...EMPTY.banner, enabled: true } });
    render(<PromoBannerEditor />);

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(
      "/api/admin/content/promo-banner", { token: "test-token" }
    ));

    fireEvent.click(screen.getByRole("button", { name: /add announcement/i }));
    fireEvent.change(screen.getByLabelText(/announcement 1 text/i), {
      target: { value: "Free shipping over Rs.499" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const [path, payload, opts] = apiMock.put.mock.calls[0];
    expect(path).toBe("/api/admin/content/promo-banner");
    expect(payload.announcements[0].text).toBe("Free shipping over Rs.499");
    expect(opts).toEqual({ token: "test-token" });
  });

  it("reorders announcements with the move-up control", async () => {
    apiMock.get.mockResolvedValue({
      banner: {
        ...EMPTY.banner,
        announcements: [
          { id: "a", text: "First", showOnMobile: true, showOnDesktop: true, enabled: true },
          { id: "b", text: "Second", showOnMobile: true, showOnDesktop: true, enabled: true },
        ],
      },
    });
    apiMock.put.mockResolvedValue(EMPTY);
    render(<PromoBannerEditor />);

    await screen.findByDisplayValue("First");
    fireEvent.click(screen.getAllByRole("button", { name: /move up/i })[1]);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled());
    const payload = apiMock.put.mock.calls[0][1];
    expect(payload.announcements.map((a) => a.text)).toEqual(["Second", "First"]);
  });

  it("filters the live preview by the selected device", async () => {
    apiMock.get.mockResolvedValue({
      banner: {
        ...EMPTY.banner,
        enabled: true,
        announcements: [
          { id: "d", text: "Desktop slide", showOnMobile: false, showOnDesktop: true, enabled: true },
          { id: "m", text: "Mobile slide", showOnMobile: true, showOnDesktop: false, enabled: true },
        ],
      },
    });
    render(<PromoBannerEditor />);

    // Desktop is the default preview device.
    expect(await screen.findByText("Desktop slide")).toBeInTheDocument();
    expect(screen.queryByText("Mobile slide")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /mobile preview/i }));
    expect(await screen.findByText("Mobile slide")).toBeInTheDocument();
    expect(screen.queryByText("Desktop slide")).toBeNull();
  });
});
