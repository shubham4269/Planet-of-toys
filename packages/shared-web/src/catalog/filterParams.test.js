// packages/shared-web/src/catalog/filterParams.test.js
import { describe, it, expect } from "vitest";
import { parseFilterParams, toQueryString } from "./filterParams.js";

describe("parseFilterParams", () => {
  it("parses attribute (csv), price, category, sort, page into selection + meta", () => {
    const sp = new URLSearchParams("f_age=0-12,1-2&price=100-500&category=blocks&sort=price-asc&page=2");
    const { selection, sort, page } = parseFilterParams(sp);
    expect(selection.f_age).toEqual(["0-12", "1-2"]);
    expect(selection.price).toEqual([100, 500]);
    expect(selection.category).toBe("blocks");
    expect(sort).toBe("price-asc");
    expect(page).toBe(2);
  });

  it("defaults sort=featured and page=1 when absent", () => {
    const { sort, page, selection } = parseFilterParams(new URLSearchParams(""));
    expect(sort).toBe("featured");
    expect(page).toBe(1);
    expect(selection).toEqual({});
  });
});

describe("toQueryString", () => {
  it("round-trips a selection back to a query string", () => {
    const qs = toQueryString({ selection: { f_age: ["0-12", "1-2"], price: [100, 500], category: "blocks" }, sort: "price-asc", page: 2 });
    const parsed = parseFilterParams(new URLSearchParams(qs));
    expect(parsed.selection.f_age).toEqual(["0-12", "1-2"]);
    expect(parsed.selection.price).toEqual([100, 500]);
    expect(parsed.sort).toBe("price-asc");
    expect(parsed.page).toBe(2);
  });

  it("omits defaults (featured, page 1) from the query string", () => {
    expect(toQueryString({ selection: {}, sort: "featured", page: 1 })).toBe("");
  });
});
