import { Router } from "express";
import { checkServiceability } from "../services/shipping.service.js";

/**
 * Shipping Router — public shipping endpoints (Req 4.3).
 *
 * Mounted at `/api/shipping`. Currently exposes a single route:
 *
 *   GET /serviceability?pincode=<6-digit>   →  { serviceable: boolean }
 *
 * The shipping service returns ONLY the boolean — no credentials, tokens, or
 * courier detail is ever included in the response (Req 10.4).
 *
 * @param {object} [options]
 * @param {Function} [options.checkServiceabilityFn] injectable for tests
 * @returns {import("express").Router}
 */
export function createShippingRouter({
  checkServiceabilityFn = checkServiceability,
} = {}) {
  const router = Router();

  router.get("/serviceability", async (req, res, next) => {
    try {
      const { pincode } = req.query;
      const result = await checkServiceabilityFn(pincode);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export default createShippingRouter;
