import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Media Service (Req 18, 23).
 *
 * Responsibilities:
 *  - Validate uploaded files against the configured set of allowed media types
 *    BEFORE accepting them, rejecting executables and unsupported formats
 *    (Req 23.1, 23.2).
 *  - Reject files that exceed the configured maximum upload size (Req 23.3).
 *  - Assign a unique filename so existing stored files are never overwritten
 *    (Req 23.4).
 *  - Transcode uploaded images to WebP via Sharp before they are stored/served
 *    (Req 18.2).
 *  - Store all media on the local server filesystem under `/server/media`,
 *    never using third-party object storage (Req 18.1, 18.3).
 *
 * Static, non-executing serving of stored media is handled by the media router
 * (`media.router.js`); this service only validates, transcodes, and persists.
 *
 * The pure helpers (`isAllowedMediaType`, `isExecutableUpload`,
 * `generateUniqueFilename`, `classifyMedia`) are exported so the validation and
 * naming behavior can be unit/property tested without touching the filesystem.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default media storage directory: `<repo>/server/media` (Req 18.1). */
export const DEFAULT_MEDIA_DIR = path.resolve(__dirname, "..", "..", "media");

/**
 * File extensions that denote executable or otherwise script-bearing content.
 * Any upload whose original name carries one of these extensions is rejected
 * outright, independent of its declared MIME type (Req 23.2). SVG/HTML are
 * included because they can embed executable script.
 */
export const EXECUTABLE_EXTENSIONS = Object.freeze(
  new Set([
    ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".cpl",
    ".dll", ".bin", ".sys", ".vbs", ".vbe", ".js", ".mjs", ".cjs",
    ".jse", ".ws", ".wsf", ".ps1", ".psm1", ".sh", ".bash", ".zsh",
    ".jar", ".app", ".deb", ".rpm", ".apk", ".php", ".phtml", ".py",
    ".rb", ".pl", ".cgi", ".asp", ".aspx", ".jsp", ".htaccess",
    ".html", ".htm", ".xhtml", ".svg",
  ])
);

/**
 * Canonical, safe file extension for each supported MIME type. Images are all
 * transcoded to WebP, so their stored extension is always `.webp` regardless of
 * the source format.
 */
const MIME_EXTENSION = Object.freeze({
  "image/jpeg": ".webp",
  "image/jpg": ".webp",
  "image/png": ".webp",
  "image/webp": ".webp",
  "image/gif": ".webp",
  "image/avif": ".webp",
  "image/tiff": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
});

