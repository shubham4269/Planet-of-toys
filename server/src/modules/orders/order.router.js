import { Router } from "express";
import { createOrder as defaultCreateOrder } from "./order.service.js";
import { getActiveProductBySlug as defaultGetProduct } from "../products/product.service.js";
import { verifyOtp as defaultVerifyOtp } from "./otp.service.js";
import { AppError } from "../../shared/middleware/errorHandler.js";

/**
 * Orders Router — public order endpoints (Req 5.3, 5.4, 6.2, 6.5, 9.1, 11.4).
 *
 * Mounted at `/api/orders`. Currently exposes:
 *
 *   POST /   →  Create a new order from a checkout submission.
 *
 * The route resolves the product from the submitted `slug`, builds the line
 * items, and delegates to the Order_Service's `createOrder`, which handles
 * payment verification, order persistence, WhatsApp notification, and
 * out-of-band Shiprocket fulfilment.
 *
 * For Cash-on-Delivery submissions the customer's WhatsApp OTP is verified here
 * — at the HTTP boundary — before any order is created, so a COD order is only
 * created after successful OTP verification (Req 6.2, 6.5).
 *
 * @param {object} [options]
 * @param {Function} [options.createOrderFn] injectable for tests
 * @param {Function} [options.getProductFn] injectable for tests
 * @param {Function} [options.verifyOtpFn] injectable for tests
 * @returns {import("express").Router}
 */
export function createOrdersRouter({
  createOrderFn = defaultCreateOrder,
  getProductFn = defaultGetProduct,
  verifyOtpFn = defaultVerifyOtp,
} = {}) {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const { slug, quantity = 1, color, customer, paymentMethod, razorpay, otp, utm } = req.body;

      // For Cash on Delivery, verify the WhatsApp OTP BEFORE creating the order
      // so a COD order is only ever created after successful verification
      // (Req 6.2, 6.5). Online payments are verified later via signature.
      if (paymentMethod === "COD") {
        const phone = otp?.phone ?? customer?.phone;
        const code = otp?.code;
        if (!phone || !code) {
          throw new AppError("OTP verification is required for Cash on Delivery.", 400, {
            clientMessage:
              "Please verify your phone number to place a Cash on Delivery order.",
          });
        }
        const verification = verifyOtpFn(phone, code);
        if (!verification || verification.ok !== true) {
          throw new AppError(
            `COD OTP verification failed: ${verification?.reason ?? "unknown"}`,
            400,
            {
              clientMessage:
                "That verification code is incorrect or has expired. Please try again.",
            }
          );
        }
      }

      // Resolve the product by slug so we can build the order items with
      // server-side pricing (never trust the client-supplied amount for items).
      if (!slug) {
        throw new AppError("Product slug is required.", 400, {
          clientMessage: "Something went wrong. Please try again.",
        });
      }

      const product = await getProductFn(slug);
      if (!product) {
        throw new AppError(`Product not found: ${slug}`, 404, {
          clientMessage: "This product is no longer available.",
        });
      }

      const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
      const unitPrice = Number(product.price);
      const amount = unitPrice * qty;

      // Resolve the color variation server-side: products with variants
      // require a color that matches one of them (case-insensitive), so order
      // records and per-color inventory stay accurate; products without
      // variants ignore any submitted color.
      const variants = Array.isArray(product.variants) ? product.variants : [];
      let selectedColor = null;
      if (variants.length > 0) {
        const wanted = typeof color === "string" ? color.trim().toLowerCase() : "";
        const variant = variants.find(
          (v) => String(v.color).trim().toLowerCase() === wanted
        );
        if (!variant) {
          throw new AppError(
            `Unknown or missing color for ${slug}: ${String(color)}`,
            400,
            { clientMessage: "Please select a color for this product." }
          );
        }
        selectedColor = variant.color;
      }

      const items = [
        {
          productId: product.id,
          name: product.name,
          quantity: qty,
          unitPrice,
          color: selectedColor,
        },
      ];

      // Build the payment descriptor from the request body.
      const payment = {
        method: paymentMethod,
        ...(paymentMethod === "ONLINE" && razorpay
          ? {
              razorpayOrderId: razorpay.orderId,
              razorpayPaymentId: razorpay.paymentId,
              signature: razorpay.signature,
            }
          : {}),
        ...(otp ? { otp } : {}),
      };

      const result = await createOrderFn(
        { customer, items, amount },
        payment,
        utm
      );

      return res.status(201).json({
        order: result.customer, // customer-facing projection
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export default createOrdersRouter;
