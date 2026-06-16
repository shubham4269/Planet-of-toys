// packages/shared-web/src/catalog/AttributeFilterView.controlled.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AttributeFilterView from "./AttributeFilterView.jsx";

afterEach(cleanup);

const attr = { id: "a", name: "Age", displayType: "checkbox",
  values: [{ slug: "0-12", name: "0-12 Months" }, { slug: "1-2", name: "1-2 Years" }] };

describe("AttributeFilterView (controlled)", () => {
  it("reflects selected and calls onToggle with the value slug", () => {
    const onToggle = vi.fn();
    render(<AttributeFilterView attribute={attr} selected={["0-12"]} onToggle={onToggle} />);
    const first = screen.getByLabelText("0-12 Months");
    expect(first).toBeChecked();
    fireEvent.click(screen.getByLabelText("1-2 Years"));
    expect(onToggle).toHaveBeenCalledWith("1-2");
  });

  it("stays uncontrolled (no checked) when onToggle is absent", () => {
    render(<AttributeFilterView attribute={attr} />);
    expect(screen.getByLabelText("0-12 Months")).not.toBeChecked();
  });
});
