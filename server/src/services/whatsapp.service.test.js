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
import { createWhatsAppService } from "./whatsapp.service.js";

// getCredential consults System_Settings before falling back to environment
// variables, so an in-memory MongoDB is started. No settings document is
// created, so WhatsApp credentials resolve from the env vars set below. The
// HTTP client is always mocked, so no real Graph API network call is made.

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
  process.env.ENCRYPTION_KEY = "whatsapp-test-encryption-key";
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_NUMBER_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = ACCESS_TOKEN;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/** A logger spy exposing the same surface the service uses. */
function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/**
 * Build a mock HTTP client. By default every request succeeds with a Graph API
 * style message-id response. `onRequest` overrides the response, and `throws`
 * makes the client reject (simulating a network error).
 */
function mockHttpClient({ onRequest, throws } = {}) {
  const request = vi.fn(async (opts) => {
    if (throws) throw new Error("network down");
    if (onRequest) return onRequest(opts);
    return { status: 200, data: { messages: [{ id: "wamid.TEST123" }] } };
  });
  return { request };
}

describe("whatsapp service - sendOtp (Req 6.1)", () => {
  it("sends the OTP template with the code as a body parameter", async () => {
    const http = mockHttpClient();
    const service = createWhatsAppService({ httpClient: http });

    const result = await service.sendOtp(CUSTOMER_PHONE, "123456");

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("wamid.TEST123");
    expect(http.request).toHaveBeenCalledTimes(1);

    const call = http.request.mock.calls[0][0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
    );
    expect(call.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(call.body.to).toBe(NORMALIZED_PHONE);
    expect(call.body.type).toBe("template");
    expect(call.body.template.name).toBe("otp_verification");
    expect(call.body.template.components[0].parameters[0].text).toBe("123456");
  });
});

describe("whatsapp service - sendNotification template mapping (Req 13.1-13.5)", () => {
  const cases = [
    ["order-confirmed", "order_confirmed"],
    ["shipment-created", "shipment_created"],
    ["order-shipped", "order_shipped"],
    ["out-for-delivery", "out_for_delivery"],
    ["delivered", "delivered"],
    ["cancelled", "cancelled"],
  ];

  it.each(cases)(
    "maps logical template '%s' to registered template '%s'",
    async (logical, registered) => {
      const http = mockHttpClient();
      const service = createWhatsAppService({ httpClient: http });

      const result = await service.sendNotification(CUSTOMER_PHONE, logical, {
        orderId: "POT-240101-0001",
      });

      expect(result.ok).toBe(true);
      const call = http.request.mock.calls[0][0];
      expect(call.body.template.name).toBe(registered);
      expect(call.body.template.components[0].parameters[0].text).toBe(
        "POT-240101-0001"
      );
    }
  );

  it("keeps the order.service signature compatible: sendNotification(phone, 'order-confirmed', params)", async () => {
    const http = mockHttpClient();
    const service = createWhatsAppService({ httpClient: http });

    const result = await service.sendNotification(
      CUSTOMER_PHONE,
      "order-confirmed",
      ["POT-240101-0001", "1500"]
    );

    expect(result.ok).toBe(true);
    const params = http.request.mock.calls[0][0].body.template.components[0]
      .parameters;
    expect(params.map((p) => p.text)).toEqual(["POT-240101-0001", "1500"]);
  });

  it("rejects an unknown template without making a request", async () => {
    const http = mockHttpClient();
    const service = createWhatsAppService({ httpClient: http });

    const result = await service.sendNotification(CUSTOMER_PHONE, "bogus", {});

    expect(result).toEqual({ ok: false, reason: "UNKNOWN_TEMPLATE" });
    expect(http.request).not.toHaveBeenCalled();
  });
});

describe("whatsapp service - non-blocking failure handling (Req 13)", () => {
  it("does not throw and logs server-side when the Graph API returns a non-2xx status", async () => {
    const logger = mockLogger();
    const http = mockHttpClient({
      onRequest: () => ({
        status: 400,
        data: { error: { message: "invalid template" } },
      }),
    });
    const service = createWhatsAppService({ httpClient: http, logger });

    const result = await service.sendNotification(
      CUSTOMER_PHONE,
      "order-confirmed",
      {}
    );

    expect(result).toEqual({ ok: false, reason: "SEND_FAILED" });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("does not throw and logs server-side when the HTTP client throws (network error)", async () => {
    const logger = mockLogger();
    const http = mockHttpClient({ throws: true });
    const service = createWhatsAppService({ httpClient: http, logger });

    const result = await service.sendOtp(CUSTOMER_PHONE, "123456");

    expect(result).toEqual({ ok: false, reason: "ERROR" });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("skips sending and warns when messaging is not configured", async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const logger = mockLogger();
    const http = mockHttpClient();
    const service = createWhatsAppService({ httpClient: http, logger });

    const result = await service.sendNotification(
      CUSTOMER_PHONE,
      "delivered",
      {}
    );

    expect(result).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(http.request).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("skips sending and warns for an invalid recipient phone number", async () => {
    const logger = mockLogger();
    const http = mockHttpClient();
    const service = createWhatsAppService({ httpClient: http, logger });

    const result = await service.sendOtp("not-a-phone", "123456");

    expect(result).toEqual({ ok: false, reason: "INVALID_PHONE" });
    expect(http.request).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("never leaks the access token in the returned result", async () => {
    const http = mockHttpClient();
    const service = createWhatsAppService({ httpClient: http });

    const result = await service.sendOtp(CUSTOMER_PHONE, "123456");

    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("exposes the supported logical templates", async () => {
    const service = createWhatsAppService({ httpClient: mockHttpClient() });
    expect(service.supportedTemplates).toEqual([
      "order-confirmed",
      "shipment-created",
      "order-shipped",
      "out-for-delivery",
      "delivered",
      "cancelled",
    ]);
  });
});
