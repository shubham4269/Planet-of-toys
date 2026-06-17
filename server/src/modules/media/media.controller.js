import { MediaValidationError } from "./media.service.js";

/**
 * Media controller (Req 18, 23).
 *
 * Thin HTTP layer over the Media Service: it shapes the multipart upload
 * request into a service call and returns a sanitized response that exposes
 * only the stored filename and public URL — never filesystem paths or other
 * internal detail (Req 27.4). All validation and persistence live in the
 * service.
 */

/**
 * Build the upload request handler bound to a media service instance.
 *
 * Expects a single file on `req.file` (populated by multer's `single("file")`
 * memory-storage middleware upstream in the router).
 *
 * @param {{ processUpload: Function }} mediaService
 * @returns {import("express").RequestHandler}
 */
export function createUploadHandler(mediaService) {
  return async function uploadMedia(req, res, next) {
    try {
      if (!req.file) {
        throw new MediaValidationError("No file was provided for upload.", 400);
      }

      const stored = await mediaService.processUpload(req.file);

      // Return only client-safe fields. The absolute filesystem path is
      // deliberately excluded from the response (Req 27.4).
      res.status(201).json({
        media: {
          filename: stored.filename,
          url: stored.url,
          mimeType: stored.mimeType,
          size: stored.size,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Build the media-library list handler bound to a media library service.
 * Maps `?q=&type=&filter=` query params to the service call.
 *
 * @param {{ listMedia: Function }} mediaLibraryService
 * @returns {import("express").RequestHandler}
 */
export function createListHandler(mediaLibraryService) {
  return async function listMedia(req, res, next) {
    try {
      const { q = "", type = "all", filter = "all" } = req.query;
      const { items, summary } = await mediaLibraryService.listMedia({ q, type, filter });
      res.status(200).json({ items, summary });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Build the media-library delete handler. Returns 200 on success, 409 with a
 * `usedBy` payload when the file is referenced, 400 for an invalid name, and
 * 404 when the file is missing — using the status carried by MediaLibraryError.
 *
 * @param {{ deleteMedia: Function }} mediaLibraryService
 * @returns {import("express").RequestHandler}
 */
export function createDeleteHandler(mediaLibraryService) {
  return async function deleteMedia(req, res, next) {
    try {
      const result = await mediaLibraryService.deleteMedia(req.params.filename);
      res.status(200).json(result);
    } catch (err) {
      if (err && err.name === "MediaLibraryError") {
        const body = { error: { message: err.message, status: err.status } };
        if (err.usedBy) body.usedBy = err.usedBy;
        return res.status(err.status).json(body);
      }
      next(err);
    }
  };
}

export default createUploadHandler;
