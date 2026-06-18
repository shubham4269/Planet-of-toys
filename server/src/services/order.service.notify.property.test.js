// Feature: planet-of-toys-ecommerce, Property 25: Status transitions dispatch the correct WhatsApp templates
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import fc from "fast-check";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  createOrderService,
  STATUS_NOTIFICATION_TEMPLATES,
} from "./order.service.js";
import { Order, Counter, ORDER_STATUSES } from "../models/index.js";

/**
 * Property 25: Status transitions dispatch the correct WhatsApp templates.
 *
 * For any order status transition to SHIPPED, OUT_FOR_DELIVERY, DELIVERED, or
 * CANCELLED, the WhatsApp_Service dispatches exactly the template(s) mapped to
 * that status (SHIPPED dispatches both shipment-created and order-shipped; the
 * others dispatch their single corresponding template). Transitions to any
 * other status (CONFIRMED, PACKED, RTO) dispatch no template at all.
 *
 * Validates: Requirements 13.2, 13.3, 13.4, 13.5
 */

/**
 * The expected template dispatch for every Order_Status, derived independently
 * from the requirements (not from the production map) so the property checks
 * behaviour rather than mirroring the implementation:
 *   - SHIPPED          -> shipment-created + order-shipped (Req 13.2)
 *   - OUT_FOR_DELIVERY -> out-for-delivery                 (Req 13.3)
 *   - DELIVERED        -> delivered                        (Req 13.4)
 *   - CANCELLED        -> cancelled                        (Req 13.5)
 *   - any other status -> none
 */
const EXPECTED_TEMPLATES = Object.freeze({
  CONFIRMED: [],
  PACKED: [],
  SHIPPED: ["shipment-created", "order-shipped"],
  OUT_FOR_DELIVERY: ["out-for-delivery"],
  DELIVERED: ["delivered"],
  CANCELLED: ["cancelled"],
  RTO: [],
});

const baseInput = () => ({
  customer: {
    name: "Asha Rao",
    phone: "919876543210",
    email: "asha@example.com",
    address: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  items: [
    {
      productId: new mongoose.Types.ObjectId(),
      name: "Wooden Train",
      quantity: 2,
      unitPrice: 499,
    },
  ],
  amount: 998,
});

/** Build a service with a fresh mocked WhatsApp spy per order.service.test.js. */
function buildService() {
  const whatsappService = {
    sendNotification: vi.fn().mockResolvedValue({ ok: true }),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createOrderService({
    whatsappService,
    verifySignature: vi.fn().mockResolvedValue(true),
    fulfilOrder: vi.fn().mockResolvedValue(undefined),
    logger,
  });
  return { service, whatsappService };
}

describe("Property 25: status transitions dispatch the correct WhatsApp templates", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Counter.deleteMany({});
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it("dispatches exactly the templates mapped to the target status, in order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ORDER_STATUSES),
        async (status) => {
          const { service, whatsappService } = buildService();

          // Seed a fresh CONFIRMED order, then ignore the order-confirmed
          // notification fired on creation by clearing the spy.
          const { order } = await service.createOrder(
            baseInput(),
            { method: "COD" },
            {}
          );
          // SHIPPED notifications require an AWB; seed one so the SHIPPED case
          // still dispatches its templates (this test asserts template mapping,
          // not the AWB gate which is covered in order.service.tracking.test.js).
          order.shipping.awb = "AWB123456";
          order.shipping.courier = "Delhivery";
          await order.save();
          whatsappService.sendNotification.mockClear();

          await service.applyStatusChange(order, status);

          const expected = EXPECTED_TEMPLATES[status];
          const calls = whatsappService.sendNotification.mock.calls;

          // Exactly the mapped template(s) are dispatched, in the mapped order.
          expect(calls.map((c) => c[1])).toEqual(expected);
          // Every dispatch targets the customer's phone number.
          for (const call of calls) {
            expect(call[0]).toBe(order.customer.phone);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("agrees with the documented STATUS_NOTIFICATION_TEMPLATES map", () => {
    // The production map dispatches templates for the notify-on states and
    // nothing for the rest; the property's expectation must match it.
    for (const status of ORDER_STATUSES) {
      const mapped = STATUS_NOTIFICATION_TEMPLATES[status] ?? [];
      expect([...mapped]).toEqual(EXPECTED_TEMPLATES[status]);
    }
  });
});
