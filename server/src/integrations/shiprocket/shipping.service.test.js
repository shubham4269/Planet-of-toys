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
import {
  createShippingService,
  ShippingConfigError,
  ShippingAuthError,
} from "./shipping.service.js";
import Order from "../../modules/orders/order.model.js";

// getCredential consults System_Settings before falling back to environment
// variables, so an in-memory MongoDB is started. No settings document is
// created, so Shiprocket credentials resolve from the env vars set below. The
// HTTP client is always mocked, so no real Shiprocket network call is made.

const TEST_EMAIL = "ops@planetoftoys.test";
const TEST_PASSWORD = "shiprocket-secret-DO-NOT-LEAK";
const PICKUP = "110001";

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
    "SHIPROCKET_EMAIL",
    "SHIPROCKET_PASSWORD",
    "SHIPROCKET_PICKUP_PINCODE",
  ]) {
    savedEnv[k] = process.env[k];
  }
  process.env.ENCRYPTION_KEY = "shipping-test-encryption-key";
  process.env.SHIPROCKET_EMAIL = TEST_EMAIL;
  process.env.SHIPROCKET_PASSWORD = TEST_PASSWORD;
  process.env.SHIPROCKET_PICKUP_PINCODE = PICKUP;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/**
 * Build a mock HTTP client whose responses are driven by the request path.
 * `authResponses` is a queue consumed on each auth call (defaults to a fresh
 * token each time); `onServiceability` shapes the serviceability response and
 * can branch on the Authorization header to simulate token expiry.
 */
function mockHttpClient({ onAuth, onServiceability } = {}) {
  let authCount = 0;
  const request = vi.fn(async (opts) => {
    if (opts.url.endsWith("/auth/login")) {
      authCount += 1;
      if (onAuth) return onAuth(opts, authCount);
      return { status: 200, data: { token: `token-${authCount}` } };
    }
    if (opts.url.endsWith("/courier/serviceability/")) {
      if (onServiceability) return onServiceability(opts);
      return {
        status: 200,
        data: { data: { available_courier_companies: [{ courier_company_id: 1 }] } },
      };
    }
    return { status: 404, data: null };
  });
  return {
    request,
    get authCount() {
      return authCount;
    },
  };
}

describe("shipping service - getToken (Req 10.1, 10.2)", () => {
  it("authenticates and caches the token when none exists (Req 10.1)", async () => {
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    const token = await service.getToken();

    expect(token).toBe("token-1");
    expect(http.authCount).toBe(1);
    const authCall = http.request.mock.calls[0][0];
    expect(authCall.method).toBe("POST");
    expect(authCall.url).toMatch(/\/auth\/login$/);
    expect(authCall.body).toEqual({ email: TEST_EMAIL, password: TEST_PASSWORD });
  });

  it("reuses a valid cached token across calls (Req 10.2)", async () => {
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    const t1 = await service.getToken();
    const t2 = await service.getToken();
    const t3 = await service.getToken();

    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
    expect(http.authCount).toBe(1); // authenticated at most once
  });

  it("re-authenticates after the cached token expires", async () => {
    const http = mockHttpClient();
    let clock = 1_000_000;
    const service = createShippingService({
      httpClient: http,
      now: () => clock,
      tokenTtlMs: 1000,
    });

    const first = await service.getToken();
    expect(first).toBe("token-1");

    clock += 2000; // advance beyond the TTL
    const second = await service.getToken();

    expect(second).toBe("token-2");
    expect(http.authCount).toBe(2);
  });

  it("throws ShippingConfigError when credentials are missing", async () => {
    delete process.env.SHIPROCKET_EMAIL;
    delete process.env.SHIPROCKET_PASSWORD;
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    await expect(service.getToken()).rejects.toThrow(ShippingConfigError);
  });

  it("throws ShippingAuthError when auth does not return a token", async () => {
    const http = mockHttpClient({
      onAuth: () => ({ status: 200, data: { message: "bad creds" } }),
    });
    const service = createShippingService({ httpClient: http });

    await expect(service.getToken()).rejects.toThrow(ShippingAuthError);
  });

  it("never exposes credentials in the returned token", async () => {
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    const token = await service.getToken();
    expect(token).not.toContain(TEST_EMAIL);
    expect(token).not.toContain(TEST_PASSWORD);
  });
});

