import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import {
  createMediaService,
  MediaValidationError,
  isAllowedMediaType,
  isExecutableUpload,
  isImageType,
  classifyMedia,
  generateUniqueFilename,
  DEFAULT_MEDIA_DIR,
} from "./media.service.js";

const UPLOADS = {
  allowedMediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
  maxUploadSizeMb: 5,
};

/** Build a small valid PNG buffer using Sharp. */
async function makePng(width = 8, height = 8) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

/** Detect the WebP container by its RIFF/WEBP magic bytes. */
function isWebp(buffer) {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

describe("media service - pure helpers", () => {
  it("accepts only configured media types (Req 23.1)", () => {
    expect(isAllowedMediaType("image/png", UPLOADS.allowedMediaTypes)).toBe(true);
    expect(isAllowedMediaType("IMAGE/PNG", UPLOADS.allowedMediaTypes)).toBe(true);
    expect(isAllowedMediaType("application/pdf", UPLOADS.allowedMediaTypes)).toBe(false);
    expect(isAllowedMediaType("", UPLOADS.allowedMediaTypes)).toBe(false);
  });

  it("flags executable/script extensions (Req 23.2)", () => {
    for (const name of ["x.exe", "run.sh", "a.JS", "p.php", "icon.svg", "page.html"]) {
      expect(isExecutableUpload(name)).toBe(true);
    }
    for (const name of ["photo.png", "clip.mp4", "pic.jpeg"]) {
      expect(isExecutableUpload(name)).toBe(false);
    }
  });

  it("classifies images as WebP-bound and videos by container", () => {
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("video/mp4")).toBe(false);
    expect(classifyMedia("image/jpeg")).toEqual({ isImage: true, extension: ".webp" });
    expect(classifyMedia("video/mp4")).toEqual({ isImage: false, extension: ".mp4" });
  });

  it("generates unique filenames (Req 23.4)", () => {
    const names = new Set(
      Array.from({ length: 500 }, () => generateUniqueFilename(".webp"))
    );
    expect(names.size).toBe(500);
    for (const name of names) {
      expect(name.endsWith(".webp")).toBe(true);
    }
  });

  it("exposes the default media dir under /server/media", () => {
    expect(DEFAULT_MEDIA_DIR.replace(/\\/g, "/")).toMatch(/\/server\/media$/);
  });
});

describe("media service - validation and processing", () => {
  let tmpDir;
  let service;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pot-media-"));
  });

  beforeEach(() => {
    service = createMediaService({ uploads: UPLOADS, mediaDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("requires uploads.allowedMediaTypes", () => {
    expect(() => createMediaService({})).toThrow(TypeError);
  });

  it("rejects executable uploads (Req 23.2)", () => {
    expect(() =>
      service.validateUpload({
        originalname: "malware.exe",
        mimetype: "image/png",
        buffer: Buffer.from("MZ"),
      })
    ).toThrow(MediaValidationError);
  });

  it("rejects unsupported formats (Req 23.1, 23.2)", () => {
    expect(() =>
      service.validateUpload({
        originalname: "doc.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("%PDF"),
      })
    ).toThrow(/Unsupported media type/);
  });

  it("rejects oversized files (Req 23.3)", () => {
    const tooBig = Buffer.alloc(UPLOADS.maxUploadSizeMb * 1024 * 1024 + 1);
    let error;
    try {
      service.validateUpload({
        originalname: "big.png",
        mimetype: "image/png",
        buffer: tooBig,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MediaValidationError);
    expect(error.statusCode).toBe(413);
  });

  it("accepts a file at exactly the size limit", () => {
    const exact = Buffer.alloc(UPLOADS.maxUploadSizeMb * 1024 * 1024);
    expect(() =>
      service.validateUpload({
        originalname: "edge.png",
        mimetype: "image/png",
        buffer: exact,
      })
    ).not.toThrow();
  });

  it("transcodes images to WebP and stores them under the media dir (Req 18.1, 18.2)", async () => {
    const png = await makePng();
    const stored = await service.processUpload({
      originalname: "photo.png",
      mimetype: "image/png",
      buffer: png,
    });

    expect(stored.filename.endsWith(".webp")).toBe(true);
    expect(stored.mimeType).toBe("image/webp");
    expect(stored.url).toBe(`/api/media/${stored.filename}`);
    expect(path.dirname(stored.path)).toBe(tmpDir);

    const written = await fs.readFile(stored.path);
    expect(isWebp(written)).toBe(true);
  });

  it("stores non-image media without transcoding (Req 18.1)", async () => {
    const video = Buffer.from("fake-mp4-bytes");
    const stored = await service.processUpload({
      originalname: "clip.mp4",
      mimetype: "video/mp4",
      buffer: video,
    });

    expect(stored.filename.endsWith(".mp4")).toBe(true);
    expect(stored.mimeType).toBe("video/mp4");
    const written = await fs.readFile(stored.path);
    expect(written.equals(video)).toBe(true);
  });

  it("never overwrites an existing file on repeated uploads (Req 23.4)", async () => {
    const png = await makePng();
    const first = await service.processUpload({
      originalname: "same.png",
      mimetype: "image/png",
      buffer: png,
    });
    const second = await service.processUpload({
      originalname: "same.png",
      mimetype: "image/png",
      buffer: png,
    });
    expect(first.filename).not.toBe(second.filename);
    await expect(fs.readFile(first.path)).resolves.toBeDefined();
    await expect(fs.readFile(second.path)).resolves.toBeDefined();
  });
});
