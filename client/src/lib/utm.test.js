import { describe, it, expect, beforeEach } from "vitest";
import {
  captureUtm,
  getUtm,
  parseUtm,
  UTM_STORAGE_KEY,
  UTM_KEYS,
} from "./utm.js";

describe("UTM Attribution Capture (Req 2)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("captures UTM parameters present in the URL into sessionStorage (Req 2.1)", () => {
    const record = captureUtm(
      "?utm_source=meta&utm_medium=cpc&utm_campaign=summer"
    );
    expect(record).toEqual({
      utm_source: "meta",
      utm_medium: "cpc",
      utm_campaign: "summer",
    });
    expect(JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY))).toEqual(record);
  });

  it("captures all five recognized UTM keys", () => {
    const record = captureUtm(
      "?utm_source=s&utm_medium=m&utm_campaign=c&utm_term=t&utm_content=x"
    );
    expect(Object.keys(record).sort()).toEqual([...UTM_KEYS].sort());
  });

  it("stores an empty record when no UTM parameters are present (Req 2.3)", () => {
    const record = captureUtm("?ref=newsletter&foo=bar");
    expect(record).toEqual({});
    expect(JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY))).toEqual({});
  });

  it("stores an empty record for an empty query string (Req 2.3)", () => {
    const record = captureUtm("");
    expect(record).toEqual({});
    expect(sessionStorage.getItem(UTM_STORAGE_KEY)).toBe("{}");
  });

  it("ignores non-UTM query parameters", () => {
    const record = parseUtm("?utm_source=meta&gclid=abc&fbclid=def");
    expect(record).toEqual({ utm_source: "meta" });
  });

  it("reads the persisted attribution record back (round-trip)", () => {
    captureUtm("?utm_source=meta&utm_campaign=launch");
    expect(getUtm()).toEqual({
      utm_source: "meta",
      utm_campaign: "launch",
    });
  });

  it("returns an empty record when nothing has been stored", () => {
    expect(getUtm()).toEqual({});
  });
});
