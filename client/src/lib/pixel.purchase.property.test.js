import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import * as pixel from "./pixel.js";

// Feature: planet-of-toys-ecommerce, Property 6: Purchase event carries the order value
//
// For any successfully created order with value `v`, the Meta Pixel `Purchase`
// event payload contains value `v`.
//
// Validates: Requirements 3.3

const NUM_RUNS = 100;

/**
 * Generator for plausible order values. Orders are monetary totals, so we
 * cover both integer rupee amounts and fractional (paise-precision) amounts,
 * including the zero/small-value boundary.
 */
const orderValue = fc.oneof(
  fc.nat({ max: 10_000_000 }),
  fc
    .double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true })
    .map((n) => Math.round(n * 100) / 100)
);

describe("Pixel Tracker — Purchase event value (Property 6, Req 3.3)", () => {
  beforeEach(() => {
    window.fbq = vi.fn();
  });

  afterEach(() => {
    delete window.fbq;
    vi.restoreAllMocks();
  });

  it("forwards the provided order value in the Purchase event payload for any value", () => {
    fc.assert(
      fc.property(orderValue, (value) => {
        window.fbq = vi.fn();

        const dispatched = pixel.purchase(value);

        // The event must have been dispatched to the pixel global.
        expect(dispatched).toBe(true);
        expect(window.fbq).toHaveBeenCalledTimes(1);

        // The Purchase event payload carries exactly the provided value.
        const call = window.fbq.mock.calls[0];
        expect(call[0]).toBe("track");
        expect(call[1]).toBe("Purchase");
        expect(call[2]).toMatchObject({ value });
        expect(call[2].value).toBe(value);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
