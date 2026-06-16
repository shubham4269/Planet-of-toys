// packages/shared-web/src/catalog/NavigationView.mobile.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NavigationView } from "@planet-of-toys/shared-web";

afterEach(cleanup);

const items = [
  { id: "1", label: "Shop", href: "/category/x", children: [{ id: "1a", label: "Blocks", href: "/category/blocks" }] },
];

describe("NavigationView (mobile)", () => {
  it("expands a section and fires onNavigate on a child link", () => {
    const onNavigate = vi.fn();
    render(<NavigationView items={items} variant="mobile" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Shop" }));
    const link = screen.getByRole("link", { name: "Blocks" });
    expect(link).toHaveAttribute("href", "/category/blocks");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalled();
  });
});
