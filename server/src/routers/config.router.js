import { Router } from "express";

import { getCredential } from "../services/credential.service.js";

/**
 * Public storefront configuration router.
 *
 * Mounted at `/api/config` (see ROUTER_MOUNTS in app.js). Exposes ONLY values
 * that are public by nature so the customer-facing app can pick them up at
 * runtime instead of at build time:
 *
 *   GET / -> { metaPixelId: string|null }
 *
 * The Meta Pixel ID is embedded in the page source of every site that runs the
 * pixel, so serving it unauthenticated leaks nothing. It resolves through the
 * credential service (admin System Settings first, `META_PIXEL_ID` env
 * fallback — Req 29.2), which means an admin updating the pixel id in Settings
 * takes effect on the storefront without a rebuild. No secret may EVER be
 * added to this router's responses.
 *
 * @param {object} [options]
 * @param {() => Promise<string|null>} [options.resolvePixelId]
 *   credential resolver override for tests; defaults to the credential service
 * @returns {import("express").Router}
 */
export function createConfigRouter({ resolvePixelId } = {}) {
  const getPixelId =
    typeof resolvePixelId === "function"
      ? resolvePixelId
      : () => getCredential("metaPixel", "pixelId");

  const router = Router();

  router.get("/", async (_req, res) => {
    let metaPixelId = null;
    try {
      metaPixelId = await getPixelId();
    } catch {
      // Resolution failure (e.g. DB unavailable) degrades to "no pixel";
      // tracking is never worth failing the storefront over.
      metaPixelId = null;
    }
    res.json({ metaPixelId: metaPixelId || null });
  });

  return router;
}

export default createConfigRouter;
