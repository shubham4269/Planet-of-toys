// packages/shared-web/src/catalog/ProductGrid.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProductGrid from "./ProductGrid.jsx";

afterEach(cleanup);

describe("ProductGrid", () => {
  it("renders a card per product", () => {
    render(<ProductGrid products={[
      { id: "1", slug: "a", name: "A", price: 1, images: [] },
      { id: "2", slug: "b", name: "B", price: 2, images: [] },
    ]} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("shows the empty state when there are no products", () => {
    render(<ProductGrid products={[]} emptyLabel="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
