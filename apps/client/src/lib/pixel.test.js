import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as pixel from "./pixel.js";

describe("Pixel Tracker (Req 3)", () => {
  beforeEach(() => {
    window.fbq = vi.fn();
  });

  afterEach(() => {
    delete window.fbq;
    vi.restoreAllMocks();
  });

  it("fires a PageView event (Req 3.1)", () => {
    expect(pixel.pageView()).toBe(true);
    expect(window.fbq).toHaveBeenCalledWith("track", "PageView");
  });

  it("fires a ViewContent event (Req 3.1)", () => {
    expect(pixel.viewContent()).toBe(true);
    expect(window.fbq).toHaveBeenCalledWith("track", "ViewContent");
  });

  it("fires an InitiateCheckout event (Req 3.2)", () => {
    expect(pixel.initiateCheckout()).toBe(true);
    expect(window.fbq).toHaveBeenCalledWith("track", "InitiateCheckout");
  });

  it("fires a Purchase event carrying the order value (Req 3.3)", () => {
    expect(pixel.purchase(1299)).toBe(true);
    expect(window.fbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      expect.objectContaining({ value: 1299 })
    );
  });

  it("degrades to a safe no-op when fbq is unavailable", () => {
    delete window.fbq;
    expect(pixel.pageView()).toBe(false);
    expect(pixel.viewContent()).toBe(false);
    expect(pixel.initiateCheckout()).toBe(false);
    expect(pixel.purchase(10)).toBe(false);
  });

  it("exposes the build-time pixel id binding (Req 3.4)", () => {
    // VITE_META_PIXEL_ID is read at build time; it is undefined in the test env.
    expect("PIXEL_ID" in pixel).toBe(true);
  });
});
