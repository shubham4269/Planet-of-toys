import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import fc from "fast-check";
import App, { AppRoutes } from "./App.jsx";
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

describe("SPA shell and routing", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("serves a public coming-soon homepage at the root URL", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /coming soon/i })
    ).toBeInTheDocument();
    // Customer surface must not opt into the admin dark theme.
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("blocks the old landing pages with a 403 view", () => {
    renderAt("/p/rainbow-blocks");
    expect(
      screen.getByRole("heading", { name: /403 forbidden/i })
    ).toBeInTheDocument();
  });

  it("renders the checkout route under the customer layout", () => {
    renderAt("/checkout");
    expect(
      screen.getByRole("heading", { name: /checkout/i })
    ).toBeInTheDocument();
    // Customer surface must not opt into the admin dark theme.
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("blocks unknown customer paths with a 403 view", () => {
    renderAt("/does-not-exist");
    expect(
      screen.getByRole("heading", { name: /403 forbidden/i })
    ).toBeInTheDocument();
  });

  it("applies the admin dark theme on admin routes", () => {
    renderAt("/admin/login");
    expect(document.documentElement.getAttribute("data-theme")).toBe("admin");
  });

  it("redirects unauthenticated admin access to the login page", () => {
    renderAt("/admin");
    // No valid session -> the route guard sends the user to the login form.
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

  it("exposes policy routes required for the footer legal links", () => {
    for (const [path, name] of [
      ["/privacy-policy", /privacy policy/i],
      ["/terms-of-service", /terms of service/i],
      ["/shipping-policy", /shipping policy/i],
      ["/refund-policy", /refund policy/i],
    ]) {
      const { unmount } = renderAt(path);
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      unmount();
    }
  });

  // Smoke check that fast-check is installed and operational for later PBT tasks.
  it("fast-check is wired up", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return s.length >= 0;
      }),
      { numRuns: 100 }
    );
  });
});
