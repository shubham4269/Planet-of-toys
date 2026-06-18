import { getCredential } from "../../modules/settings/credential.service.js";
import { logger as defaultLogger } from "../../shared/config/logger.js";
import Order from "../../modules/orders/order.model.js";

/**
 * Shipping Service — Shiprocket integration (Req 4.3, 10, 11, 17.4).
 *
 * This module implements the token-lifecycle and serviceability portion of the
 * Shipping_Service (task 11.1):
 *
 *  - `getToken()` — returns a Shiprocket auth token. When no valid cached token
 *    exists it authenticates with the configured Shiprocket email/password and
 *    caches the returned token (Req 10.1). While the cached token is still
 *    valid it is reused without re-authenticating (Req 10.2).
 *  - An authenticated-request helper transparently re-authenticates and retries
 *    once when Shiprocket rejects a request with HTTP 401, i.e. the cached token
 *    has expired (Req 10.3).
 *  - `checkServiceability(pincode)` — queries Shiprocket courier serviceability
 *    for a delivery pincode and returns ONLY `{ serviceable: boolean }`
 *    (Req 4.3).
 *
 * Secret handling (Req 10.4): the Shiprocket email, password, and auth token
 * are used strictly server-side. `getToken` is an internal server-side helper
 * and its token is never placed in a frontend response; `checkServiceability`
 * returns only a boolean. No method returns credentials or tokens.
 *
 * Testability: the HTTP client is injectable (`options.httpClient`) so tests
 * can mock every Shiprocket call and make no real network request. The clock
 * (`options.now`) and logger are likewise injectable.
 *
 * Task 11.3 adds the fulfilment portion:
 *
 *  - `createShipment(order)` — creates the Shiprocket adhoc order, assigns a
 *    courier, and generates an AWB. On success it stores the AWB/courier and
 *    the Shiprocket order id on the order and sets `shipmentStatus = CREATED`
 *    (Req 11.1, 11.2, 11.3, 17.5). On any Shiprocket error or unavailability it
 *    logs the reason server-side, leaves `shipmentStatus = PENDING`, and NEVER
 *    throws to the caller so the customer order is never blocked (Req 11.5,
 *    11.6, 17.6, Property 22).
 *  - `retryPendingShipments()` — a background sweep that re-attempts fulfilment
 *    for every order still in `shipmentStatus = PENDING` (Req 11.7).
 */

/** Default Shiprocket REST API base URL. */
const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
const AUTH_PATH = "/auth/login";
const SERVICEABILITY_PATH = "/courier/serviceability/";
const CREATE_ORDER_PATH = "/orders/create/adhoc";
const ASSIGN_AWB_PATH = "/courier/assign/awb";
const CANCEL_ORDER_PATH = "/orders/cancel";
const CANCEL_AWB_PATH = "/orders/cancel/shipment/awbs";
const PICKUP_PATH = "/settings/company/pickup";

/**
 * Shiprocket auth tokens are valid for ~10 days. We cache conservatively for 9
 * days so an in-flight request never races the provider-side expiry; a 401 from
 * Shiprocket additionally forces a refresh-and-retry regardless of this TTL.
 */
const DEFAULT_TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

/** Raised when Shiprocket configuration (credentials) is incomplete. */
export class ShippingConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShippingConfigError";
  }
}

/** Raised when Shiprocket authentication does not yield a usable token. */
export class ShippingAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShippingAuthError";
  }
}

/**
 * Default HTTP client backed by the global `fetch`. Performs a single request
 * and returns a normalized `{ status, data }` shape. JSON parsing failures
 * resolve `data` to `null` rather than throwing so callers branch on `status`.
 *
 * @returns {{ request: (opts: object) => Promise<{ status: number, data: any }> }}
 */
function createDefaultHttpClient() {
  return {
    async request({ method = "GET", url, headers = {}, query, body } = {}) {
      const target = new URL(url);
      if (query && typeof query === "object") {
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== null) {
            target.searchParams.set(key, String(value));
          }
        }
      }

      const response = await fetch(target, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return { status: response.status, data };
    },
  };
}

