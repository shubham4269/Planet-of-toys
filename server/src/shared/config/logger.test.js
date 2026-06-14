import { describe, it, expect, vi } from "vitest";
import { createLogger, serializeErrorForLog } from "./logger.js";

function makeSink() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };
}

describe("createLogger", () => {
  it("writes each level to the matching sink method with a tagged prefix", () => {
    const sink = makeSink();
    const fixed = new Date("2024-01-02T03:04:05.000Z");
    const log = createLogger({ sink, now: () => fixed });

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(sink.debug).toHaveBeenCalledWith(
      "[2024-01-02T03:04:05.000Z] [DEBUG] d"
    );
    expect(sink.info).toHaveBeenCalledWith(
      "[2024-01-02T03:04:05.000Z] [INFO] i"
    );
    expect(sink.warn).toHaveBeenCalledWith(
      "[2024-01-02T03:04:05.000Z] [WARN] w"
    );
    expect(sink.error).toHaveBeenCalledWith(
      "[2024-01-02T03:04:05.000Z] [ERROR] e"
    );
  });

  it("serializes metadata as JSON appended to the message", () => {
    const sink = makeSink();
    const log = createLogger({ sink });
    log.error("boom", { statusCode: 500, path: "/x" });

    const line = sink.error.mock.calls[0][0];
    expect(line).toContain("boom");
    expect(line).toContain('"statusCode":500');
    expect(line).toContain('"path":"/x"');
  });

  it("tolerates circular metadata without throwing", () => {
    const sink = makeSink();
    const log = createLogger({ sink });
    const meta = { name: "a" };
    meta.self = meta;

    expect(() => log.info("circular", meta)).not.toThrow();
    expect(sink.info.mock.calls[0][0]).toContain("[Circular]");
  });

  it("falls back to log() when the level method is missing", () => {
    const sink = { log: vi.fn() };
    const log = createLogger({ sink });
    log.error("no-error-method");
    expect(sink.log).toHaveBeenCalledTimes(1);
    expect(sink.log.mock.calls[0][0]).toContain("[ERROR] no-error-method");
  });
});

describe("serializeErrorForLog", () => {
  it("captures name, message, stack, and custom properties", () => {
    const err = new Error("kaboom");
    err.statusCode = 503;
    err.context = { orderId: "POT-1" };

    const detail = serializeErrorForLog(err);
    expect(detail.name).toBe("Error");
    expect(detail.message).toBe("kaboom");
    expect(typeof detail.stack).toBe("string");
    expect(detail.statusCode).toBe(503);
    expect(detail.context).toEqual({ orderId: "POT-1" });
  });

  it("stringifies non-Error values", () => {
    expect(serializeErrorForLog("plain string")).toEqual({
      message: "plain string",
    });
  });
});
