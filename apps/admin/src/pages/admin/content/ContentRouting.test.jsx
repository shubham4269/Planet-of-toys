import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../../App.jsx";
import { ADMIN_TOKEN_KEY } from "../../../lib/adminAuth.js";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
  API_BASE_URL: "http://localhost:4000",
}));

function makeJwt(claims) {
  const b64 = (o) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  apiMock.get.mockResolvedValue({
    banner: {
      id: "1", enabled: false, bgColor: "#E11B22", textColor: "#FFFFFF",
      rotationIntervalMs: 5000, rightText: null, announcements: [],
    },
  });
  localStorage.setItem(
    ADMIN_TOKEN_KEY,
    makeJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })
  );
  globalThis.matchMedia ??= vi.fn().mockReturnValue({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("admin content routing + nav", () => {
  it("redirects /admin/content to the promo-banner sub-route", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/content"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("heading", { name: /promotional header/i })
    ).toBeInTheDocument();
  });

  it("shows the Content group with a Promotional Banner sub-link", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/content/promo-banner"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("link", { name: /promotional banner/i })
    ).toBeInTheDocument();
  });

  it("renders the Media Library page at /admin/content/media-library", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        items: [],
        summary: { totalFiles: 0, totalBytes: 0, totalLabel: "0 B", imageCount: 0, videoCount: 0, unusedFiles: 0, unusedBytes: 0, unusedLabel: "0 B" },
      }),
    })));
    render(
      <MemoryRouter initialEntries={["/admin/content/media-library"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("heading", { name: /media library/i })
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows a Media Library sub-link in the Content group", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/content/promo-banner"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("link", { name: /media library/i })
    ).toBeInTheDocument();
  });
});
