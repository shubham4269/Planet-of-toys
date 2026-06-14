import { MediaValidationError } from "../services/media.service.js";

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

export default createUploadHandler;