/** Error thrown when an upload fails validation. Carries an HTTP status. */
export class MediaValidationError extends Error {
  /**
   * @param {string} message client-safe explanation of the rejection
   * @param {number} [statusCode=400] HTTP status to surface to the caller
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "MediaValidationError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.clientMessage = message;
  }
}

/**
 * True when `mimeType` is included in the configured allow-list (Req 23.1).
 *
 * @param {string} mimeType
 * @param {string[]} allowedTypes
 * @returns {boolean}
 */
export function isAllowedMediaType(mimeType, allowedTypes) {
  if (typeof mimeType !== "string" || mimeType.trim() === "") return false;
  const normalized = mimeType.trim().toLowerCase();
  return allowedTypes.some((type) => String(type).trim().toLowerCase() === normalized);
}

/**
 * True when the original filename carries an executable/script extension that
 * must be rejected regardless of declared MIME type (Req 23.2).
 *
 * @param {string} originalName
 * @returns {boolean}
 */
export function isExecutableUpload(originalName) {
  if (typeof originalName !== "string") return false;
  const ext = path.extname(originalName).toLowerCase();
  return EXECUTABLE_EXTENSIONS.has(ext);
}

/**
 * Whether a MIME type denotes an image (and therefore must be transcoded to
 * WebP before storage; Req 18.2).
 *
 * @param {string} mimeType
 * @returns {boolean}
 */
export function isImageType(mimeType) {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
}

/**
 * Resolve the safe stored extension for a MIME type, falling back to the MIME
 * subtype when the type is not in the explicit map.
 *
 * @param {string} mimeType
 * @returns {string} extension including the leading dot
 */
function extensionForMime(mimeType) {
  const normalized = String(mimeType).trim().toLowerCase();
  if (MIME_EXTENSION[normalized]) return MIME_EXTENSION[normalized];
  const subtype = normalized.split("/")[1];
  return subtype ? `.${subtype.replace(/[^a-z0-9]/g, "")}` : ".bin";
}

/**
 * Classify an upload into the kind of processing it needs and the extension it
 * will be stored under.
 *
 * @param {string} mimeType
 * @returns {{ isImage: boolean, extension: string }}
 */
export function classifyMedia(mimeType) {
  return {
    isImage: isImageType(mimeType),
    extension: extensionForMime(mimeType),
  };
}

/**
 * Generate a collision-resistant unique filename so an accepted upload never
 * overwrites an existing stored file (Req 23.4). The name combines a timestamp
 * and a random UUID with the resolved safe extension.
 *
 * @param {string} extension extension including the leading dot
 * @returns {string}
 */
export function generateUniqueFilename(extension) {
  const ext = extension && extension.startsWith(".") ? extension : `.${extension || "bin"}`;
  return `${Date.now()}-${randomUUID()}${ext}`;
}

/**
 * Create a Media Service bound to a storage directory and upload configuration.
 *
 * @param {object} [options]
 * @param {{ allowedMediaTypes: string[], maxUploadSizeMb: number }} options.uploads
 *   Upload configuration (typically `config.uploads`).
 * @param {string} [options.mediaDir=DEFAULT_MEDIA_DIR] storage directory.
 * @param {typeof sharp} [options.imageProcessor=sharp] injectable Sharp for tests.
 */
export function createMediaService({
  uploads,
  mediaDir = DEFAULT_MEDIA_DIR,
  imageProcessor = sharp,
} = {}) {
  if (!uploads || !Array.isArray(uploads.allowedMediaTypes)) {
    throw new TypeError("createMediaService requires uploads.allowedMediaTypes");
  }

  const allowedTypes = uploads.allowedMediaTypes;
  const maxBytes = Math.max(0, Number(uploads.maxUploadSizeMb) || 0) * 1024 * 1024;

  /** Absolute storage directory for stored media. */
  function getMediaDir() {
    return mediaDir;
  }

  /** The configured maximum upload size in bytes. */
  function getMaxUploadBytes() {
    return maxBytes;
  }

  /** Ensure the storage directory exists before writing to it. */
  async function ensureMediaDir() {
    await fs.mkdir(mediaDir, { recursive: true });
  }

  /**
   * Validate an upload's type, executable status, and size WITHOUT writing
   * anything. Throws {@link MediaValidationError} on rejection (Req 23.1–23.3).
   *
   * @param {{ originalname: string, mimetype: string, size?: number, buffer?: Buffer }} file
   */
  function validateUpload(file) {
    if (!file || (!file.buffer && file.size == null)) {
      throw new MediaValidationError("No file was provided for upload.", 400);
    }

    // Reject executables/script-bearing files outright (Req 23.2).
    if (isExecutableUpload(file.originalname)) {
      throw new MediaValidationError(
        "Executable and script files are not allowed.",
        415
      );
    }

    // Validate declared type against the configured allow-list (Req 23.1, 23.2).
    if (!isAllowedMediaType(file.mimetype, allowedTypes)) {
      throw new MediaValidationError(
        "Unsupported media type. Allowed types: " + allowedTypes.join(", ") + ".",
        415
      );
    }

    // Enforce the configured maximum size (Req 23.3).
    const size = file.buffer ? file.buffer.length : Number(file.size) || 0;
    if (maxBytes > 0 && size > maxBytes) {
      throw new MediaValidationError(
        `File exceeds the maximum allowed size of ${uploads.maxUploadSizeMb} MB.`,
        413
      );
    }
  }

  /**
   * Validate, (transcode if image), and persist an uploaded file to disk under
   * the media directory with a unique filename.
   *
   * @param {{ originalname: string, mimetype: string, buffer: Buffer, size?: number }} file
   *   An in-memory uploaded file (e.g. from `multer.memoryStorage()`).
   * @returns {Promise<{
   *   filename: string,
   *   path: string,
   *   url: string,
   *   mimeType: string,
   *   size: number,
   *   isImage: boolean
   * }>}
   */
  async function processUpload(file) {
    validateUpload(file);

    if (!Buffer.isBuffer(file.buffer)) {
      throw new MediaValidationError("Upload payload is missing or invalid.", 400);
    }

    const { isImage, extension } = classifyMedia(file.mimetype);

    // Transcode images to WebP before storage so we only ever serve optimized,
    // inert image data (Req 18.2).
    let outputBuffer = file.buffer;
    let storedMimeType = file.mimetype;
    if (isImage) {
      outputBuffer = await imageProcessor(file.buffer).webp().toBuffer();
      storedMimeType = "image/webp";
    }

    const filename = generateUniqueFilename(extension);
    const destination = path.join(mediaDir, filename);

    await ensureMediaDir();
    await fs.writeFile(destination, outputBuffer);

    return {
      filename,
      path: destination,
      url: `/api/media/${filename}`,
      mimeType: storedMimeType,
      size: outputBuffer.length,
      isImage,
    };
  }

  return Object.freeze({
    getMediaDir,
    getMaxUploadBytes,
    ensureMediaDir,
    validateUpload,
    processUpload,
  });
}

export default createMediaService;
