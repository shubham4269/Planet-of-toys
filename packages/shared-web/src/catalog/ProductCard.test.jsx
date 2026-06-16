// packages/shared-web/src/catalog/ProductCard.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProductCard from "./ProductCard.jsx";

afterEach(cleanup);

describe("ProductCard", () => {
  it("renders name, formatted price, and resolved image", () => {
    render(<ProductCard product={{ id: "p", slug: "blocks", name: "Blocks", price: 499, images: ["b.webp"] }}
      resolveImageUrl={(f) => `/media/${f}`} formatPrice={(n) => `Rs ${n}`} />);
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Rs 499")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Blocks" })).toHaveAttribute("src", "/media/b.webp");
  });

  it("renders a placeholder when there is no image", () => {
    const { container } = render(<ProductCard product={{ id: "p", slug: "x", name: "X", price: 1, images: [] }} />);
    expect(container.querySelector(".pot-prod-card__placeholder")).not.toBeNull();
  });
});
