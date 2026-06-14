// apps/client/src/components/PromoBanner.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PromoBanner from "./PromoBanner.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
}));

function setViewport(isMobile) {
  globalThis.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("max-width") ? isMobile : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

beforeEach(() => {
  apiMock.get.mockReset();
  setViewport(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PromoBanner", () => {
  it("renders nothing when the banner is disabled", async () => {
    apiMock.get.mockResolvedValue({ banner: { enabled: false, announcements: [] } });
    const { container } = render(<PromoBanner />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container.querySelector(".promo-banner")).toBeNull();
  });

  it("renders enabled announcements and the rightText slot", async () => {
    apiMock.get.mockResolvedValue({
      banner: {
        enabled: true,
        bgColor: "#E11B22",
        textColor: "#FFFFFF",
        rotationIntervalMs: 5000,
        rightText: "Customer Care: 011-41410060",
        announcements: [
          { id: "1", text: "Free shipping over Rs.499", showOnMobile: true, showOnDesktop: true },
        ],
      },
    });
    render(<PromoBanner />);
    expect(await screen.findByText("Free shipping over Rs.499")).toBeInTheDocument();
    expect(screen.getByText("Customer Care: 011-41410060")).toBeInTheDocument();
  });

  it("filters announcements hidden on the current (mobile) viewport", async () => {
    setViewport(true);
    apiMock.get.mockResolvedValue({
      banner: {
        enabled: true,
        announcements: [
          { id: "1", text: "Desktop only", showOnMobile: false, showOnDesktop: true },
          { id: "2", text: "Mobile ok", showOnMobile: true, showOnDesktop: true },
        ],
      },
    });
    render(<PromoBanner />);
    expect(await screen.findByText("Mobile ok")).toBeInTheDocument();
    expect(screen.queryByText("Desktop only")).toBeNull();
  });
});
