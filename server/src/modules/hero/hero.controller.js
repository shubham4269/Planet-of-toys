// server/src/modules/hero/hero.controller.js
import * as hero from "./hero.service.js";

/** Thin HTTP layer over the hero service. Errors forwarded to the central handler. */
export function createHeroController() {
  const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };
  return {
    publicSlides: wrap(async (_req, res) => res.json({ slides: await hero.getPublicSlides(new Date()) })),

    list: wrap(async (req, res) => res.json({ slides: await hero.listSlides({ includeDeleted: req.query.includeDeleted === "true" }) })),
    get: wrap(async (req, res) => res.json({ slide: await hero.getSlideById(req.params.id) })),
    create: wrap(async (req, res) => res.status(201).json({ slide: await hero.createSlide(req.body ?? {}) })),
    update: wrap(async (req, res) => res.json({ slide: await hero.updateSlide(req.params.id, req.body ?? {}) })),
    setActive: wrap(async (req, res) => res.json({ slide: await hero.setActive(req.params.id, req.body?.active) })),
    softDelete: wrap(async (req, res) => res.json({ slide: await hero.softDelete(req.params.id) })),
    restore: wrap(async (req, res) => res.json({ slide: await hero.restore(req.params.id) })),
    reorder: wrap(async (req, res) => res.json({ slides: await hero.reorder(req.body?.items ?? req.body ?? []) })),
  };
}

export default createHeroController;
