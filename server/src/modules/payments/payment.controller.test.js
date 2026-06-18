import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Payment service so the controller is tested in isolation, without
// resolving credentials, touching MongoDB, or contacting Razorpay. vi.mock is
// hoisted so the controller's named import binds to these mocks.
vi.mock("../../integrations/razorpay/payment.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createRazorpayOrder: vi.fn(),
  };
});

import { createRazorpayOrderHandler } from "./payment.controller.js";
import {
  createRazorpayOrder,
  PaymentValidationError,
} from "../../integrations/razorpay/payment.service.js";

/** Build a minimal Express-like res double that records status/json. */
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("payment controller - createRazorpayOrderHandler (Req 5.1, 5.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRazorpayOrder.mockResolvedValue({
      razorpayOrderId: "order_MOCK123",
      amount: 49900,
      currency: "INR",
      keyId: "rzp_test_keyid123",
    });
  });

  it("returns 201 with the Razorpay order id and amount, no secrets", async () => {
    const req = { body: { amount: 499 } };
    const res = mockRes();
    const next = vi.fn();

    await createRazorpayOrderHandler(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      razorpayOrderId: "order_MOCK123",
      amount: 49900,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("converts the major-unit amount to the smallest currency unit (paise)", async () => {
    const req = { body: { amount: 499.99 } };
    const res = mockRes();
    await createRazorpayOrderHandler(req, res, vi.fn());

    expect(createRazorpayOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 49999 }),
      expect.any(Object)
    );
  });

  it("rejects a missing amount with 400 and does not call the service", async () => {
    const req = { body: {} };
    const res = mockRes();
    await createRazorpayOrderHandler(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount with 400", async () => {
    const req = { body: { amount: -5 } };
    const res = mockRes();
    await createRazorpayOrderHandler(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("maps a PaymentValidationError to a 400 response", async () => {
    createRazorpayOrder.mockRejectedValueOnce(
      new PaymentValidationError("bad amount")
    );
    const req = { body: { amount: 10 } };
    const res = mockRes();
    await createRazorpayOrderHandler(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
  });

  it("delegates unexpected errors to the error handler", async () => {
    createRazorpayOrder.mockRejectedValueOnce(new Error("razorpay down"));
    const req = { body: { amount: 10 } };
    const res = mockRes();
    const next = vi.fn();
    await createRazorpayOrderHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
