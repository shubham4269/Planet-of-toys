import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock the API client so login does not hit the network.
vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual("../lib/apiClient.js");
  return {
    ...actual,
    default: { post: vi.fn() },
  };
});

import apiClient, { ApiError } from "../lib/apiClient.js";
import { ADMIN_TOKEN_KEY, getToken } from "../lib/adminAuth.js";
import AdminLoginPage from "./AdminLoginPage.jsx";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/admin/login"]}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<h1>Admin Dashboard</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

function submitCredentials(email = "admin@example.com", password = "pw") {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("AdminLoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    apiClient.post.mockReset();
  });

  it("stores the returned token and navigates to the dashboard on success", async () => {
    apiClient.post.mockResolvedValue({ token: "header.payload.sig" });

    renderLogin();
    submitCredentials();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /admin dashboard/i })
      ).toBeInTheDocument()
    );
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/login", {
      email: "admin@example.com",
      password: "pw",
    });
    expect(getToken()).toBe("header.payload.sig");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("header.payload.sig");
  });

  it("shows a generic error on a 401 and stores no token", async () => {
    apiClient.post.mockRejectedValue(
      new ApiError("Invalid credentials.", { status: 401 })
    );

    renderLogin();
    submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid email or password/i
    );
    expect(getToken()).toBeNull();
  });

  it("shows a generic error when a 2xx response carries no token", async () => {
    apiClient.post.mockResolvedValue({});

    renderLogin();
    submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid email or password/i
    );
    expect(getToken()).toBeNull();
  });
});
