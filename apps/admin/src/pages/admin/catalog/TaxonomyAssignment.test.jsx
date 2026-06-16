// apps/admin/src/pages/admin/catalog/TaxonomyAssignment.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import TaxonomyAssignment from "./TaxonomyAssignment.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));
vi.mock("../../../lib/adminAuth.js", () => ({ getToken: () => "t", notifyUnauthorized: vi.fn() }));

beforeEach(() => { apiMock.get.mockReset(); });
afterEach(cleanup);

function mockCatalog() {
  apiMock.get.mockImplementation((path) => {
    if (path.includes("/categories")) return Promise.resolve({ categories: [{ id: "c1", name: "Toys", children: [] }] });
    if (path.includes("/collections")) return Promise.resolve({ collections: [{ id: "k1", name: "Sale" }] });
    if (path.includes("/attributes")) return Promise.resolve({ attributes: [{ id: "a1", name: "Age", values: [{ id: "v1", name: "0-12" }] }] });
    return Promise.resolve({});
  });
}

describe("TaxonomyAssignment", () => {
  it("renders fetched categories, collections, and attribute values", async () => {
    mockCatalog();
    render(<TaxonomyAssignment value={{ categoryIds: [], collectionIds: [], attributeValueIds: [] }} onChange={() => {}} />);
    expect(await screen.findByLabelText("Toys")).toBeInTheDocument();
    expect(screen.getByLabelText("Sale")).toBeInTheDocument();
    expect(screen.getByLabelText("0-12")).toBeInTheDocument();
  });

  it("emits the updated id set when a box is toggled", async () => {
    mockCatalog();
    const onChange = vi.fn();
    render(<TaxonomyAssignment value={{ categoryIds: [], collectionIds: [], attributeValueIds: [] }} onChange={onChange} />);
    fireEvent.click(await screen.findByLabelText("Toys"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: ["c1"] })));
  });
});
