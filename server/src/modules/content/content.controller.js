/**
 * Content controller — thin HTTP layer over the content service. Shapes
 * responses as `{ banner }` and forwards errors to the central error handler.
 *
 * @param {{ getPromoBanner: Function, updatePromoBanner: Function, getPublicPromoBanner: Function }} contentService
 */
export function createContentController(contentService) {
  /** GET /api/admin/content/promo-banner — full banner for the editor. */
  async function getPromoBanner(_req, res, next) {
    try {
      const banner = await contentService.getPromoBanner();
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/admin/content/promo-banner — validate + persist. */
  async function updatePromoBanner(req, res, next) {
    try {
      const banner = await contentService.updatePromoBanner(req.body ?? {});
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/content/promo-banner — public, filtered banner. */
  async function getPublicPromoBanner(_req, res, next) {
    try {
      const banner = await contentService.getPublicPromoBanner({ now: new Date() });
      res.json({ banner });
    } catch (err) {
      next(err);
    }
  }

  return { getPromoBanner, updatePromoBanner, getPublicPromoBanner };
}

export default createContentController;
