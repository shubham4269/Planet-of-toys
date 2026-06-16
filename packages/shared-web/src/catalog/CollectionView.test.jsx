// packages/shared-web/src/catalog/CollectionView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CollectionView from "./CollectionView.jsx";

afterEach(cleanup);

describe("CollectionView", () => {
  it("renders nothing without a collection", () => {
    const { container } = render(<CollectionView collection={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders hero title/subtitle and product cards", () => {
    render(<CollectionView
      collection={{ id: "c", name: "STEM Toys", heroTitle: "Learn by Play", heroSubtitle: "Ages 5-8", heroImage: "hero.webp" }}
      products={[{ id: "p", slug: "blocks", name: "Blocks", price: 499 }]}
      resolveImageUrl={(f) => `/media/${f}`}
      formatPrice={(n) => `Rs ${n}`}
    />);
    expect(screen.getByText("Learn by Play")).toBeInTheDocument();
    expect(screen.getByText("Ages 5-8")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Rs 499")).toBeInTheDocument();
  });

  it("falls back to the collection name when heroTitle is absent", () => {
    render(<CollectionView collection={{ id: "c", name: "Best Sellers" }} products={[]} />);
    expect(screen.getByRole("heading", { name: "Best Sellers" })).toBeInTheDocument();
  });
});
