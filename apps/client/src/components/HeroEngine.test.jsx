// apps/client/src/components/HeroEngine.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HeroEngine from "./HeroEngine.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {}, API_BASE_URL: "" }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

describe("HeroEngine", () => {
  it("fetches /api/hero and renders the slides", async () => {
    apiMock.get.mockResolvedValue({ slides: [{ id: "1", displayMode: "full_banner", title: "Summer Sale", ctaText: "Shop", ctaHref: "/a", desktopMedia: "d.webp" }] });
    render(<HeroEngine />);
    expect(await screen.findByText("Summer Sale")).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith("/api/hero");
  });

  it("renders nothing when there are no slides", async () => {
    apiMock.get.mockResolvedValue({ slides: [] });
    const { container } = render(<HeroEngine />);
    await Promise.resolve();
    expect(container.querySelector(".pot-hero-carousel")).toBeNull();
  });
});
