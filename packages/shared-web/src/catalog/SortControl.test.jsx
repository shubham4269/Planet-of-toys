// packages/shared-web/src/catalog/SortControl.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SortControl, { SORT_OPTIONS } from "./SortControl.jsx";

afterEach(cleanup);

describe("SortControl", () => {
  it("exposes the six sort options", () => {
    expect(SORT_OPTIONS.map((o) => o.value)).toEqual(
      ["featured", "newest", "price-asc", "price-desc", "name", "best-selling"]
    );
  });

  it("reflects value and emits onChange", () => {
    const onChange = vi.fn();
    render(<SortControl value="featured" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "price-asc" } });
    expect(onChange).toHaveBeenCalledWith("price-asc");
  });
});
