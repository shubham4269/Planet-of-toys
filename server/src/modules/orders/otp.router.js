import { Router } from "express";

import { requestOtp as defaultRequestOtp } from "./otp.service.js";
import { sendOtp as defaultSendOtp } from "../../integrations/whatsapp/whatsapp.service.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

/**
 * OTP Router — Cash-on-Delivery phone verification (Req 6.1, 7.4, 28.2).
 *
 * Mounted at `/api/otp`. Exposes:
 *
 *   POST /request   →  { ok: true }   (generate + WhatsApp-deliver an OTP)
 *
 * The handler asks the OTP_Manager for a code (which enforces the per-phone
 * sliding-window rate limit) and, on success, delivers it to the customer via
 * the WhatsApp_Service. The generated code is NEVER included in the response —
 * it is only sent over WhatsApp (Req 6.1). When the per-phone limit is
 * exceeded, a generic 429 is returned with no internal detail (Req 7.4, 28.2).
 *
 * Both collaborators are injectable for testing.
 *
 * @param {object} [options]
 * @param {(phone: string) => object} [options.requestOtpFn]
 * @param {(phone: string, code: string) => Promise<object>} [options.sendOtpFn]
 * @returns {import("express").Router}
 */
export function createOtpRouter({
  requestOtpFn = defaultRequestOtp,
  sendOtpFn = defaultSendOtp,
} = {}) {
  const router = Router();

  router.post("/request", async (req, res, next) => {
    try {
      const phone =
        typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
      if (!phone) {
        throw new AppError("A phone number is required to request an OTP.", 400, {
          clientMessage: "Please enter a valid phone number.",
        });
      }

      const result = requestOtpFn(phone);
      if (!result.ok) {
        // Rate-limited: generic 429, no internal detail (Req 7.4, 28.2, 27).
        return res
          .status(429)
          .json({ error: "Too many verification requests. Please try again later." });
      }

      // Deliver the code over WhatsApp only — never echo it to the client
      // (Req 6.1). The WhatsApp service is non-blocking and never throws.
      await sendOtpFn(phone, result.code);

      return res.status(200).json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export default createOtpRouter;