describe("shipping service - token refresh on 401 (Req 10.3)", () => {
  it("re-authenticates and retries once when a request returns 401", async () => {
    // The first serviceability call (with token-1) returns 401; after a forced
    // re-auth (token-2) the retry succeeds.
    const http = mockHttpClient({
      onServiceability: (opts) => {
        const auth = opts.headers.Authorization;
        if (auth === "Bearer token-1") {
          return { status: 401, data: { message: "Unauthorized" } };
        }
        return {
          status: 200,
          data: { data: { available_courier_companies: [{ courier_company_id: 7 }] } },
        };
      },
    });
    const service = createShippingService({ httpClient: http });

    const result = await service.checkServiceability("560001");

    expect(result).toEqual({ serviceable: true });
    expect(http.authCount).toBe(2); // initial auth + one refresh
  });
});

describe("shipping service - checkServiceability (Req 4.3, 10.4)", () => {
  it("returns { serviceable: true } when couriers are available", async () => {
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    const result = await service.checkServiceability("560001");

    expect(result).toEqual({ serviceable: true });
    const call = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/courier/serviceability/")
    )[0];
    expect(call.query).toMatchObject({
      pickup_postcode: PICKUP,
      delivery_postcode: "560001",
    });
  });

  it("returns { serviceable: false } when no couriers are available", async () => {
    const http = mockHttpClient({
      onServiceability: () => ({
        status: 200,
        data: { data: { available_courier_companies: [] } },
      }),
    });
    const service = createShippingService({ httpClient: http });

    expect(await service.checkServiceability("560001")).toEqual({
      serviceable: false,
    });
  });

  it("returns { serviceable: false } for a malformed pincode without calling Shiprocket", async () => {
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    expect(await service.checkServiceability("12")).toEqual({ serviceable: false });
    expect(await service.checkServiceability("abcdef")).toEqual({
      serviceable: false,
    });
    // No auth or serviceability request should have been made.
    expect(http.request).not.toHaveBeenCalled();
  });

  it("excludes credentials and the token from the response (Req 10.4)", async () => {
    const http = mockHttpClient();
    const service = createShippingService({ httpClient: http });

    const result = await service.checkServiceability("560001");
    const serialized = JSON.stringify(result);

    expect(Object.keys(result)).toEqual(["serviceable"]);
    expect(serialized).not.toContain(TEST_EMAIL);
    expect(serialized).not.toContain(TEST_PASSWORD);
    expect(serialized).not.toContain("token");
  });
});

/**
 * Build a mock HTTP client covering the full fulfilment flow: auth, create
 * adhoc order, and AWB assignment. `onCreate`/`onAssign` override the default
 * success responses to simulate Shiprocket errors or unavailability.
 */
function mockFulfilmentClient({ onCreate, onAssign } = {}) {
  let authCount = 0;
  const request = vi.fn(async (opts) => {
    if (opts.url.endsWith("/auth/login")) {
      authCount += 1;
      return { status: 200, data: { token: `token-${authCount}` } };
    }
    if (opts.url.endsWith("/orders/create/adhoc")) {
      if (onCreate) return onCreate(opts);
      return { status: 200, data: { order_id: 9001, shipment_id: 7001 } };
    }
    if (opts.url.endsWith("/courier/assign/awb")) {
      if (onAssign) return onAssign(opts);
      return {
        status: 200,
        data: {
          awb_assign_status: 1,
          response: { data: { awb_code: "AWB123456", courier_name: "Delhivery" } },
        },
      };
    }
    return { status: 404, data: null };
  });
  return {
    request,
    get authCount() {
      return authCount;
    },
  };
}

/** Persist a minimal valid PENDING order for fulfilment tests. */
async function seedOrder(overrides = {}) {
  return Order.create({
    orderId: overrides.orderId ?? `POT-240101-${Math.floor(Math.random() * 9000 + 1000)}`,
    customer: {
      name: "Asha Verma",
      phone: "9876543210",
      email: "asha@example.test",
      address: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
    },
    items: [{ productId: new mongoose.Types.ObjectId(), name: "Toy Robot", quantity: 2, unitPrice: 499 }],
    amount: 998,
    paymentMethod: "ONLINE",
    paymentStatus: "PAID",
    ...overrides,
  });
}