/** Default Shiprocket pickup-location nickname when none is configured. */
const DEFAULT_PICKUP_LOCATION = "Primary";

/**
 * Default parcel dimensions/weight used for the Shiprocket adhoc order when the
 * order itself carries no physical attributes. These are conservative defaults
 * for a single toy parcel and can be tuned via constructor options.
 */
const DEFAULT_PARCEL = Object.freeze({
  length: 15,
  breadth: 15,
  height: 15,
  weight: 0.5,
});

/** Normalize a pincode to a 6-digit Indian postal code, or `null` if invalid. */
function normalizePincode(pincode) {
  if (pincode === undefined || pincode === null) return null;
  const trimmed = String(pincode).trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

/**
 * Split a full customer name into Shiprocket's first/last-name fields. Shiprocket
 * requires a billing first name; the remainder (if any) becomes the last name.
 */
function splitName(fullName) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Customer", last: "" };
  const [first, ...rest] = parts;
  return { first, last: rest.join(" ") };
}

/** Raised internally when a Shiprocket fulfilment step does not succeed. */
class ShipmentStepError extends Error {
  constructor(step, message, detail) {
    super(message);
    this.name = "ShipmentStepError";
    this.step = step;
    this.detail = detail;
  }
}

/**
 * Create a Shipping_Service instance with its own token cache.
 *
 * @param {object} [options]
 * @param {{ request: Function }} [options.httpClient] injectable HTTP client
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @param {() => number} [options.now=Date.now] clock for cache expiry
 * @param {number} [options.tokenTtlMs] cached-token lifetime in milliseconds
 * @param {string} [options.baseUrl] Shiprocket API base URL
 * @param {string} [options.pickupPincode] origin pincode for serviceability
 * @param {string} [options.pickupLocation] Shiprocket pickup-location nickname
 * @param {object} [options.orderModel] Order model (injectable for tests)
 * @param {{ warn: Function, error: Function }} [options.logger]
 */
