import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import fc from "fast-check";
import App, { AppRoutes } from "./App.jsx";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );
}

describe("Storefront SPA shell and routing", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("renders the home route under the customer layout", () => {
    render(<App />);
    // HomePage renders its section placeholders synchronously (hero loads async).
    expect(
      screen.getByRole("heading", { name: /best sellers/i })
    ).toBeInTheDocument();
    // Storefront must not opt into the admin dark theme.
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("scaffolds the catalogue routes", () => {
    for (const [path, name] of [
      ["/products", /products/i],
      ["/product/rainbow-blocks", /product/i],
      ["/cart", /your cart/i],
    ]) {
      const { unmount } = renderAt(path);
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the checkout route under the customer layout", () => {
    renderAt("/checkout");
    expect(
      screen.getByRole("heading", { name: /checkout/i })
    ).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("renders a not-found view for unknown paths (no longer a 403 lockdown)", () => {
    renderAt("/does-not-exist");
    expect(
      screen.getByRole("heading", { name: /page not found/i })
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
