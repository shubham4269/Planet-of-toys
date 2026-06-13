import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createOrderService } from "./order.service.js";
import { createWhatsAppService } from "./whatsapp.service.js";
import { Order, Counter } from "../models/index.js";

/**
 * Integration test: the order-confirmed WhatsApp notification is dispatched on
 * order creation (Req 6.1, 13.1).
 *
 * Unlike the unit/property tests that inject a mocked WhatsApp_Service spy, this
 * test wires the REAL whatsapp.service.js (`createWhatsAppService`) into the
 * REAL order.service.js (`createOrderService`). Only the lowest-level seam — the
 * HTTP client that talks to the Meta Graph API — is mocked, so the entire
 * WhatsApp dispatch path runs for real: credential resolution, template-name
 * mapping (`order-confirmed` -> `order_confirmed`), phone normalization, and the
 * Graph API request payload.
 *
 * getCredential consults System_Settings before falling back to environment
 * variables, so an in-memory MongoDB is started. No settings document is
 * created, so WhatsApp credentials resolve from the env vars set below. The
 * HTTP client is always mocked (per whatsapp.service.test.js conventions), so
 * no real Graph API network call is ever made.
 *
 * Validates: Requirements 6.1, 13.1
 */

const PHONE_NUMBER_ID = "1234567890";
const ACCESS_TOKEN = "whatsapp-access-token-DO-NOT-LEAK";
const CUSTOMER_PHONE = "+91 98765 43210";
const NORMALIZED_PHONE = "919876543210";

let mongod;
const savedEnv = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(() => {
  for (const k of [
    "ENCRYPTION_KEY",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
  ]) {
    savedEnv[k] = process.env[k];
  }
  process.env.ENCRYPTION_KEY = "whatsapp-integration-test-encryption-key";
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_NUMBER_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = ACCESS_TOKEN;
});

afterEach(async () => {
  await Order.deleteMany({});
  await Counter.deleteMany({});
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/**
 * Build a mock HTTP client backed by a spy. Every request succeeds with a Graph
 * API style message-id response unless `onRequest` overrides it.
 */
function mockHttpClient({ onRequest } = {}) {
  const request = vi.fn(async (opts) => {
    if (onRequest) return onRequest(opts);
    return { status: 200, data: { messages: [{ id: "wamid.TEST123" }] } };
  });
  return { request };
}

/** A minimal, valid checkout input. */
function baseInput() {
  return {
    customer: {
      name: "Asha Rao",
      phone: CUSTOMER_PHONE,
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
  };
}

/**
 * Wire the REAL WhatsApp service (over a mocked HTTP client) into the REAL
 * Order service. Fulfilment is stubbed so the out-of-band Shiprocket path makes
 * no network call; only the WhatsApp seam is exercised.
 */
function buildServices({ onRequest } = {}) {
  const http = mockHttpClient({ onRequest });
  const whatsappService = createWhatsAppService({ httpClient: http });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createOrderService({
    whatsappService,
    fulfilOrder: vi.fn().mockResolvedValue(undefined),
    logger,
  });
  return { service, http, logger };
}

describe("order.service + whatsapp.service integration - order-confirmed on creation (Req 6.1, 13.1)", () => {
  it("dispatches the order-confirmed template to the customer phone via the Graph API on order creation", async () => {
    const { service, http } = buildServices();

    const { order } = await service.createOrder(baseInput(), { method: "COD" }, {});

    // The real WhatsApp dispatch path issued exactly one Graph API request.
    expect(http.request).toHaveBeenCalledTimes(1);

    const call = http.request.mock.calls[0][0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
    );
    expect(call.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    // Dispatched to the customer's (normalized) phone number using the
    // registered order-confirmed template (Req 13.1).
    expect(call.body.to).toBe(NORMALIZED_PHONE);
    expect(call.body.type).toBe("template");
    expect(call.body.template.name).toBe("order_confirmed");

    // The order id is carried as a body parameter of the confirmation message.
    const params = call.body.template.components[0].parameters.map((p) => p.text);
    expect(params).toContain(order.orderId);
  });

  it("creates the CONFIRMED order even when WhatsApp delivery fails (non-blocking)", async () => {
    // The Graph API rejects the send with a non-2xx status; the WhatsApp service
    // swallows the failure so order creation must still succeed (Req 13).
    const { service, http } = buildServices({
      onRequest: () => ({
        status: 400,
        data: { error: { message: "invalid template" } },
      }),
    });

    const { order, customer } = await service.createOrder(
      baseInput(),
      { method: "COD" },
      {}
    );

    // The send was attempted against the customer phone...
    expect(http.request).toHaveBeenCalledTimes(1);
    expect(http.request.mock.calls[0][0].body.to).toBe(NORMALIZED_PHONE);

    // ...yet the order was created and persisted as CONFIRMED regardless.
    expect(order.orderStatus).toBe("CONFIRMED");
    expect(customer.orderStatus).toBe("CONFIRMED");
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.orderStatus).toBe("CONFIRMED");
  });

  it("never leaks the WhatsApp access token to the customer projection", async () => {
    const { service } = buildServices();

    const { customer } = await service.createOrder(
      baseInput(),
      { method: "COD" },
      {}
    );

    expect(JSON.stringify(customer)).not.toContain(ACCESS_TOKEN);
  });
});
