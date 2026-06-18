import { Router } from "express";
import { createRazorpayOrderHandler } from "./payment.controller.js";

/**
 * Payment router (Req 5.1).
 *
 * Mounted at `/api/payment` (see ROUTER_MOUNTS in app.js). Exposes Razorpay
 * order creation. Signature verification is performed server-side by the
 * Payment service as part of order creation flows and is not exposed as its
 * own public endpoint.
 *
 * @returns {import("express").Router}
 */
export function createPaymentRouter() {
  const router = Router();

  // POST /api/payment/razorpay-order
  router.post("/razorpay-order", createRazorpayOrderHandler);

  return router;
}

export default createPaymentRouter;
