import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../../App.jsx";
import { ADMIN_TOKEN_KEY } from "../../../lib/adminAuth.js";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
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
});
