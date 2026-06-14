import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as pixel from "./pixel.js";

/**
 * Focused unit tests for Pixel event firing (Req 3.1, 3.2).
 *
 * These assert that each tracker method dispatches the correct standard Meta
 * Pixel event through a mocked `window.fbq`, independent of the bootstrap
 * snippet. Purchase/no-op behavior is covered by pixel.test.js.
 */
describe("Pixel event firing (Req 3.1, 3.2)", () => {
  let fbq;

  beforeEach(() => {
    fbq = vi.fn();
    window.fbq = fbq;
  });

  afterEach(() => {
    delete window.fbq;
    vi.restoreAllMocks();
  });

  it("pageView fires the standard PageView event exactly once (Req 3.1)", () => {
    const dispatched = pixel.pageView();

    expect(dispatched).toBe(true);
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith("track", "PageView");
  });

  it("viewContent fires the standard ViewContent event exactly once (Req 3.1)", () => {
    const dispatched = pixel.viewContent();

    expect(dispatched).toBe(true);
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith("track", "ViewContent");
  });

  it("initiateCheckout fires the standard InitiateCheckout event exactly once (Req 3.2)", () => {
    const dispatched = pixel.initiateCheckout();

    expect(dispatched).toBe(true);
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith("track", "InitiateCheckout");
  });

  it("fires PageView and ViewContent together on landing-page load (Req 3.1)", () => {
    // Req 3.1: a landing-page load sends BOTH a PageView and a ViewContent.
    pixel.pageView();
    pixel.viewContent();

    expect(fbq).toHaveBeenCalledTimes(2);
    expect(fbq).toHaveBeenNthCalledWith(1, "track", "PageView");
    expect(fbq).toHaveBeenNthCalledWith(2, "track", "ViewContent");
  });

  it("each landing event fires as a distinct standard event (Req 3.1, 3.2)", () => {
    pixel.pageView();
    pixel.viewContent();
    pixel.initiateCheckout();

    const trackedEvents = fbq.mock.calls
      .filter(([action]) => action === "track")
      .map(([, eventName]) => eventName);

    expect(trackedEvents).toEqual([
      "PageView",
      "ViewContent",
      "InitiateCheckout",
    ]);
  });
});