describe("shipping service - createShipment (Req 11.1, 11.2, 11.3, 17.5)", () => {
  afterEach(async () => {
    await Order.deleteMany({});
  });

  it("creates the SR order, assigns courier/AWB, stores them, and sets CREATED", async () => {
    const http = mockFulfilmentClient();
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    const result = await service.createShipment(order);

    expect(result).toMatchObject({
      ok: true,
      shipmentStatus: "CREATED",
      awb: "AWB123456",
      courier: "Delhivery",
      shiprocketOrderId: "9001",
    });

    const persisted = await Order.findById(order._id).lean();
    expect(persisted.shipmentStatus).toBe("CREATED");
    expect(persisted.shipping.awb).toBe("AWB123456");
    expect(persisted.shipping.courier).toBe("Delhivery");
    expect(persisted.shipping.shiprocketOrderId).toBe("9001");

    // Adhoc payload maps order fields onto Shiprocket's schema.
    const createCall = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/orders/create/adhoc")
    )[0];
    expect(createCall.body).toMatchObject({
      order_id: order.orderId,
      billing_customer_name: "Asha",
      billing_pincode: "560001",
      payment_method: "Prepaid",
    });
  });

  it("keeps shipmentStatus PENDING and never throws when SR order creation fails", async () => {
    const http = mockFulfilmentClient({
      onCreate: () => ({ status: 500, data: { message: "Internal error" } }),
    });
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    const result = await service.createShipment(order);

    expect(result.ok).toBe(false);
    expect(result.shipmentStatus).toBe("PENDING");

    const persisted = await Order.findById(order._id).lean();
    expect(persisted.shipmentStatus).toBe("PENDING");
    expect(persisted.shipping.awb).toBeNull();
  });

  it("keeps shipmentStatus PENDING and never throws when AWB assignment fails", async () => {
    const http = mockFulfilmentClient({
      onAssign: () => ({ status: 200, data: { awb_assign_status: 0, response: { data: {} } } }),
    });
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    const result = await service.createShipment(order);

    expect(result.ok).toBe(false);
    expect(result.shipmentStatus).toBe("PENDING");
    const persisted = await Order.findById(order._id).lean();
    expect(persisted.shipmentStatus).toBe("PENDING");
  });

  it("never throws even when the HTTP client itself rejects", async () => {
    const http = {
      request: vi.fn(async (opts) => {
        if (opts.url.endsWith("/auth/login")) {
          return { status: 200, data: { token: "token-1" } };
        }
        throw new Error("network down");
      }),
    };
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    await expect(service.createShipment(order)).resolves.toMatchObject({
      ok: false,
      shipmentStatus: "PENDING",
    });
  });
});

describe("shipping service - retryPendingShipments (Req 11.7)", () => {
  afterEach(async () => {
    await Order.deleteMany({});
  });

  it("sweeps PENDING orders and transitions the fulfillable ones to CREATED", async () => {
    const http = mockFulfilmentClient();
    const service = createShippingService({ httpClient: http });
    const o1 = await seedOrder();
    const o2 = await seedOrder();
    // A cancelled order must be excluded from the sweep.
    await seedOrder({ orderStatus: "CANCELLED" });

    const summary = await service.retryPendingShipments();

    expect(summary).toEqual({ processed: 2, created: 2, stillPending: 0 });
    expect((await Order.findById(o1._id)).shipmentStatus).toBe("CREATED");
    expect((await Order.findById(o2._id)).shipmentStatus).toBe("CREATED");
  });

  it("leaves orders PENDING when Shiprocket fails and reports them as stillPending", async () => {
    const http = mockFulfilmentClient({
      onCreate: () => ({ status: 503, data: { message: "unavailable" } }),
    });
    const service = createShippingService({ httpClient: http });
    await seedOrder();

    const summary = await service.retryPendingShipments();

    expect(summary).toEqual({ processed: 1, created: 0, stillPending: 1 });
  });
});

/**
 * Mock HTTP client that also answers the pickup-settings endpoint. `addresses`
 * is the list returned under `data.shipping_address`; `pickupCount` records how
 * many times the account pickup endpoint was queried (to assert caching and the
 * "no query when overridden" behavior).
 */
