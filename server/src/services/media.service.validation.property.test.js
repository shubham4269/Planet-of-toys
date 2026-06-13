// Feature: planet-of-toys-ecommerce, Property 35: Upload validation enforces type and size
//
// Property 35: Upload validation enforces type and size
// "For any uploaded file, the upload is accepted only when its type is in the
//  configured allowed set and its size does not exceed the configured maximum;
//  files of disallowed type (including executables) or exceeding the maximum
//  size are rejected."
//
// Validates: Requirements 23.1, 23.3
//
// Strategy: rather than re-deriving the expected decision from the service's own
// helpers (which could share a bug with the code under test), we generate each
// upload along three INDEPENDENT decision dimensions whose ground-truth outcome
// we control directly:
//   - type:       "allowed"  -> a MIME type from the configured allow-list
//                                (optionally case-mangled, which must stay valid)
//                 "disallowed" -> a MIME type that is provably not in the set
//   - extension:  "safe"     -> a benign image/video extension
//                 "exec"     -> an executable/script extension that must be rejected
//   - size:       "ok"       -> 0..maxBytes (inclusive boundary is accepted)
//                 "over"     -> strictly greater than maxBytes
// The expected verdict is then simply:
//   accept  <=>  type == allowed  AND  extension == safe  AND  size == ok
// validateUpload must accept (not throw) exactly when expected, and otherwise
// throw a MediaValidationError. This exercises Req 23.1 (type allow-list) and
// Req 23.3 (max size), plus the executable-rejection facet of the property.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createMediaService, MediaValidationError } from "./media.service.js";

const UPLOADS = {
  allowedMediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
  maxUploadSizeMb: 5,
};
const MAX_BYTES = UPLOADS.maxUploadSizeMb * 1024 * 1024;

const service = createMediaService({ uploads: UPLOADS, mediaDir: "/tmp/never-written" });

/** MIME types guaranteed to be outside the configured allow-list. */
const DISALLOWED_MIME = [
  "application/pdf",
  "text/plain",
  "text/html",
  "application/zip",
  "application/x-msdownload",
  "audio/mpeg",
  "video/x-msvideo",
  "image/svg+xml",
  "image/gif",
  "application/octet-stream",
];

/** Benign extensions that are NOT in the executable/script reject set. */
const SAFE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".mp4", ".gif"];

/** Executable/script extensions that must always be rejected (Req 23.2). */
const EXEC_EXT = [".exe", ".sh", ".js", ".svg", ".html", ".php", ".bat", ".jar"];

const baseName = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
  { minLength: 1, maxLength: 12 }
);

/** Randomly mangle the case of a string; the allow-list match is case-insensitive. */
function mangleCase(str, seedBits) {
  let out = "";
  for (let i = 0; i < str.length; i += 1) {
    out += (seedBits >> (i % 31)) & 1 ? str[i].toUpperCase() : str[i].toLowerCase();
  }
  return out;
}

// "type" dimension: an allowed MIME (possibly case-mangled) or a disallowed one.
const allowedTypeArb = fc
  .tuple(fc.constantFrom(...UPLOADS.allowedMediaTypes), fc.integer({ min: 0, max: 2 ** 30 }))
  .map(([mime, bits]) => ({ kind: "allowed", mimetype: mangleCase(mime, bits) }));
const disallowedTypeArb = fc
  .constantFrom(...DISALLOWED_MIME)
  .map((mime) => ({ kind: "disallowed", mimetype: mime }));
const typeArb = fc.oneof(allowedTypeArb, disallowedTypeArb);

// "extension" dimension: a safe extension or an executable/script one.
const safeExtArb = fc.constantFrom(...SAFE_EXT).map((ext) => ({ kind: "safe", ext }));
const execExtArb = fc.constantFrom(...EXEC_EXT).map((ext) => ({ kind: "exec", ext }));
const extArb = fc.oneof(safeExtArb, execExtArb);

// "size" dimension: within the limit (inclusive) or strictly over it.
const okSizeArb = fc.integer({ min: 0, max: MAX_BYTES }).map((size) => ({ kind: "ok", size }));
const overSizeArb = fc
  .integer({ min: MAX_BYTES + 1, max: MAX_BYTES * 2 })
  .map((size) => ({ kind: "over", size }));
const sizeArb = fc.oneof(okSizeArb, overSizeArb);

describe("Property 35: Upload validation enforces type and size", () => {
  it("accepts iff type is allowed AND not executable AND within the size limit", () => {
    fc.assert(
      fc.property(typeArb, extArb, sizeArb, baseName, (type, ext, size, name) => {
        const file = {
          originalname: `${name}${ext.ext}`,
          mimetype: type.mimetype,
          // Use the `size` field (no buffer) so validateUpload reads the size
          // directly without allocating multi-megabyte buffers.
          size: size.size,
        };

        const shouldAccept =
          type.kind === "allowed" && ext.kind === "safe" && size.kind === "ok";

        if (shouldAccept) {
          expect(() => service.validateUpload(file)).not.toThrow();
        } else {
          expect(() => service.validateUpload(file)).toThrow(MediaValidationError);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("rejects every disallowed type regardless of size, and accepts allowed types at the size boundary", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DISALLOWED_MIME),
        fc.integer({ min: 0, max: MAX_BYTES }),
        baseName,
        (mimetype, size, name) => {
          // Disallowed type with a safe extension and OK size is still rejected (Req 23.1).
          expect(() =>
            service.validateUpload({ originalname: `${name}.png`, mimetype, size })
          ).toThrow(MediaValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects oversized uploads even when the type is allowed (Req 23.3)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...UPLOADS.allowedMediaTypes),
        fc.integer({ min: MAX_BYTES + 1, max: MAX_BYTES * 2 }),
        baseName,
        (mimetype, size, name) => {
          let error;
          try {
            service.validateUpload({ originalname: `${name}.png`, mimetype, size });
          } catch (e) {
            error = e;
          }
          expect(error).toBeInstanceOf(MediaValidationError);
          expect(error.statusCode).toBe(413);
        }
      ),
      { numRuns: 100 }
    );
  });
});
