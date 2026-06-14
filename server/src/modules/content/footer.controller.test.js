import { describe, it, expect, vi } from "vitest";
import { createContentController } from "./content.controller.js";

function mockRes() { return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }; }

describe("content controller — footer", () => {
  it("getFooter returns { footer }", async () => {
    const service = { getFooter: vi.fn().mockResolvedValue({ id: "1", enabled: true }) };
    const res = mockRes();
    await createContentController(service).getFooter({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ footer: { id: "1", enabled: true } });
  });
  it("updateFooter passes body and returns { footer }", async () => {
    const service = { updateFooter: vi.fn().mockResolvedValue({ id: "1" }) };
    const res = mockRes();
    await createContentController(service).updateFooter({ body: { enabled: false } }, res, vi.fn());
    expect(service.updateFooter).toHaveBeenCalledWith({ enabled: false });
    expect(res.json).toHaveBeenCalledWith({ footer: { id: "1" } });
  });
  it("getPublicFooter returns { footer }", async () => {
    const service = { getPublicFooter: vi.fn().mockResolvedValue({ enabled: false }) };
    const res = mockRes();
    await createContentController(service).getPublicFooter({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ footer: { enabled: false } });
  });
});
