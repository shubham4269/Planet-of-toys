// apps/admin/src/pages/admin/catalog/CatalogRouting.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../../../App.jsx";
import { ADMIN_TOKEN_KEY } from "../../../lib/adminAuth.js";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({
  default: apiMock,
  ApiError: class ApiError extends Error {},
  API_BASE_URL: "",
}));

function makeJwt(claims) {
  const b64 = (o) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.get.mockResolvedValue({ categories: [], collections: [], attributes: [] });
  localStorage.setItem(
    ADMIN_TOKEN_KEY,
    makeJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })
  );
  globalThis.matchMedia ??= vi.fn().mockReturnValue({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("catalog routing", () => {
  it("renders the Categories page at /admin/catalog/categories", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/catalog/categories"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Categories" })).toBeInTheDocument();
  });

  it("renders the Attributes page at /admin/catalog/attributes", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/catalog/attributes"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Attributes", level: 1 })).toBeInTheDocument();
  });
});
