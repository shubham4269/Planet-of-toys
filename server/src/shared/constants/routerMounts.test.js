import { describe, it, expect } from "vitest";
import { ROUTER_MOUNTS } from "./routerMounts.js";

describe("ROUTER_MOUNTS", () => {
  it("declares the content mounts", () => {
    expect(ROUTER_MOUNTS.contentAdmin).toBe("/api/admin/content");
    expect(ROUTER_MOUNTS.content).toBe("/api/content");
  });
});
import { describe as describeNl, it as itNl, expect as expectNl } from "vitest";
import { ROUTER_MOUNTS as MOUNTS_NL } from "./routerMounts.js";
describeNl("ROUTER_MOUNTS — newsletter", () => {
  itNl("declares newsletter mounts", () => {
    expectNl(MOUNTS_NL.newsletter).toBe("/api/newsletter");
    expectNl(MOUNTS_NL.newsletterAdmin).toBe("/api/admin/newsletter");
  });
});
