import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { bootstrap } from "./pixel.js";

/**
 * Pixel bootstrap (Req 3.1, 3.4): installs the fbq stub, loads fbevents.js,
 * inits with the RUNTIME pixel id served by /api/config (the value the admin
 * saves in System Settings), and fires the initial PageView. Build-time
 * VITE_META_PIXEL_ID is only a fallback and is unset in the test environment.
 */

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

beforeEach(() => {
  delete window.fbq;
  delete window._fbq;
});

afterEach(() => {
  document
    .querySelectorAll(`script[src="${FBEVENTS_SRC}"]`)
    .forEach((el) => el.remove());
  delete window.fbq;
  delete window._fbq;
  vi.restoreAllMocks();
});

describe("pixel.bootstrap", () => {
  it("inits with the server-provided pixel id and fires PageView", async () => {
    const ok = await bootstrap({
      fetchPixelId: async () => "1234567890",
    });

    expect(ok).toBe(true);
    expect(typeof window.fbq).toBe("function");
    // The stub queues calls until fbevents.js loads.
    expect(window.fbq.queue).toEqual([
      ["init", "1234567890"],
      ["track", "PageView"],
    ]);
    // Meta's runtime script is injected exactly once.
    expect(
      document.querySelectorAll(`script[src="${FBEVENTS_SRC}"]`)
    ).toHaveLength(1);
  });

  it("does nothing when no pixel id is configured anywhere", async () => {
    const ok = await bootstrap({ fetchPixelId: async () => null });

    expect(ok).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(
      document.querySelectorAll(`script[src="${FBEVENTS_SRC}"]`)
    ).toHaveLength(0);
  });

  it("degrades silently when the config fetch fails", async () => {
    const ok = await bootstrap({
      fetchPixelId: async () => {
        throw new Error("network down");
      },
    });

    // No build-time fallback id in tests, so the pixel stays off.
    expect(ok).toBe(false);
    expect(window.fbq).toBeUndefined();
  });

  it("does not inject fbevents.js twice across bootstraps", async () => {
    await bootstrap({ fetchPixelId: async () => "1234567890" });
    await bootstrap({ fetchPixelId: async () => "1234567890" });

    expect(
      document.querySelectorAll(`script[src="${FBEVENTS_SRC}"]`)
    ).toHaveLength(1);
  });

  it("reuses an existing fbq (e.g. real runtime already loaded)", async () => {
    const existing = vi.fn();
    window.fbq = existing;

    const ok = await bootstrap({ fetchPixelId: async () => "1234567890" });

    expect(ok).toBe(true);
    expect(window.fbq).toBe(existing);
    expect(existing).toHaveBeenCalledWith("init", "1234567890");
    expect(existing).toHaveBeenCalledWith("track", "PageView");
  });
});
