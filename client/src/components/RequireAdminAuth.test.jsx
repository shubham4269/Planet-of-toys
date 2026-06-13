import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { ADMIN_TOKEN_KEY } from "../lib/adminAuth.js";
import RequireAdminAuth from "./RequireAdminAuth.jsx";

function makeJwt(claims) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin" element={<RequireAdminAuth />}>
          <Route index element={<h1>Protected</h1>} />
        </Route>
        <Route path="/admin/login" element={<h1>Admin sign in</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAdminAuth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects to login when no session is present", () => {
    renderGuarded();
    expect(
      screen.getByRole("heading", { name: /admin sign in/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/protected/i)).not.toBeInTheDocument();
  });

  it("redirects to login when the session is expired", () => {
    localStorage.setItem(
      ADMIN_TOKEN_KEY,
      makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 })
    );
    renderGuarded();
    expect(
      screen.getByRole("heading", { name: /admin sign in/i })
    ).toBeInTheDocument();
  });

  it("renders the protected route for a valid session", () => {
    localStorage.setItem(
      ADMIN_TOKEN_KEY,
      makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    );
    renderGuarded();
    expect(
      screen.getByRole("heading", { name: /protected/i })
    ).toBeInTheDocument();
  });
});
