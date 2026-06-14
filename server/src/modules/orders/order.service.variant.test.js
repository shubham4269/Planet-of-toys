import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createOrderService } from "./order.service.js";
import { Order, Counter, Product } from "../models/index.js";

/**
 * Per-color inventory: order items that carry a `color` decrement the matching
 * variant's stock (atomic, guarded) instead of the product-level stock, so
 * each color variation's inventory stays accurate.
 */

function buildService(overrides = {}) {
  const whatsappService = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return createOrderService({
    whatsappService,
    verifySignature: vi.fn().mockResolvedValue(true),
    fulfilOrder: vi.fn().mockResolvedValue(undefined),
    logger,
    ...overrides,
  });
}

const customer = () => ({
  name: "Asha Rao",
  phone: "919876543210",
  email: "asha@example.com",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
});

let productSeq = 0;
async function seedVariantProduct(variants) {
  productSeq += 1;
  return Product.create({
    name: `Vario Toy ${productSeq}`,
    slug: `vario-${productSeq}-${Math.random().toString(36).slice(2, 8)}`,
    price: 799,
    stock: 99, // product-level stock must remain untouched for variant orders
    variants,
  });
}

describe("order service - variant stock decrement on createOrder", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Counter.deleteMany({});
    await Product.deleteMany({});
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("decrements only the ordered color's stock and persists the color on the order", async () => {
    const service = buildService();
    const product = await seedVariantProduct([
      { color: "Red", stock: 5 },
      { color: "Blue", stock: 3 },
    ]);

    const { order } = await service.createOrder(
      {
        customer: customer(),
        items: [
          {
            productId: product._id,
            name: product.name,
            quantity: 2,
            unitPrice: 799,
            color: "Red",
          },
        ],
        amount: 1598,
      },
      { method: "COD" },
      {}
    );

    expect(order.items[0].color).toBe("Red");

    const reloaded = await Product.findById(product._id).lean();
    expect(reloaded.variants.find((v) => v.color === "Red").stock).toBe(3);
    expect(reloaded.variants.find((v) => v.color === "Blue").stock).toBe(3);
    // Product-level stock is not touched for variant orders.
    expect(reloaded.stock).toBe(99);
  });

  it("never drives a variant's stock negative when quantity exceeds it", async () => {
    const service = buildService();
    const product = await seedVariantProduct([{ color: "Red", stock: 1 }]);

    const { order } = await service.createOrder(
      {
        customer: customer(),
        items: [
          {
            productId: product._id,
            name: product.name,
            quantity: 4,
            unitPrice: 799,
            color: "Red",
          },
        ],
        amount: 3196,
      },
      { method: "COD" },
      {}
    );

    // Order still created (decrement is best-effort)…
    expect(order.orderStatus).toBe("CONFIRMED");
    // …but the guarded decrement no-ops rather than going negative.
    const reloaded = await Product.findById(product._id).lean();
    expect(reloaded.variants[0].stock).toBe(1);
  });

  it("includes the item color in the public order serialization", async () => {
    const service = buildService();
    const product = await seedVariantProduct([{ color: "Green", stock: 2 }]);

    const { order } = await service.createOrder(
      {
        customer: customer(),
        items: [
          {
            productId: product._id,
            name: product.name,
            quantity: 1,
            unitPrice: 799,
            color: "Green",
          },
        ],
        amount: 799,
      },
      { method: "COD" },
      {}
    );

    const json = order.toJSON();
    expect(json.items[0].color).toBe("Green");
  });
});