export function createShippingService({
  httpClient = createDefaultHttpClient(),
  env = process.env,
  now = Date.now,
  tokenTtlMs = DEFAULT_TOKEN_TTL_MS,
  baseUrl = SHIPROCKET_BASE_URL,
  pickupPincode,
  pickupLocation,
  parcel = DEFAULT_PARCEL,
  orderModel = Order,
  logger = defaultLogger,
} = {}) {
  // Module-private token cache. `token` is the bearer token; `expiresAt` is the
  // epoch-millis instant after which we treat it as stale and re-authenticate.
  const cache = { token: null, expiresAt: 0 };

  // Cache of the account's primary pickup address (nickname + pincode),
  // auto-detected from Shiprocket to fill in any pickup value the operator did
  // not configure explicitly. `attempted` guards against repeated fetches —
  // including when the account has no pickup address — so the lookup runs at
  // most once per service instance.
  const pickupCache = { attempted: false, location: null, pincode: null };

  /**
   * Fetch the account's pickup addresses once and cache the primary one (the
   * address flagged `is_primary_location`, else the first). Best-effort: any
   * error or empty result leaves the cache null so callers fall back to the
   * configured value or the default nickname.
   */
  async function fetchAccountPickup() {
    if (pickupCache.attempted) return pickupCache;
    pickupCache.attempted = true;
    try {
      const res = await authenticatedRequest({
        method: "GET",
        url: `${baseUrl}${PICKUP_PATH}`,
      });
      const addresses = res?.data?.data?.shipping_address;
      if (res.status >= 200 && res.status < 300 && Array.isArray(addresses) && addresses.length > 0) {
        const primary = addresses.find((a) => a && a.is_primary_location) ?? addresses[0];
        pickupCache.location =
          typeof primary.pickup_location === "string"
            ? primary.pickup_location.trim() || null
            : null;
        pickupCache.pincode = normalizePincode(primary.pin_code);
      }
    } catch {
      // Auto-detection is best-effort; leave the cache null to fall back.
    }
    return pickupCache;
  }

  /**
   * Resolve the origin pincode for serviceability. Prefers an explicitly
   * configured value (constructor option or SHIPROCKET_PICKUP_PINCODE); when
   * none is set, falls back to the account's primary pickup pincode (Req 4.3).
   */
  async function resolvePickup() {
    const configured = normalizePincode(pickupPincode ?? env.SHIPROCKET_PICKUP_PINCODE);
    if (configured) return configured;
    return (await fetchAccountPickup()).pincode;
  }

  /**
   * Authenticate with Shiprocket and cache the returned token (Req 10.1).
   * @returns {Promise<string>} the freshly issued bearer token
   */
  async function authenticate() {
    const email = await getCredential("shiprocket", "email", { env });
    const password = await getCredential("shiprocket", "password", { env });
    if (!email || !password) {
      throw new ShippingConfigError(
        "Shiprocket credentials are not configured on the server."
      );
    }

    const { status, data } = await httpClient.request({
      method: "POST",
      url: `${baseUrl}${AUTH_PATH}`,
      body: { email, password },
    });

    if (status < 200 || status >= 300 || !data || typeof data.token !== "string") {
      throw new ShippingAuthError("Shiprocket authentication failed.");
    }

    cache.token = data.token;
    cache.expiresAt = now() + tokenTtlMs;
    return cache.token;
  }

  /**
   * Return a valid Shiprocket token, authenticating only when necessary.
   *
   * Reuses the cached token while it remains valid (Req 10.2); authenticates
   * when no valid cached token exists (Req 10.1). Pass `forceRefresh` to bypass
   * the cache (used by the 401 refresh-and-retry path, Req 10.3).
   *
   * @param {object} [opts]
   * @param {boolean} [opts.forceRefresh=false]
   * @returns {Promise<string>}
   */
  async function getToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && cache.token && cache.expiresAt > now()) {
      return cache.token;
    }
    return authenticate();
  }

  /**
   * Perform a Shiprocket request authenticated with the cached token, re-
   * authenticating and retrying exactly once on a 401 expired-token response
   * (Req 10.3).
   *
   * @param {object} reqOptions request options forwarded to the HTTP client
   * @returns {Promise<{ status: number, data: any }>}
   */
  async function authenticatedRequest(reqOptions) {
    let token = await getToken();
    let response = await httpClient.request({
      ...reqOptions,
      headers: { Authorization: `Bearer ${token}`, ...(reqOptions.headers || {}) },
    });

    if (response.status === 401) {
      // The cached token is expired/invalid: refresh and retry once (Req 10.3).
      token = await getToken({ forceRefresh: true });
      response = await httpClient.request({
        ...reqOptions,
        headers: { Authorization: `Bearer ${token}`, ...(reqOptions.headers || {}) },
      });
    }

    return response;
  }

  /**
   * Check whether Shiprocket can deliver to the given pincode (Req 4.3).
   *
   * Returns ONLY `{ serviceable: boolean }`; Shiprocket credentials and the
   * auth token are never included in the result (Req 10.4). A malformed pincode
   * or a missing/empty courier list resolves to `{ serviceable: false }`.
   *
   * @param {string|number} pincode delivery pincode
   * @param {object} [opts]
   * @param {number} [opts.weight=0.5] parcel weight in kg
   * @param {0|1} [opts.cod=0] whether to check COD serviceability
   * @returns {Promise<{ serviceable: boolean }>}
   */
  async function checkServiceability(pincode, { weight = 0.5, cod = 0 } = {}) {
    // Dev-mode bypass: when Shiprocket credentials are not configured and we
    // are in development, assume every pincode is serviceable so the full
    // checkout flow can be tested without a Shiprocket account.
    const email = env.SHIPROCKET_EMAIL;
    const password = env.SHIPROCKET_PASSWORD;
    if ((!email || !password) && env.NODE_ENV === "development") {
      logger.warn(
        "DEV MODE: Shiprocket credentials not configured — returning serviceable=true for all pincodes."
      );
      return { serviceable: true };
    }

    const delivery = normalizePincode(pincode);
    if (!delivery) {
      return { serviceable: false };
    }
    const pickup = await resolvePickup();
    if (!pickup) {
      return { serviceable: false };
    }

    const response = await authenticatedRequest({
      method: "GET",
      url: `${baseUrl}${SERVICEABILITY_PATH}`,
      query: {
        pickup_postcode: pickup,
        delivery_postcode: delivery,
        weight,
        cod,
      },
    });

    const couriers = response?.data?.data?.available_courier_companies;
    const serviceable =
      response.status >= 200 &&
      response.status < 300 &&
      Array.isArray(couriers) &&
      couriers.length > 0;

    return { serviceable };
  }

  /**
   * Resolve the Shiprocket pickup-location nickname (Req 11.1). Prefers an
   * explicitly configured value (constructor option or SHIPROCKET_PICKUP_LOCATION);
   * when none is set, falls back to the account's primary pickup nickname, and
   * finally to the default nickname when the account exposes none.
   */
  async function resolvePickupLocation() {
    const value = pickupLocation ?? env.SHIPROCKET_PICKUP_LOCATION;
    const trimmed = value === undefined || value === null ? "" : String(value).trim();
    if (trimmed !== "") return trimmed;
    const detected = (await fetchAccountPickup()).location;
    return detected || DEFAULT_PICKUP_LOCATION;
  }

  /**
   * Build the Shiprocket "create adhoc order" payload from a customer order.
   * Maps our order/customer/items shape onto Shiprocket's required fields.
   *
   * @param {object} order an Order document or plain object
   * @returns {object} the adhoc-order request body
   */
  function buildAdhocOrderPayload(order, pickupLocationName) {
    const customer = order.customer ?? {};
    const { first, last } = splitName(customer.name);
    const items = Array.isArray(order.items) ? order.items : [];
    const orderItems = items.map((item) => ({
      name: item.name,
      sku: String(item.productId ?? item.name ?? "item"),
      units: item.quantity,
      selling_price: item.unitPrice,
    }));
    const subTotal =
      typeof order.amount === "number"
        ? order.amount
        : items.reduce(
            (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0),
            0
          );

    return {
      order_id: order.orderId,
      order_date: new Date(order.createdAt ?? now()).toISOString().slice(0, 10),
      pickup_location: pickupLocationName,
      billing_customer_name: first,
      billing_last_name: last,
      billing_address: customer.address,
      billing_city: customer.city,
      billing_pincode: customer.pincode,
      billing_state: customer.state,
      billing_country: "India",
      billing_email: customer.email || "",
      billing_phone: customer.phone,
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
      sub_total: subTotal,
      length: parcel.length,
      breadth: parcel.breadth,
      height: parcel.height,
      weight: parcel.weight,
    };
  }

  /**
   * Persist a successful fulfilment result onto the order: store the AWB,
   * courier, and Shiprocket order id and set `shipmentStatus = CREATED`
   * (Req 11.3, 17.5).
   *
   * @returns {Promise<object|null>} the updated order (lean), or null
   */
  async function persistCreated(order, { awb, courier, shiprocketOrderId }) {
    return orderModel.findByIdAndUpdate(
      order._id,
      {
        $set: {
          "shipping.awb": awb,
          "shipping.courier": courier,
          "shipping.shiprocketOrderId": shiprocketOrderId,
          shipmentStatus: "CREATED",
        },
      },
      { new: true }
    );
  }

  /**
   * Create a Shiprocket shipment for a customer order: create the SR order,
   * assign a courier, and generate an AWB (Req 11.1, 11.2). On success the AWB
   * and courier are stored and `shipmentStatus` becomes CREATED (Req 11.3,
   * 17.5). On any Shiprocket error or unavailability the reason is logged, the
   * order's `shipmentStatus` is left PENDING (Req 11.5, 11.6, 17.6), and this
   * method NEVER throws to the caller — the customer order is unaffected
   * (Property 22).
   *
   * @param {object} order an Order document (or plain object with `_id`)
   * @returns {Promise<{ ok: boolean, shipmentStatus: "CREATED"|"PENDING",
   *   awb?: string, courier?: string, shiprocketOrderId?: string,
   *   reason?: string }>}
   */
  async function createShipment(order) {
    if (!order || !order._id) {
      // Defensive: a missing order is a programming error, not a Shiprocket
      // failure. Log and report PENDING without throwing.
      logger.error("createShipment called without a valid order", {
        orderId: order?.orderId ?? null,
      });
      return { ok: false, shipmentStatus: "PENDING", reason: "missing order" };
    }

    try {
      // 1) Create the Shiprocket order (adhoc). The pickup nickname is the
      // configured value, or auto-detected from the account when unset.
      const pickupLocationName = await resolvePickupLocation();
      const createRes = await authenticatedRequest({
        method: "POST",
        url: `${baseUrl}${CREATE_ORDER_PATH}`,
        body: buildAdhocOrderPayload(order, pickupLocationName),
      });

      if (createRes.status < 200 || createRes.status >= 300 || !createRes.data) {
        throw new ShipmentStepError(
          "create_order",
          `Shiprocket order creation failed with status ${createRes.status}`,
          createRes.data
        );
      }

      const shipmentId =
        createRes.data.shipment_id ?? createRes.data.shipmentId ?? null;
      const shiprocketOrderId = String(
        createRes.data.order_id ?? createRes.data.orderId ?? ""
      );
      if (!shipmentId) {
        throw new ShipmentStepError(
          "create_order",
          "Shiprocket order creation returned no shipment_id",
          createRes.data
        );
      }

      // 2) Assign a courier and generate the AWB.
      const awbRes = await authenticatedRequest({
        method: "POST",
        url: `${baseUrl}${ASSIGN_AWB_PATH}`,
        body: { shipment_id: shipmentId },
      });

      if (awbRes.status < 200 || awbRes.status >= 300 || !awbRes.data) {
        throw new ShipmentStepError(
          "assign_awb",
          `Shiprocket AWB assignment failed with status ${awbRes.status}`,
          awbRes.data
        );
      }

      // Shiprocket nests the assignment result under response.data.
      const awbData = awbRes.data?.response?.data ?? awbRes.data;
      const awb = awbData?.awb_code ?? awbData?.awb ?? null;
      const courier = awbData?.courier_name ?? awbData?.courier ?? null;
      if (!awb) {
        throw new ShipmentStepError(
          "assign_awb",
          "Shiprocket AWB assignment returned no awb_code",
          awbRes.data
        );
      }

      // 3) Persist success (Req 11.3, 17.5).
      await persistCreated(order, { awb, courier, shiprocketOrderId });

      return {
        ok: true,
        shipmentStatus: "CREATED",
        awb,
        courier,
        shiprocketOrderId,
      };
    } catch (error) {
      // Req 11.5/11.6/17.6 + Property 22: log the reason server-side, keep the
      // order PENDING, and never propagate the failure to the caller.
      logger.error("Shiprocket shipment creation failed; order stays PENDING", {
        orderId: order.orderId ?? null,
        step: error?.step ?? "unknown",
        reason: error?.message ?? String(error),
      });
      return {
        ok: false,
        shipmentStatus: "PENDING",
        reason: error?.message ?? String(error),
      };
    }
  }

  /**
   * Cancel an order's Shiprocket shipment so the courier pickup is called off
   * when an administrator cancels the order.
   *
   * Prefers cancelling the Shiprocket ORDER (by `shipping.shiprocketOrderId`),
   * which voids the whole shipment; falls back to cancelling by AWB when only
   * the AWB reference exists. When the order carries no Shiprocket reference
   * there is nothing to cancel and the call reports success with
   * `skipped: true`.
   *
   * Mirrors {@link createShipment}'s failure contract: any Shiprocket error or
   * unavailability is logged server-side and reported as `{ ok: false }` —
   * this method NEVER throws, because a missed pickup cancellation is
   * recoverable manually in the Shiprocket dashboard and must not block the
   * (already refunded) order cancellation.
   *
   * @param {object} order an Order document or plain object with `shipping`
   * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string }>}
   */
  async function cancelShipment(order) {
    const shiprocketOrderId = order?.shipping?.shiprocketOrderId;
    const awb = order?.shipping?.awb;
    if (!shiprocketOrderId && !awb) {
      return { ok: true, skipped: true, reason: "no shipment to cancel" };
    }

    try {
      let response;
      if (shiprocketOrderId) {
        // Shiprocket expects numeric order ids; fall back to the raw value
        // when it is not numeric.
        const numericId = Number(shiprocketOrderId);
        response = await authenticatedRequest({
          method: "POST",
          url: `${baseUrl}${CANCEL_ORDER_PATH}`,
          body: {
            ids: [Number.isFinite(numericId) ? numericId : shiprocketOrderId],
          },
        });
      } else {
        response = await authenticatedRequest({
          method: "POST",
          url: `${baseUrl}${CANCEL_AWB_PATH}`,
          body: { awbs: [awb] },
        });
      }

      if (response.status < 200 || response.status >= 300) {
        throw new ShipmentStepError(
          "cancel_shipment",
          `Shiprocket cancellation failed with status ${response.status}`,
          response.data
        );
      }

      return { ok: true };
    } catch (error) {
      logger.error("Shiprocket shipment cancellation failed.", {
        orderId: order?.orderId ?? null,
        shiprocketOrderId: shiprocketOrderId ?? null,
        awb: awb ?? null,
        reason: error?.message ?? String(error),
        // Raw Shiprocket API response, for troubleshooting (e.g. "shipment
        // already picked up"). Never surfaced to customers.
        providerResponse: error?.detail ?? null,
      });
      return { ok: false, reason: error?.message ?? String(error) };
    }
  }

  /**
   * Background sweep that attempts Shiprocket fulfilment for every order still
   * awaiting a courier/AWB (Req 11.7). Orders with `shipmentStatus = PENDING`
   * that are not cancelled are retried via {@link createShipment}, which itself
   * never throws — so one order's failure never aborts the sweep.
   *
   * @param {object} [opts]
   * @param {number} [opts.limit=50] maximum orders processed per sweep
   * @returns {Promise<{ processed: number, created: number, stillPending: number }>}
   */
  async function retryPendingShipments({ limit = 50 } = {}) {
    let pending = [];
    try {
      pending = await orderModel
        .find({
          shipmentStatus: "PENDING",
          orderStatus: { $nin: ["CANCELLED", "RTO"] },
        })
        .limit(limit);
    } catch (error) {
      logger.error("retryPendingShipments could not load pending orders", {
        reason: error?.message ?? String(error),
      });
      return { processed: 0, created: 0, stillPending: 0 };
    }

    let created = 0;
    let stillPending = 0;
    for (const order of pending) {
      const result = await createShipment(order);
      if (result.ok) created += 1;
      else stillPending += 1;
    }

    return { processed: pending.length, created, stillPending };
  }

  return Object.freeze({
    getToken,
    checkServiceability,
    authenticatedRequest,
    createShipment,
    cancelShipment,
    retryPendingShipments,
  });
}

/**
 * Default application Shipping_Service instance (uses the real fetch-based HTTP
 * client and process.env). Service-internal token state lives within it.
 */
export const shippingService = createShippingService();

/** Bound convenience exports over the default instance. */
export const getToken = (...args) => shippingService.getToken(...args);
export const checkServiceability = (...args) =>
  shippingService.checkServiceability(...args);
export const createShipment = (...args) =>
  shippingService.createShipment(...args);
export const cancelShipment = (...args) =>
  shippingService.cancelShipment(...args);
export const retryPendingShipments = (...args) =>
  shippingService.retryPendingShipments(...args);

export default shippingService;
