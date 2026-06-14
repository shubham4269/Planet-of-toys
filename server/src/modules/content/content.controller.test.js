import { describe, it, expect, vi } from "vitest";
import { createContentController } from "./content.controller.js";

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() };
}

describe("content controller", () => {
  it("getPromoBanner returns the banner", async () => {
    const service = { getPromoBanner: vi.fn().mockResolvedValue({ id: "1", enabled: true }) };
    const controller = createContentController(service);
    const res = mockRes();
    await controller.getPromoBanner({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ banner: { id: "1", enabled: true } });
  });

  it("updatePromoBanner passes the body through and returns the saved banner", async () => {
    const service = { updatePromoBanner: vi.fn().mockResolvedValue({ id: "1", enabled: false }) };
    const controller = createContentController(service);
    const res = mockRes();
    await controller.updatePromoBanner({ body: { enabled: false } }, res, vi.fn());
    expect(service.updatePromoBanner).toHaveBeenCalledWith({ enabled: false });
    expect(res.json).toHaveBeenCalledWith({ banner: { id: "1", enabled: false } });
  });

  it("getPublicPromoBanner returns the public projection", async () => {
    const service = {
      getPublicPromoBanner: vi.fn().mockResolvedValue({ enabled: false, announcements: [] }),
    };
    const controller = createContentController(service);
    const res = mockRes();
    await controller.getPublicPromoBanner({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ banner: { enabled: false, announcements: [] } });
  });

  it("forwards service errors to next()", async () => {
    const boom = new Error("boom");
    const service = { getPromoBanner: vi.fn().mockRejectedValue(boom) };
    const controller = createContentController(service);
    const next = vi.fn();
    await controller.getPromoBanner({}, mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
