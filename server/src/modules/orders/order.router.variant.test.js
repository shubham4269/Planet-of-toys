import { describe, it, expect, vi } from "vitest";
import express from "express";

import { createOrdersRouter } from "./order.router.js";
import { errorHandler } from "../middleware/errorHandler.js";

/**
 * Color resolution at the order boundary: products with variants require a
 * submitted color matching one of them (case-insensitive, canonicalized);
 * products without variants ignore any submitted color.
 */

const CUSTOMER = {
  name: "Asha Rao",
  phone: "9876543210",
  email: "asha@example.com",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

const VARIANT_PRODUCT = {
  id: "p1",
  slug: "vario-toy",
  name: "Vario Toy",
  price: 799,
  variants: [
    { color: "Red", stock: 5, images: [] },
    { color: "Blue", stock: 0, images: [] },
  ],
};

const PLAIN_PRODUCT = {
  id: "p2",
  slug: "plain-toy",
  name: "Plain Toy",
  price: 499,
  variants: [],
};

function buildApp({ product, createOrderFn }) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/orders",
    createOrdersRouter({
      getProductFn: vi.fn().mockResolvedValue(product),
      createOrderFn,
      verifyOtpFn: vi.fn().mockReturnValue({ ok: true }),
    })
  );
  app.use(errorHandler);
  return app;
}

async function postOrder(app, body) {
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/orders`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  } finally {
    server.close();
  }
}

describe("POST /api/orders — color variants", () => {
  it("accepts a valid color and passes the canonical variant color to createOrder", async () => {
    const createOrderFn = vi.fn().mockResolvedValue({
      order: { orderId: "POT-1", toJSON: () => ({ orderId: "POT-1" }) },
      customer: CUSTOMER,
    });
    const app = buildApp({ product: VARIANT_PRODUCT, createOrderFn });

    const { status } = await postOrder(app, {
      slug: "vario-toy",
      quantity: 2,
      color: "  red ", // case/whitespace-insensitive match
      customer: CUSTOMER,
      paymentMethod: "COD",
      otp: { phone: CUSTOMER.phone, code: "123456" },
    });

    expect(status).toBe(201);
    const [input] = createOrderFn.mock.calls[0];
    expect(input.items[0]).toMatchObject({ color: "Red", quantity: 2 });
  });

  it("rejects a variant product order without a recognizable color", async () => {
    const createOrderFn = vi.fn();
    const app = buildApp({ product: VARIANT_PRODUCT, createOrderFn });

    const { status } = await postOrder(app, {
      slug: "vario-toy",
      quantity: 1,
      color: "Purple",
      customer: CUSTOMER,
      paymentMethod: "COD",
      otp: { phone: CUSTOMER.phone, code: "123456" },
    });

    expect(status).toBe(400);
    expect(createOrderFn).not.toHaveBeenCalled();
  });

  it("ignores a submitted color for products without variants", async () => {
    const createOrderFn = vi.fn().mockResolvedValue({
      order: { orderId: "POT-2", toJSON: () => ({ orderId: "POT-2" }) },
      customer: CUSTOMER,
    });
    const app = buildApp({ product: PLAIN_PRODUCT, createOrderFn });

    const { status } = await postOrder(app, {
      slug: "plain-toy",
      quantity: 1,
      color: "Red",
      customer: CUSTOMER,
      paymentMethod: "COD",
      otp: { phone: CUSTOMER.phone, code: "123456" },
    });

    expect(status).toBe(201);
    const [input] = createOrderFn.mock.calls[0];
    expect(input.items[0].color).toBeNull();
  });
});
