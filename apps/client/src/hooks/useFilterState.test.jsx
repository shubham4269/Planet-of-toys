// apps/client/src/hooks/useFilterState.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useFilterState from "./useFilterState.js";

afterEach(cleanup);

function Harness() {
  const { sort, setSort, selection, setSelection, page, setPage } = useFilterState();
  return (
    <div>
      <span data-testid="sort">{sort}</span>
      <span data-testid="page">{page}</span>
      <span data-testid="age">{(selection.f_age || []).join(",")}</span>
      <button onClick={() => setSort("price-asc")}>sort</button>
      <button onClick={() => setSelection({ f_age: ["0-12"] })}>sel</button>
      <button onClick={() => setPage(3)}>page</button>
    </div>
  );
}

describe("useFilterState", () => {
  it("reads defaults and updates sort/selection/page via the URL", () => {
    render(<MemoryRouter initialEntries={["/collections/stem"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("sort")).toHaveTextContent("featured");
    expect(screen.getByTestId("page")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("sort"));
    expect(screen.getByTestId("sort")).toHaveTextContent("price-asc");
    fireEvent.click(screen.getByText("sel"));
    expect(screen.getByTestId("age")).toHaveTextContent("0-12");
    fireEvent.click(screen.getByText("page"));
    expect(screen.getByTestId("page")).toHaveTextContent("3");
  });

  it("resets page to 1 when sort or selection changes", () => {
    render(<MemoryRouter initialEntries={["/collections/stem?page=4"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("page")).toHaveTextContent("4");
    fireEvent.click(screen.getByText("sort"));
    expect(screen.getByTestId("page")).toHaveTextContent("1");
  });
});
