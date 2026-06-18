import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { createMediaRouters } from "./media.router.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";

const UPLOADS = {
  allowedMediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
  maxUploadSizeMb: 2,
};

async function makePng() {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

function isWebp(buffer) {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

describe("media router - upload and static serving", () => {
  let tmpDir;
  let server;
  let baseUrl;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pot-media-router-"));

    const { uploadRouter, serveRouter } = createMediaRouters({
      uploads: UPLOADS,
      mediaDir: tmpDir,
    });

    const app = express();
    // Mirror the design's mount points: authed upload + public serving.
    app.use("/api/admin/media", uploadRouter);
    app.use("/api/media", serveRouter);
    app.use(errorHandler);

    server = app.listen(0);
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("uploads an image, stores it as WebP, and serves it statically (Req 18.2, 23.5)", async () => {
    const png = await makePng();
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "photo.png");

    const res = await fetch(`${baseUrl}/api/admin/media`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.media.filename.endsWith(".webp")).toBe(true);
    expect(body.media.mimeType).toBe("image/webp");
    // Response must not leak the absolute filesystem path.
    expect(body.media.path).toBeUndefined();

    // Static serving returns inert content with anti-sniffing headers (Req 23.5).
    const fetched = await fetch(`${baseUrl}/api/media/${body.media.filename}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetched.headers.get("content-security-policy")).toContain("default-src 'none'");
    const served = Buffer.from(await fetched.arrayBuffer());
    expect(isWebp(served)).toBe(true);
  });

  it("rejects an executable upload (Req 23.2)", async () => {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("MZbinary")], { type: "image/png" }), "x.exe");

    const res = await fetch(`${baseUrl}/api/admin/media`, { method: "POST", body: form });
    expect(res.status).toBe(415);
  });

  it("rejects an unsupported media type (Req 23.1)", async () => {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("%PDF-1.7")], { type: "application/pdf" }), "doc.pdf");

    const res = await fetch(`${baseUrl}/api/admin/media`, { method: "POST", body: form });
    expect(res.status).toBe(415);
  });

  it("rejects an oversized upload (Req 23.3)", async () => {
    const tooBig = Buffer.alloc(UPLOADS.maxUploadSizeMb * 1024 * 1024 + 1024);
    const form = new FormData();
    form.append("file", new Blob([tooBig], { type: "image/png" }), "big.png");

    const res = await fetch(`${baseUrl}/api/admin/media`, { method: "POST", body: form });
    expect(res.status).toBe(413);
  });

  it("returns 404 for media that does not exist", async () => {
    const res = await fetch(`${baseUrl}/api/media/does-not-exist.webp`);
    expect(res.status).toBe(404);
  });
});
