import crypto from "node:crypto";
import Razorpay from "razorpay";
import { getCredential } from "../../modules/settings/credential.service.js";

/**
 * Payment Service — Razorpay integration (Req 5).
 *
 * Responsibilities:
 *  - Create a Razorpay order for an order total amount, returning only the
 *    Razorpay order identifier and amount to the frontend. The Razorpay key
 *    secret is NEVER included in any value returned from this service
 *    (Req 5.1, 5.5).
 *  - Verify a Razorpay payment signature entirely on the server using
 *    HMAC-SHA256 over `order_id + "|" + payment_id` keyed with the Razorpay
 *    key secret (Req 5.2, 5.5).
 *
 * Both Razorpay credentials are resolved server-side via the credential
 * service (`getCredential('razorpay', ...)`), which prefers encrypted
 * System_Settings and falls back to environment variables. The key secret is
 * used only here, on the Backend, and is excluded from all responses.
 *
 * The Razorpay client constructor is injectable (`options.razorpayFactory`) so
 * the SDK — and its network calls — can be mocked in tests without contacting
 * the live Razorpay API.
 */

/** Raised when Razorpay configuration is incomplete on the server. */
export class PaymentConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

/** Raised when the caller supplies an invalid payment amount. */
export class PaymentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

/**
 * Default factory that constructs the real Razorpay SDK client.
 * @param {{ keyId: string, keySecret: string }} credentials
 * @returns {import("razorpay")} a Razorpay client instance
 */
function defaultRazorpayFactory({ keyId, keySecret }) {
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Validate that `amount` is a positive integer in the smallest currency unit
 * (e.g. paise for INR), as required by the Razorpay Orders API.
 *
 * @param {unknown} amount
 * @returns {number} the validated amount
 */
function validateAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new PaymentValidationError("amount must be a finite number.");
  }
  if (!Number.isInteger(amount)) {
    throw new PaymentValidationError(
      "amount must be an integer in the smallest currency unit (e.g. paise)."
    );
  }
  if (amount <= 0) {
    throw new PaymentValidationError("amount must be greater than zero.");
  }
  return amount;
}

/**
 * Create a Razorpay order for the given amount (Req 5.1).
 *
 * The returned object contains only non-secret fields needed by the frontend
 * to open the Razorpay checkout: the Razorpay order id, the amount, the
 * currency, and the public key id. The key secret is never returned (Req 5.5).
 *
 * @param {object} input
 * @param {number} input.amount amount in the smallest currency unit (paise)
 * @param {string} [input.currency="INR"] ISO currency code
 * @param {string} [input.receipt] optional merchant receipt reference
 * @param {object} [options]
 * @param {(c: {keyId: string, keySecret: string}) => any} [options.razorpayFactory]
 *   factory used to build the Razorpay client (injectable for tests)
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @returns {Promise<{ razorpayOrderId: string, amount: number, currency: string, keyId: string }>}
 */
export async function createRazorpayOrder(
  input = {},
  { razorpayFactory = defaultRazorpayFactory, env = process.env } = {}
) {
  const { amount, currency = "INR", receipt } = input;
  const validatedAmount = validateAmount(amount);

  const keyId = await getCredential("razorpay", "keyId", { env });
  const keySecret = await getCredential("razorpay", "keySecret", { env });
  if (!keyId || !keySecret) {
    throw new PaymentConfigError(
      "Razorpay credentials are not configured on the server."
    );
  }

  const client = razorpayFactory({ keyId, keySecret });
  const order = await client.orders.create({
    amount: validatedAmount,
    currency,
    ...(receipt ? { receipt } : {}),
  });

  // Project only non-secret fields. The key secret is intentionally excluded
  // from every value this function returns (Req 5.5). keyId is the public
  // publishable key the frontend needs to open Razorpay checkout.
  return {
    razorpayOrderId: order.id,
    amount: order.amount,
    currency: order.currency ?? currency,
    keyId,
  };
}

/**
 * Issue a full refund for a captured Razorpay payment.
 *
 * Used by the Order_Service when an administrator cancels a PAID online
 * order. The amount is supplied in the smallest currency unit (paise) and the
 * refund is issued at normal speed. Only non-secret fields are returned; the
 * key secret never leaves this module (Req 5.5).
 *
 * @param {string} paymentId the Razorpay payment id to refund
 * @param {number} amount refund amount in paise
 * @param {object} [options]
 * @param {(c: {keyId: string, keySecret: string}) => any} [options.razorpayFactory]
 *   factory used to build the Razorpay client (injectable for tests)
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @returns {Promise<{ refundId: string, paymentId: string, amount: number, status: string }>}
 */
export async function refundPayment(
  paymentId,
  amount,
  { razorpayFactory = defaultRazorpayFactory, env = process.env } = {}
) {
  if (typeof paymentId !== "string" || paymentId.trim() === "") {
    throw new PaymentValidationError("paymentId is required for a refund.");
  }
  const validatedAmount = validateAmount(amount);

  const keyId = await getCredential("razorpay", "keyId", { env });
  const keySecret = await getCredential("razorpay", "keySecret", { env });
  if (!keyId || !keySecret) {
    throw new PaymentConfigError(
      "Razorpay credentials are not configured on the server."
    );
  }

  const client = razorpayFactory({ keyId, keySecret });
  const refund = await client.payments.refund(paymentId, {
    amount: validatedAmount,
  });

  return {
    refundId: refund.id,
    paymentId,
    amount: refund.amount ?? validatedAmount,
    status: refund.status ?? "processed",
  };
}

/**
 * Verify a Razorpay payment signature on the server (Req 5.2, 5.5).
 *
 * Computes `HMAC_SHA256(orderId + "|" + paymentId, keySecret)` as a lowercase
 * hex digest and compares it to the supplied signature using a constant-time
 * comparison. Returns `true` only when the signatures match exactly; any
 * malformed or mismatched signature yields `false` (it never throws for a bad
 * signature).
 *
 * @param {string} orderId the Razorpay order id (`razorpay_order_id`)
 * @param {string} paymentId the Razorpay payment id (`razorpay_payment_id`)
 * @param {string} signature the signature reported by Razorpay checkout
 * @param {object} [options]
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @returns {Promise<boolean>} whether the signature is authentic
 */
export async function verifySignature(
  orderId,
  paymentId,
  signature,
  { env = process.env } = {}
) {
  const keySecret = await getCredential("razorpay", "keySecret", { env });
  if (!keySecret) {
    throw new PaymentConfigError(
      "Razorpay key secret is not configured on the server."
    );
  }

  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string"
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return timingSafeEqualHex(expected, signature);
}

/**
 * Constant-time comparison of two hex strings. Returns false (without leaking
 * via early return on length) when the candidate is not the same length as the
 * expected digest.
 *
 * @param {string} expected lowercase hex digest computed on the server
 * @param {string} candidate the signature supplied by the client
 * @returns {boolean}
 */
function timingSafeEqualHex(expected, candidate) {
  const expectedBuf = Buffer.from(expected, "utf8");
  const candidateBuf = Buffer.from(candidate, "utf8");
  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

export default { createRazorpayOrder, verifySignature, refundPayment };
