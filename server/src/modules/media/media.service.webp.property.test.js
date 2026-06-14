// Feature: planet-of-toys-ecommerce, Property 33: Uploaded images are stored as WebP
//
// Property 33: Uploaded images are stored as WebP
// "For any accepted image upload, the stored output is a valid WebP file."
//
// Validates: Requirements 18.2
//
// Strategy: generate small raster images in a variety of source formats (PNG,
// JPEG, GIF, TIFF, and WebP) at arbitrary small dimensions, channel counts, and
// background colors using Sharp. Each generated image is fed through the real
// Media Service `processUpload` (no mocks, real Sharp transcode, real temp-dir
// write). Three invariants must hold for every accepted image upload:
//   1. The bytes written to disk carry the RIFF/WEBP container magic bytes.
//   2. Sharp can re-read the stored bytes and reports `format === "webp"`.
//   3. The returned metadata advertises the stored file as `image/webp` with a
//      `.webp` extension (what callers/serving layer will see).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import fc from "fast-check";
import { createMediaService } from "./media.service.js";

const UPLOADS = {
  allowedMediaTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/tiff",
    "video/mp4",
  ],
  // Generous limit so generated test images are always accepted on size.
  maxUploadSizeMb: 25,
};

/** Detect the WebP container by its RIFF/WEBP magic bytes. */
function isWebp(buffer) {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

/**
 * Source image formats we exercise, each paired with the MIME type the upload
 * declares, the Sharp encoder used to synthesize the source bytes, and a sample
 * original filename (none of which are executable/script extensions).
 */
const FORMATS = [
  { mime: "image/png", encode: (img) => img.png(), name: "src.png" },
  { mime: "image/jpeg", encode: (img) => img.jpeg(), name: "src.jpg" },
  { mime: "image/gif", encode: (img) => img.gif(), name: "src.gif" },
  { mime: "image/tiff", encode: (img) => img.tiff(), name: "src.tiff" },
  { mime: "image/webp", encode: (img) => img.webp(), name: "src.webp" },
];

/**
 * Build raw source image bytes in the requested format. JPEG has no alpha, so
 * such images are always emitted with 3 channels regardless of the generated
 * channel count.
 */
async function makeSourceImage({ formatIndex, width, height, channels, r, g, b }) {
  const format = FORMATS[formatIndex];
  const effectiveChannels = format.mime === "image/jpeg" ? 3 : channels;
  const background =
    effectiveChannels === 4 ? { r, g, b, alpha: 0.8 } : { r, g, b };
  const base = sharp({
    create: { width, height, channels: effectiveChannels, background },
  });
  const buffer = await format.encode(base).toBuffer();
  return { buffer, mime: format.mime, name: format.name };
}

const imageSpec = fc.record({
  formatIndex: fc.integer({ min: 0, max: FORMATS.length - 1 }),
  width: fc.integer({ min: 1, max: 64 }),
  height: fc.integer({ min: 1, max: 64 }),
  channels: fc.constantFrom(3, 4),
  r: fc.integer({ min: 0, max: 255 }),
  g: fc.integer({ min: 0, max: 255 }),
  b: fc.integer({ min: 0, max: 255 }),
});

describe("Property 33: Uploaded images are stored as WebP", () => {
  let tmpDir;
  let service;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pot-media-webp-"));
  });

  beforeEach(() => {
    service = createMediaService({ uploads: UPLOADS, mediaDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("stores any accepted image upload as a valid WebP file", async () => {
    await fc.assert(
      fc.asyncProperty(imageSpec, async (spec) => {
        const { buffer, mime, name } = await makeSourceImage(spec);

        const stored = await service.processUpload({
          originalname: name,
          mimetype: mime,
          buffer,
        });

        // Invariant 3: returned metadata advertises WebP.
        expect(stored.mimeType).toBe("image/webp");
        expect(stored.isImage).toBe(true);
        expect(stored.filename.endsWith(".webp")).toBe(true);

        // Invariant 1: written bytes carry the RIFF/WEBP container magic.
        const written = await fs.readFile(stored.path);
        expect(isWebp(written)).toBe(true);

        // Invariant 2: Sharp re-reads the stored bytes as WebP.
        const meta = await sharp(written).metadata();
        expect(meta.format).toBe("webp");
      }),
      { numRuns: 100 }
    );
  });
});
