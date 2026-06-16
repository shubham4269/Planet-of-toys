// apps/admin/src/pages/admin/catalog/DevicePreview.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DevicePreview from "./DevicePreview.jsx";

afterEach(cleanup);

describe("DevicePreview", () => {
  it("renders the children in both a desktop and a mobile frame", () => {
    render(<DevicePreview><p>hello</p></DevicePreview>);
    expect(screen.getAllByText("hello")).toHaveLength(2);
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
  });

  it("constrains the mobile viewport width", () => {
    const { container } = render(<DevicePreview mobileWidth={390}><p>x</p></DevicePreview>);
    const mobileViewport = container.querySelector(".device-preview__frame--mobile .device-preview__viewport");
    expect(mobileViewport).toHaveStyle({ width: "390px" });
  });
});
