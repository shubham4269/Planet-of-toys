import {
  createRazorpayOrder,
  PaymentValidationError,
} from "../../integrations/razorpay/payment.service.js";

/**
 * Payment controller (Req 5.1, 5.5).
 *
 * Shapes sanitized HTTP responses around the Payment service. It never returns
 * the Razorpay key secret or any other credential to the frontend; the service
 * already projects only non-secret fields.
 */

/** Rupees-to-paise conversion factor for INR (smallest currency unit). */
const PAISE_PER_RUPEE = 100;

/**
 * POST /api/payment/razorpay-order
 *
 * Body: `{ amount: number, currency?: string, receipt?: string }`, where
 * `amount` is the order total in the major currency unit (e.g. rupees). The
 * controller converts it to the smallest unit (paise) that Razorpay expects.
 *
 * Responds with `{ razorpayOrderId, amount, currency, keyId }` — the Razorpay
 * order id and amount with no secrets (Req 5.5).
 */
export async function createRazorpayOrderHandler(req, res, next) {
  try {
    const { amount, currency, receipt } = req.body ?? {};

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "A positive numeric amount is required." });
    }

    // Convert the major-unit amount to the smallest currency unit and guard
    // against floating-point drift before handing it to the service.
    const amountInSubunit = Math.round(amount * PAISE_PER_RUPEE);

    const order = await createRazorpayOrder(
      { amount: amountInSubunit, currency, receipt },
      { env: process.env }
    );

    return res.status(201).json(order);
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return res.status(400).json({ error: "Invalid payment amount." });
    }
    // Delegate unexpected errors to the central error handler (Req 27).
    return next(error);
  }
}

export default { createRazorpayOrderHandler };
