// packages/shared-web/src/catalog/CategoryView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CategoryView from "./CategoryView.jsx";

afterEach(cleanup);

describe("CategoryView", () => {
  it("renders nothing when there are no categories", () => {
    const { container } = render(<CategoryView categories={[]} />);
    expect(container.querySelector(".pot-cat-grid")).toBeNull();
  });

  it("renders a card per category with name and child count", () => {
    render(<CategoryView categories={[
      { id: "1", name: "Educational Toys", image: "edu.webp", childCount: 3 },
      { id: "2", name: "Puzzles", image: null, childCount: 0 },
    ]} />);
    expect(screen.getByText("Educational Toys")).toBeInTheDocument();
    expect(screen.getByText("Puzzles")).toBeInTheDocument();
    expect(screen.getByText(/3 subcategories/i)).toBeInTheDocument();
  });

  it("resolves image filenames via resolveImageUrl", () => {
    render(<CategoryView
      categories={[{ id: "1", name: "Edu", image: "edu.webp", childCount: 0 }]}
      resolveImageUrl={(f) => `/media/${f}`}
    />);
    expect(screen.getByRole("img", { name: "Edu" })).toHaveAttribute("src", "/media/edu.webp");
  });
});
