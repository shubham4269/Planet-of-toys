import { describe, it, expect, vi } from "vitest";

import { createWebhookService } from "./webhook.service.js";

/**
 * Razorpay payment reconciliation (processRazorpayEvent).
 *
 * Orders are normally created already-PAID by the synchronous checkout flow;
 * this handler is the safety net for payments whose verification never
 * completed and for failure events. Collaborators are injected so no database
 * is required.
 */

const NOW_SECONDS = Math.floor(Date.now() / 1000);

function capturedEvent({ orderId = "order_rzp_1", createdAt = NOW_SECONDS } = {}) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_1",
          order_id: orderId,
          status: "captured",
          created_at: createdAt,
        },
      },
    },
  };
}

function failedEvent({ orderId = "order_rzp_1" } = {}) {
  return {
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_1",
          order_id: orderId,
          status: "failed",
          error_reason: "payment_declined",
        },
      },
    },
  };
}

function makeOrder({ paymentStatus = "PENDING", paymentId = null } = {}) {
  return {
    orderId: "POT-240101-0001",
    paymentStatus,
    razorpay: { orderId: "order_rzp_1", paymentId },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function buildService({ order = null, unmatchedModel } = {}) {
  const orderModel = { findOne: vi.fn().mockResolvedValue(order) };
  const unmatched = unmatchedModel ?? { create: vi.fn() };
  const service = createWebhookService({
    orderModel,
    unmatchedModel: unmatched,
    applyStatusChange: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  return { service, orderModel, unmatched };
}

describe("processRazorpayEvent", () => {
  it("marks a matching unpaid order PAID and backfills the payment id", async () => {
    const order = makeOrder({ paymentStatus: "PENDING" });
    const { service, orderModel } = buildService({ order });

    const result = await service.processRazorpayEvent(capturedEvent());

    expect(orderModel.findOne).toHaveBeenCalledWith({
      "razorpay.orderId": "order_rzp_1",
    });
    expect(order.paymentStatus).toBe("PAID");
    expect(order.razorpay.paymentId).toBe("pay_1");
    expect(order.save).toHaveBeenCalled();
    expect(result).toMatchObject({ status: "updated", paymentStatus: "PAID" });
  });

  it("ignores a captured event for an already-PAID order (idempotent)", async () => {
    const order = makeOrder({ paymentStatus: "PAID", paymentId: "pay_1" });
    const { service } = buildService({ order });

    const result = await service.processRazorpayEvent(capturedEvent());

    expect(order.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ignored" });
  });

  it("reports unmatched without recording for a fresh captured payment (verify race)", async () => {
    const { service, unmatched } = buildService({ order: null });

    const result = await service.processRazorpayEvent(
      capturedEvent({ createdAt: NOW_SECONDS })
    );

    expect(result).toMatchObject({ status: "unmatched" });
    expect(unmatched.create).not.toHaveBeenCalled();
  });

  it("records an unmatched event once a captured payment is past the grace window", async () => {
    const { service, unmatched } = buildService({ order: null });

    const result = await service.processRazorpayEvent(
      capturedEvent({ createdAt: NOW_SECONDS - 10 * 60 })
    );

    expect(result).toMatchObject({ status: "unmatched" });
    expect(unmatched.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Razorpay payment captured with no matching order.",
      })
    );
  });

  it("marks a matching non-PAID order FAILED on payment.failed", async () => {
    const order = makeOrder({ paymentStatus: "PENDING" });
    const { service } = buildService({ order });

    const result = await service.processRazorpayEvent(failedEvent());

    expect(order.paymentStatus).toBe("FAILED");
    expect(order.save).toHaveBeenCalled();
    expect(result).toMatchObject({ status: "updated", paymentStatus: "FAILED" });
  });

  it("never downgrades a PAID order on a late failure event", async () => {
    const order = makeOrder({ paymentStatus: "PAID", paymentId: "pay_1" });
    const { service } = buildService({ order });

    const result = await service.processRazorpayEvent(failedEvent());

    expect(order.paymentStatus).toBe("PAID");
    expect(order.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ignored" });
  });

  it("ignores a failure event with no matching order (the expected case)", async () => {
    const { service, unmatched } = buildService({ order: null });

    const result = await service.processRazorpayEvent(failedEvent());

    expect(result).toMatchObject({ status: "ignored" });
    expect(unmatched.create).not.toHaveBeenCalled();
  });

  it("ignores unrelated event types without touching orders", async () => {
    const { service, orderModel } = buildService({ order: null });

    const result = await service.processRazorpayEvent({
      event: "refund.created",
      payload: {},
    });

    expect(result).toMatchObject({ status: "ignored" });
    expect(orderModel.findOne).not.toHaveBeenCalled();
  });
});
