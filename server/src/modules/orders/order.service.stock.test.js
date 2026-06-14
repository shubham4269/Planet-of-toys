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
 * Unit tests for inventory decrement on order creation.
 *
 * `createOrder` reduces each ordered product's stock by the ordered quantity
 * using an atomic, guarded `$inc` so stock never goes negative (and overselling
 * is prevented). A stock-update failure is best-effort and never blocks the
 * created order.
 */

/** Build a service with mocked external integrations for deterministic tests. */
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
async function seedProduct({ stock }) {
  productSeq += 1;
  return Product.create({
    name: `Toy ${productSeq}`,
    slug: `toy-${productSeq}-${Math.random().toString(36).slice(2, 8)}`,
    price: 499,
    stock,
  });
}

describe("order service - stock decrement on createOrder", () => {
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

  it("decrements each ordered product's stock by the ordered quantity", async () => {
    const service = buildService();
    const product = await seedProduct({ stock: 10 });

    await service.createOrder(
      {
        customer: customer(),
        items: [
          { productId: product._id, name: product.name, quantity: 3, unitPrice: 499 },
        ],
        amount: 1497,
      },
      { method: "COD" },
      {}
    );

    const reloaded = await Product.findById(product._id).lean();
    expect(reloaded.stock).toBe(7);
  });

  it("decrements multiple distinct products independently", async () => {
    const service = buildService();
    const a = await seedProduct({ stock: 5 });
    const b = await seedProduct({ stock: 8 });

    await service.createOrder(
      {
        customer: customer(),
        items: [
          { productId: a._id, name: a.name, quantity: 2, unitPrice: 499 },
          { productId: b._id, name: b.name, quantity: 5, unitPrice: 499 },
        ],
        amount: 3493,
      },
      { method: "COD" },
      {}
    );

    expect((await Product.findById(a._id).lean()).stock).toBe(3);
    expect((await Product.findById(b._id).lean()).stock).toBe(3);
  });

  it("does not drive stock negative or oversell when quantity exceeds stock", async () => {
    const service = buildService();
    const product = await seedProduct({ stock: 1 });

    const { order } = await service.createOrder(
      {
        customer: customer(),
        items: [
          { productId: product._id, name: product.name, quantity: 5, unitPrice: 499 },
        ],
        amount: 2495,
      },
      { method: "COD" },
      {}
    );

    // The order is still created (decrement is best-effort)...
    expect(order.orderStatus).toBe("CONFIRMED");
    // ...but the guarded decrement is a no-op when stock is insufficient, so
    // stock never goes negative.
    expect((await Product.findById(product._id).lean()).stock).toBe(1);
  });

  it("creates the order even if a stock update fails (best-effort, non-blocking)", async () => {
    const productModel = {
      updateOne: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const service = buildService({ productModel, logger });

    const { order } = await service.createOrder(
      {
        customer: customer(),
        items: [
          { productId: new mongoose.Types.ObjectId(), name: "X", quantity: 1, unitPrice: 499 },
        ],
        amount: 499,
      },
      { method: "COD" },
      {}
    );

    expect(order.orderStatus).toBe("CONFIRMED");
    expect(productModel.updateOne).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
