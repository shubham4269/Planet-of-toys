// apps/client/src/components/Footer.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Footer from "./Footer.jsx";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@planet-of-toys/shared-web/apiClient", () => ({ default: apiMock, ApiError: class extends Error {} }));

beforeEach(() => { apiMock.get.mockReset(); apiMock.post.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe("Footer", () => {
  it("renders nothing when disabled", async () => {
    apiMock.get.mockResolvedValue({ footer: { enabled: false } });
    const { container } = render(<Footer />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container.querySelector(".pot-footer")).toBeNull();
  });
  it("renders columns and submits the newsletter", async () => {
    apiMock.get.mockResolvedValue({ footer: {
      enabled: true,
      columns: [{ id: "c", title: "Shop", links: [{ id: "l", label: "Sale", url: "/sale" }] }],
      newsletter: { enabled: true, title: "Join", placeholder: "Enter your email", buttonLabel: "Subscribe" },
      social: [], bottomLinks: [], copyrightText: "© 2026",
    }});
    apiMock.post.mockResolvedValue({ ok: true });
    render(<Footer />);
    expect(await screen.findByText("Shop")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "me@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/api/newsletter/subscribe", { email: "me@x.com" }));
    expect(await screen.findByText(/thanks/i)).toBeInTheDocument();
  });
});
