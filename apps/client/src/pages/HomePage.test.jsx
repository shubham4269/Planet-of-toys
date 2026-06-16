// apps/client/src/pages/HomePage.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HomePage from "./HomePage.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.get.mockResolvedValue({ slides: [] }); });
afterEach(cleanup);

describe("HomePage", () => {
  it("renders the hero section and the future-section placeholders", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Best Sellers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shop By Age" })).toBeInTheDocument();
  });
});
