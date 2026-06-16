// packages/shared-web/src/catalog/NavigationView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NavigationView from "./NavigationView.jsx";

afterEach(cleanup);

const items = [
  { id: "1", label: "Shop by Age", href: "/category/age", isMegaMenu: true, children: [
    { id: "1a", label: "0-12 Months", href: "/category/0-12", featured: false },
    { id: "1b", label: "New Arrivals", href: "/collections/new", featured: true, image: "na.webp" },
  ] },
  { id: "2", label: "Sale", href: "/sale", isMegaMenu: false, children: [] },
];

describe("NavigationView (desktop)", () => {
  it("renders top-level items; non-mega is a link", () => {
    render(<NavigationView items={items} />);
    expect(screen.getByRole("link", { name: "Sale" })).toHaveAttribute("href", "/sale");
  });

  it("opens a mega panel on click revealing child links and a featured card", () => {
    render(<NavigationView items={items} resolveImageUrl={(f) => `/media/${f}`} />);
    fireEvent.click(screen.getByRole("button", { name: "Shop by Age" }));
    expect(screen.getByRole("link", { name: "0-12 Months" })).toHaveAttribute("href", "/category/0-12");
    expect(screen.getByRole("img", { name: "New Arrivals" })).toHaveAttribute("src", "/media/na.webp");
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<NavigationView items={[]} />);
    expect(container.querySelector(".pot-nav")).toBeNull();
  });
});
