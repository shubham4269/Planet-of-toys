import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MediaLibraryPage from "./MediaLibraryPage.jsx";

const sample = {
  items: [
    { filename: "a.webp", url: "/api/media/a.webp", size: 2048, sizeLabel: "2 KB", modifiedAt: "2026-06-10T00:00:00.000Z", kind: "image", inUse: true },
    { filename: "b.mp4", url: "/api/media/b.mp4", size: 4096, sizeLabel: "4 KB", modifiedAt: "2026-06-09T00:00:00.000Z", kind: "video", inUse: false },
  ],
  summary: { totalFiles: 2, totalBytes: 6144, totalLabel: "6 KB", imageCount: 1, videoCount: 1, unusedFiles: 1, unusedBytes: 4096, unusedLabel: "4 KB" },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => sample })));
  vi.stubGlobal("confirm", vi.fn(() => true));
  globalThis.localStorage?.setItem?.("pot_admin_token", "t");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("MediaLibraryPage", () => {
  it("renders the storage summary card and a card per item", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    expect(screen.getByText("b.mp4")).toBeInTheDocument();
    expect(screen.getByText(/6 KB/)).toBeInTheDocument();
    expect(screen.getByText(/2 files/i)).toBeInTheDocument();
  });

  it("shows In use / Unused badges", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    expect(screen.getByText("In use")).toBeInTheDocument();
    expect(screen.getByText("Unused")).toBeInTheDocument();
  });

  it("typing in search re-fetches with q param", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "clip" } });
    await waitFor(() => {
      const urls = fetch.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("q=clip"))).toBe(true);
    });
  });

  it("copies the absolute URL via clipboard", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /copy url/i })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toContain("/api/media/a.webp");
  });

  it("Delete on an unused item calls DELETE and refreshes", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("b.mp4")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /delete b\.mp4/i }));
    await waitFor(() => {
      const del = fetch.mock.calls.find((c) => c[1]?.method === "DELETE");
      expect(del).toBeTruthy();
      expect(String(del[0])).toContain("/api/admin/media/b.mp4");
    });
  });

  it("Delete is disabled for in-use items", async () => {
    render(<MediaLibraryPage />);
    await waitFor(() => expect(screen.getByText("a.webp")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /delete a\.webp/i })).toBeDisabled();
  });
});
