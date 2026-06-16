import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Header from "./Header.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.get.mockResolvedValue({ items: [{ id: "1", label: "New Arrivals", href: "/collections/new", isMegaMenu: false, children: [] }] });
});
afterEach(cleanup);

/** Echoes the current location so we can assert navigation. */
function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Header />
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe("Header", () => {
  it("renders the logo, search box, and action links", () => {
    renderHeader();
    expect(screen.getByAltText(/planet of toys/i)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search the store/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /loyalty/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /wishlist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^cart$/i })).toBeInTheDocument();
  });

  it("renders the CMS-driven navigation fetched from the API", async () => {
    renderHeader();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/api/catalog/navigation?menuKey=header"));
    // Rendered in both desktop + mobile containers.
    expect((await screen.findAllByRole("link", { name: "New Arrivals" })).length).toBeGreaterThan(0);
  });

  it("submits search to /products with the query", () => {
    renderHeader();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lego" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/products?q=lego");
  });

  it("navigates to /products for an empty search", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/products");
  });

  it("toggles the mobile category menu", () => {
    renderHeader();
    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
