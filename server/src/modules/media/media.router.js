import { Router } from "express";
import express from "express";
import multer from "multer";
import { createMediaService, MediaValidationError } from "./media.service.js";
import { createMediaLibraryService } from "./mediaLibrary.service.js";
import { createUploadHandler, createListHandler, createDeleteHandler } from "./media.controller.js";

/**
 * Media router (Req 18, 23).
 *
 * Exposes:
 *  - `POST /` — authenticated media upload. Uses multer in-memory storage so
 *    the Media Service can validate the file type/size and transcode images to
 *    WebP BEFORE anything is written to disk (Req 18.2, 23.1–23.4). Intended to
 *    be mounted behind the admin auth guard (e.g. at `/api/admin/media`).
 *  - `GET /:filename` — static, non-executing delivery of stored media. Files
 *    are served as inert static data with headers that prevent MIME sniffing
 *    and in-browser script execution (Req 18.1, 23.5). Intended to be mounted
 *    at the public media base (e.g. `/api/media`).
 *
 * Both surfaces are produced by separate factories so wiring can mount the
 * authenticated upload and the public serving at their respective base paths,
 * and a combined factory is provided for convenience.
 */

/** No-op middleware used when no auth guard is injected (tests / wiring). */
const passthrough = (req, res, next) => next();

/**
 * Translate multer's own errors (notably the file-size limit) into the
 * service's {@link MediaValidationError} so the central error handler returns a
 * consistent, client-safe response (Req 23.3).
 *
 * @param {import("express").RequestHandler} uploadMiddleware
 * @returns {import("express").RequestHandler}
 */
function wrapMulter(uploadMiddleware) {
  return function handleUpload(req, res, next) {
    uploadMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new MediaValidationError("File exceeds the maximum allowed size.", 413)
          );
        }
        return next(new MediaValidationError("Invalid file upload.", 400));
      }
      return next(err);
    });
  };
}

/**
 * Create the authenticated upload router.
 *
 * @param {object} options
 * @param {ReturnType<typeof createMediaService>} options.mediaService
 * @param {import("express").RequestHandler} [options.requireAuth] auth guard.
 * @returns {import("express").Router}
 */
export function createMediaUploadRouter({ mediaService, mediaLibraryService, requireAuth = passthrough }) {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: mediaService.getMaxUploadBytes() || undefined },
  });

  router.post(
    "/",
    requireAuth,
    wrapMulter(upload.single("file")),
    createUploadHandler(mediaService)
  );

  // Admin Media Library: list + guarded delete. Additive — only registered when
  // a library service is supplied (it queries catalog/hero models for usage).
  if (mediaLibraryService) {
    router.get("/", requireAuth, createListHandler(mediaLibraryService));
    router.delete("/:filename", requireAuth, createDeleteHandler(mediaLibraryService));
  }

  return router;
}

/**
 * Set static-serving response headers that keep media inert: prevent MIME
 * sniffing and disable script execution / embedding (Req 23.5).
 *
 * @param {import("express").Response} res
 */
function setStaticHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", "inline");
  // Allow the frontend (different origin in dev) to load media resources.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

/**
 * Create the public, static media-serving router.
 *
 * @param {object} options
 * @param {ReturnType<typeof createMediaService>} options.mediaService
 * @returns {import("express").Router}
 */
export function createMediaServeRouter({ mediaService }) {
  const router = Router();

  router.use(
    express.static(mediaService.getMediaDir(), {
      index: false,
      // Never run extension resolution or execute content; serve as-is.
      setHeaders: setStaticHeaders,
    })
  );

  return router;
}

/**
 * Convenience factory that builds a media service (if one is not supplied) and
 * returns both the upload and serving routers wired and ready to mount.
 *
 * @param {object} [options]
 * @param {{ allowedMediaTypes: string[], maxUploadSizeMb: number }} [options.uploads]
 * @param {ReturnType<typeof createMediaService>} [options.mediaService]
 * @param {string} [options.mediaDir]
 * @param {import("express").RequestHandler} [options.requireAuth]
 * @returns {{
 *   mediaService: ReturnType<typeof createMediaService>,
 *   uploadRouter: import("express").Router,
 *   serveRouter: import("express").Router
 * }}
 */
export function createMediaRouters({
  uploads,
  mediaService,
  mediaDir,
  requireAuth = passthrough,
} = {}) {
  const service =
    mediaService || createMediaService({ uploads, mediaDir });

  const library = createMediaLibraryService({ getMediaDir: service.getMediaDir });

  return {
    mediaService: service,
    mediaLibraryService: library,
    uploadRouter: createMediaUploadRouter({ mediaService: service, mediaLibraryService: library, requireAuth }),
    serveRouter: createMediaServeRouter({ mediaService: service }),
  };
}

export default createMediaRouters;