function mockClientWithPickup({ addresses = [], onServiceability } = {}) {
  let authCount = 0;
  let pickupCount = 0;
  const request = vi.fn(async (opts) => {
    if (opts.url.endsWith("/auth/login")) {
      authCount += 1;
      return { status: 200, data: { token: `token-${authCount}` } };
    }
    if (opts.url.endsWith("/settings/company/pickup")) {
      pickupCount += 1;
      return { status: 200, data: { data: { shipping_address: addresses } } };
    }
    if (opts.url.endsWith("/courier/serviceability/")) {
      if (onServiceability) return onServiceability(opts);
      return {
        status: 200,
        data: { data: { available_courier_companies: [{ courier_company_id: 1 }] } },
      };
    }
    if (opts.url.endsWith("/orders/create/adhoc")) {
      return { status: 200, data: { order_id: 9001, shipment_id: 7001 } };
    }
    if (opts.url.endsWith("/courier/assign/awb")) {
      return {
        status: 200,
        data: {
          awb_assign_status: 1,
          response: { data: { awb_code: "AWB1", courier_name: "BlueDart" } },
        },
      };
    }
    return { status: 404, data: null };
  });
  return {
    request,
    get authCount() {
      return authCount;
    },
    get pickupCount() {
      return pickupCount;
    },
  };
}

describe("shipping service - pickup auto-detection from account", () => {
  afterEach(async () => {
    await Order.deleteMany({});
    delete process.env.SHIPROCKET_PICKUP_LOCATION;
  });

  it("uses the account's primary pickup pincode for serviceability when none is configured", async () => {
    delete process.env.SHIPROCKET_PICKUP_PINCODE;
    const http = mockClientWithPickup({
      addresses: [{ pickup_location: "Home", pin_code: "110019", is_primary_location: 1 }],
    });
    const service = createShippingService({ httpClient: http });

    const result = await service.checkServiceability("560001");

    expect(result).toEqual({ serviceable: true });
    const svc = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/courier/serviceability/")
    )[0];
    expect(svc.query).toMatchObject({
      pickup_postcode: "110019",
      delivery_postcode: "560001",
    });
  });

  it("uses the account's primary pickup nickname for shipment creation when none is configured", async () => {
    delete process.env.SHIPROCKET_PICKUP_PINCODE;
    const http = mockClientWithPickup({
      addresses: [{ pickup_location: "Warehouse-A", pin_code: "110019", is_primary_location: 1 }],
    });
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    await service.createShipment(order);

    const createCall = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/orders/create/adhoc")
    )[0];
    expect(createCall.body.pickup_location).toBe("Warehouse-A");
  });

  it("selects the primary pickup address when the account has several", async () => {
    delete process.env.SHIPROCKET_PICKUP_PINCODE;
    const http = mockClientWithPickup({
      addresses: [
        { pickup_location: "Secondary", pin_code: "400001", is_primary_location: 0 },
        { pickup_location: "Main", pin_code: "110019", is_primary_location: 1 },
      ],
    });
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    await service.createShipment(order);

    const createCall = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/orders/create/adhoc")
    )[0];
    expect(createCall.body.pickup_location).toBe("Main");
  });

  it("queries the account pickup at most once and caches the result", async () => {
    delete process.env.SHIPROCKET_PICKUP_PINCODE;
    const http = mockClientWithPickup({
      addresses: [{ pickup_location: "Home", pin_code: "110019", is_primary_location: 1 }],
    });
    const service = createShippingService({ httpClient: http });

    await service.checkServiceability("560001");
    await service.checkServiceability("400001");

    expect(http.pickupCount).toBe(1);
  });

  it("prefers a configured pickup nickname and never queries the account", async () => {
    process.env.SHIPROCKET_PICKUP_LOCATION = "Configured-Nick";
    const http = mockClientWithPickup({
      addresses: [{ pickup_location: "Home", pin_code: "110019", is_primary_location: 1 }],
    });
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    await service.createShipment(order);

    const createCall = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/orders/create/adhoc")
    )[0];
    expect(createCall.body.pickup_location).toBe("Configured-Nick");
    expect(http.pickupCount).toBe(0);
  });

  it("falls back to the default nickname when the account has no pickup address", async () => {
    delete process.env.SHIPROCKET_PICKUP_PINCODE;
    const http = mockClientWithPickup({ addresses: [] });
    const service = createShippingService({ httpClient: http });
    const order = await seedOrder();

    await service.createShipment(order);

    const createCall = http.request.mock.calls.find((c) =>
      c[0].url.endsWith("/orders/create/adhoc")
    )[0];
    expect(createCall.body.pickup_location).toBe("Primary");
  });
});
