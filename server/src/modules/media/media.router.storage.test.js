import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { createMediaRouters } from "./media.router.js";
import { DEFAULT_MEDIA_DIR, createMediaService } from "./media.service.js";
import { errorHandler } from "../../shared/middleware/errorHandler.js";

/**
 * Integration test for Task 7.5 — media storage and serving.
 *
 * Verifies two acceptance criteria end-to-end through the real upload +
 * static-serving HTTP stack (no mocks of the service or filesystem):
 *
 *  - Req 18.1: uploaded media is stored on the local server filesystem under
 *    the `/server/media` directory.
 *  - Req 23.5: the backend serves uploaded media as static data without
 *    executing the uploaded content (correct inert content-type, anti-sniffing
 *    and sandbox headers, and byte-for-byte identical payload).
 */

const UPLOADS = {
  allowedMediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
  maxUploadSizeMb: 2,
};

async function makePng() {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
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

describe("media storage and serving (integration) — Req 18.1, 23.5", () => {
  let server;
  let baseUrl;
  let mediaService;
  // Track files we create in the real media dir so we can clean them up.
  const createdFiles = new Set();

  beforeAll(async () => {
    // Use the DEFAULT media directory so we genuinely exercise the
    // `/server/media` storage location (Req 18.1) rather than a temp dir.
    mediaService = createMediaService({ uploads: UPLOADS });
    await mediaService.ensureMediaDir();

    const { uploadRouter, serveRouter } = createMediaRouters({ mediaService });

    const app = express();
    app.use("/api/admin/media", uploadRouter);
    app.use("/api/media", serveRouter);
    app.use(errorHandler);

    server = app.listen(0);
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) server.close();
    await Promise.all(
      [...createdFiles].map((filename) =>
        fs.rm(path.join(DEFAULT_MEDIA_DIR, filename), { force: true })
      )
    );
  });

  it("stores an uploaded file on the local filesystem under /server/media (Req 18.1)", async () => {
    // The default storage directory must resolve to <repo>/server/media.
    const dir = mediaService.getMediaDir();
    expect(dir).toBe(DEFAULT_MEDIA_DIR);
    expect(path.basename(dir)).toBe("media");
    expect(path.basename(path.dirname(dir))).toBe("server");

    const png = await makePng();
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "toy.png");

    const res = await fetch(`${baseUrl}/api/admin/media`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const body = await res.json();
    const { filename } = body.media;
    createdFiles.add(filename);

    // The file must physically exist inside the /server/media directory.
    const storedPath = path.join(DEFAULT_MEDIA_DIR, filename);
    const stat = await fs.stat(storedPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);

    // Its resolved path must stay within the media directory (no traversal).
    expect(path.resolve(storedPath).startsWith(path.resolve(DEFAULT_MEDIA_DIR))).toBe(true);
  });

  it("serves stored media as static, non-executing content (Req 23.5)", async () => {
    const png = await makePng();
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "banner.png");

    const upload = await fetch(`${baseUrl}/api/admin/media`, { method: "POST", body: form });
    expect(upload.status).toBe(201);
    const { media } = await upload.json();
    createdFiles.add(media.filename);

    // Read the bytes that were actually persisted to disk.
    const onDisk = await fs.readFile(path.join(DEFAULT_MEDIA_DIR, media.filename));

    const served = await fetch(`${baseUrl}/api/media/${media.filename}`);
    expect(served.status).toBe(200);

    // Inert, non-executing delivery: anti-sniffing + sandboxed CSP + inline
    // disposition so the browser treats the bytes as static data only.
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = served.headers.get("content-security-policy") || "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
    expect(served.headers.get("content-disposition")).toContain("inline");

    // Content-type is the inert image type, never an executable/script type.
    const contentType = served.headers.get("content-type") || "";
    expect(contentType).toContain("image/webp");
    expect(contentType).not.toMatch(/javascript|html|octet-stream/i);

    // The payload is returned verbatim (static data, not executed/transformed).
    const servedBytes = Buffer.from(await served.arrayBuffer());
    expect(isWebp(servedBytes)).toBe(true);
    expect(servedBytes.equals(onDisk)).toBe(true);
  });
});
