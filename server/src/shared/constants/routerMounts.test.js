import { describe, it, expect } from "vitest";
import { ROUTER_MOUNTS } from "./routerMounts.js";

describe("ROUTER_MOUNTS", () => {
  it("declares the content mounts", () => {
    expect(ROUTER_MOUNTS.contentAdmin).toBe("/api/admin/content");
    expect(ROUTER_MOUNTS.content).toBe("/api/content");
  });
});
