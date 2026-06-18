import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./App.jsx";
import { ADMIN_TOKEN_KEY } from "./lib/adminAuth.js";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );
}

/** Build a minimal JWT (header.payload.signature) with the given claims. */
function makeJwt(claims) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

describe("Admin SPA shell and routing", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("applies the admin dark theme on admin routes", () => {
    renderAt("/admin/login");
    expect(document.documentElement.getAttribute("data-theme")).toBe("admin");
  });

  it("redirects unauthenticated admin access to the login page", () => {
    renderAt("/admin");
    expect(
      screen.getByRole("heading", { name: /admin sign in/i })
    ).toBeInTheDocument();
  });

  it("renders the dashboard for an authenticated admin session", () => {
    localStorage.setItem(
      ADMIN_TOKEN_KEY,
      makeJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })
    );
    renderAt("/admin");
    expect(
      screen.getByRole("heading", { name: /admin dashboard/i })
    ).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("admin");
  });

  it("redirects an expired admin session to the login page", () => {
    localStorage.setItem(
      ADMIN_TOKEN_KEY,
      makeJwt({ sub: "admin", exp: Math.floor(Date.now() / 1000) - 60 })
    );
    renderAt("/admin");
    expect(
      screen.getByRole("heading", { name: /admin sign in/i })
    ).toBeInTheDocument();
  });

  it("funnels unknown top-level paths into the admin panel", () => {
    renderAt("/somewhere-else");
    // Redirected to /admin -> no session -> login form.
    expect(
      screen.getByRole("heading", { name: /admin sign in/i })
    ).toBeInTheDocument();
  });
});
