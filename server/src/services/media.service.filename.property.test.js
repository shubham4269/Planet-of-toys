// Feature: planet-of-toys-ecommerce, Property 36: Accepted uploads receive unique filenames
//
// Property 36: Accepted uploads receive unique filenames
// "For any sequence of accepted uploads (including repeated original
//  filenames), the assigned stored filenames are all distinct, so no existing
//  stored file is overwritten."
//
// Validates: Requirements 23.4
//
// Strategy: generate an arbitrary sequence of valid uploads. Each upload draws a
// MIME type from the configured allow-list and an original filename from a small
// pool so that the SAME original name recurs frequently across the sequence
// (this is the adversarial case the property cares about). Every generated
// upload is intentionally valid (allowed type, non-executable name, within the
// size limit) so that each one is ACCEPTED and persisted. After processing the
// whole batch through a real Media Service writing to a temporary directory,
// two independent invariants must hold:
//   1. All assigned stored filenames are pairwise distinct (Set size == count).
//   2. Every stored file still exists on disk afterwards, so no earlier upload
//      was overwritten by a later one (no data loss).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import fc from "fast-check";
import {
  createMediaService,
  generateUniqueFilename,
} from "./media.service.js";

const NUM_RUNS = 100;

const UPLOADS = {
  allowedMediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
  maxUploadSizeMb: 5,
};

// A small pool of original filenames so repeats are common within a sequence.
// Mixing extensions and bare names exercises the repeated-name case directly.
const ORIGINAL_NAMES = ["photo.png", "image.jpg", "clip.mp4", "same.webp", "upload"];

// Non-image MIME types are stored verbatim, so their buffers can be arbitrary
// bytes. We avoid feeding random bytes to the image transcoder, instead routing
// every generated upload through video/mp4 (stored as-is) so processUpload never
// fails on undecodable image data — the property under test is about filenames,
// not transcoding.
function uploadArb() {
  return fc.record({
    originalname: fc.constantFrom(...ORIGINAL_NAMES),
    payload: fc.string({ minLength: 0, maxLength: 32 }),
  });
}

describe("media service - Property 36: accepted uploads receive unique filenames", () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pot-media-p36-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("assigns pairwise-distinct filenames across a sequence of accepted uploads (Req 23.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(uploadArb(), { minLength: 1, maxLength: 12 }),
        async (uploads) => {
          const service = createMediaService({ uploads: UPLOADS, mediaDir: tmpDir });

          const stored = [];
          for (const upload of uploads) {
            const result = await service.processUpload({
              originalname: upload.originalname,
              mimetype: "video/mp4",
              buffer: Buffer.from(upload.payload, "utf8"),
            });
            stored.push(result);
          }

          // Invariant 1: every assigned filename is distinct.
          const filenames = stored.map((s) => s.filename);
          const unique = new Set(filenames);
          expect(unique.size).toBe(filenames.length);

          // Invariant 2: no earlier file was overwritten — all persist on disk.
          for (const s of stored) {
            await expect(fs.readFile(s.path)).resolves.toBeDefined();
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("generates distinct names even for many same-extension calls (Req 23.4)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(".webp", ".mp4", ".mov"), {
          minLength: 1,
          maxLength: 50,
        }),
        (extensions) => {
          const names = extensions.map((ext) => generateUniqueFilename(ext));
          // All distinct.
          expect(new Set(names).size).toBe(names.length);
          // Each name carries the requested extension.
          names.forEach((name, i) => {
            expect(name.endsWith(extensions[i])).toBe(true);
          });
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
