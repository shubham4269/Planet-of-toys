// packages/shared-web/src/catalog/AttributeFilterView.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AttributeFilterView from "./AttributeFilterView.jsx";

afterEach(cleanup);

const ageGroup = { id: "a", name: "Age Group", displayType: "checkbox",
  values: [{ id: "v1", name: "0-12 Months" }, { id: "v2", name: "1-2 Years" }] };

describe("AttributeFilterView", () => {
  it("renders nothing without an attribute", () => {
    const { container } = render(<AttributeFilterView attribute={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the attribute name and a checkbox per value for displayType=checkbox", () => {
    render(<AttributeFilterView attribute={ageGroup} />);
    expect(screen.getByText("Age Group")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByLabelText("0-12 Months")).toBeInTheDocument();
  });

  it("renders radios for displayType=radio", () => {
    render(<AttributeFilterView attribute={{ ...ageGroup, displayType: "radio" }} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("renders a select for displayType=dropdown", () => {
    render(<AttributeFilterView attribute={{ ...ageGroup, displayType: "dropdown" }} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3); // placeholder + 2
  });

  it("renders color swatches for displayType=color using swatchHex", () => {
    render(<AttributeFilterView attribute={{ id: "c", name: "Color", displayType: "color",
      values: [{ id: "r", name: "Red", swatchHex: "#ff0000" }] }} />);
    expect(screen.getByLabelText("Red")).toBeInTheDocument();
  });

  it("renders buttons for displayType=button", () => {
    render(<AttributeFilterView attribute={{ ...ageGroup, displayType: "button" }} />);
    expect(screen.getByRole("button", { name: "0-12 Months" })).toBeInTheDocument();
  });

  it("renders a range control for displayType=range", () => {
    render(<AttributeFilterView attribute={{ id: "p", name: "Price", displayType: "range", values: [] }} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });
});
