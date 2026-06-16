// packages/shared-web/src/catalog/FilterView.test.jsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FilterView from "./FilterView.jsx";

afterEach(cleanup);

const filters = [
  { key: "f_age", type: "attribute", attributeSlug: "age", name: "Age", displayType: "checkbox",
    values: [{ slug: "0-12", name: "0-12 Months" }, { slug: "1-2", name: "1-2 Years" }] },
  { key: "price", type: "price", min: 100, max: 900 },
  { key: "category", type: "category", options: [{ slug: "blocks", name: "Blocks" }] },
];

describe("FilterView", () => {
  it("renders a control group per filter definition", () => {
    render(<FilterView filters={filters} selection={{}} onChange={() => {}} />);
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByLabelText("Blocks")).toBeInTheDocument();
  });

  it("toggles an attribute value and emits the updated selection", () => {
    const onChange = vi.fn();
    render(<FilterView filters={filters} selection={{}} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("0-12 Months"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ f_age: ["0-12"] }));
  });

  it("emits a price selection when a bound is changed", () => {
    const onChange = vi.fn();
    render(<FilterView filters={filters} selection={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/minimum price/i), { target: { value: "200" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ price: [200, 900] }));
  });

  it("shows a close button in drawer mode", () => {
    const onClose = vi.fn();
    render(<FilterView filters={filters} selection={{}} onChange={() => {}} open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close filters/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
