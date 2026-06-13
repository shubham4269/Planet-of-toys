import { getCredential } from "./credential.service.js";
import { logger as defaultLogger } from "../config/logger.js";

/**
 * WhatsApp Service — Meta WhatsApp Business Cloud API integration (Req 6.1, 13).
 *
 * Sends two kinds of messages through the WhatsApp Cloud API (Graph API):
 *
 *  - `sendOtp(phone, code)` — delivers a one-time password to the customer's
 *    phone number using the WhatsApp OTP template (Req 6.1).
 *  - `sendNotification(phone, template, params)` — delivers an order lifecycle
 *    notification using one of the supported templates (Req 13):
 *      order-confirmed, shipment-created, order-shipped, out-for-delivery,
 *      delivered, cancelled.
 *
 * Resilience (Req 13, "non-blocking"): WhatsApp delivery is a best-effort,
 * fire-and-forget side effect of the conversion flow. A send failure — whether
 * a network error, a non-2xx Graph API response, or missing configuration —
 * is logged on the server side and SWALLOWED. These methods NEVER throw to the
 * caller, so a messaging outage can never block or roll back order creation or
 * a status transition. Each method resolves to a result object describing the
 * outcome ({ ok: true, ... } or { ok: false, reason, ... }).
 *
 * Secret handling (Req 19.1): the WhatsApp access token is resolved server-side
 * via the credential service and used only as a request Authorization header.
 * It is never returned to a caller or placed in a result object.
 *
 * Testability: the HTTP client is injectable (`options.httpClient`) so tests
 * can mock every Graph API call and make no real network request. The Graph API
 * version/base URL, default language code, template-name map, and logger are
 * likewise injectable.
 */

/** Default Graph API base URL and version for the WhatsApp Cloud API. */
const GRAPH_API_BASE_URL = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v19.0";

/** Default WhatsApp template language (locale) code. */
const DEFAULT_LANGUAGE_CODE = "en";

/**
 * The set of supported order-notification templates (Req 13). The keys are the
 * logical template identifiers used by callers (Order_Service status dispatch);
 * the values are the registered WhatsApp Cloud API template names. WhatsApp
 * template names must be snake_case, so the logical kebab-case identifiers are
 * mapped to their registered counterparts.
 */
const DEFAULT_NOTIFICATION_TEMPLATES = Object.freeze({
  "order-confirmed": "order_confirmed",
  "shipment-created": "shipment_created",
  "order-shipped": "order_shipped",
  "out-for-delivery": "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
});

/** The registered WhatsApp template name used for OTP delivery (Req 6.1). */
const DEFAULT_OTP_TEMPLATE = "otp_verification";

/**
 * Default HTTP client backed by the global `fetch`. Performs a single request
 * and returns a normalized `{ status, data }` shape. JSON parsing failures
 * resolve `data` to `null` rather than throwing so callers branch on `status`.
 *
 * @returns {{ request: (opts: object) => Promise<{ status: number, data: any }> }}
 */
function createDefaultHttpClient() {
  return {
    async request({ method = "POST", url, headers = {}, body } = {}) {
      const response = await fetch(url, {
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

/**
 * Normalize the various accepted `params` shapes into a positional list of
 * WhatsApp body-parameter text values.
 *
 * Accepts:
 *   - an array of primitives  -> used directly as ordered body parameters
 *   - `{ bodyParams: [...] }`  -> the explicit ordered body parameters
 *   - any other object        -> its own enumerable values, in insertion order
 *   - null / undefined         -> no body parameters
 *
 * @param {unknown} params
 * @returns {string[]} ordered body-parameter text values
 */
function normalizeBodyParams(params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params.map((v) => String(v));
  if (typeof params === "object") {
    if (Array.isArray(params.bodyParams)) {
      return params.bodyParams.map((v) => String(v));
    }
    return Object.values(params)
      .filter((v) => v !== undefined && v !== null && typeof v !== "object")
      .map((v) => String(v));
  }
  return [String(params)];
}

/**
 * Build the WhatsApp Cloud API `template` message components from a list of
 * positional body-parameter values. Returns an empty `components` array when
 * there are no parameters (templates with no variables).
 *
 * @param {string[]} bodyParams
 * @returns {Array<object>} the `components` array for a template message
 */
function buildComponents(bodyParams) {
  if (!bodyParams.length) return [];
  return [
    {
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text })),
    },
  ];
}

/** Normalize a destination phone number to digits only (E.164 without `+`). */
function normalizePhone(phone) {
  if (phone === undefined || phone === null) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Create a WhatsApp_Service instance.
 *
 * @param {object} [options]
 * @param {{ request: Function }} [options.httpClient] injectable HTTP client
 * @param {Record<string, string|undefined>} [options.env=process.env]
 * @param {string} [options.baseUrl] Graph API base URL
 * @param {string} [options.apiVersion] Graph API version segment
 * @param {string} [options.languageCode] default template language code
 * @param {string} [options.otpTemplate] registered OTP template name
 * @param {Record<string,string>} [options.notificationTemplates] logical→registered map
 * @param {{ info?: Function, warn: Function, error: Function }} [options.logger]
 */
export function createWhatsAppService({
  httpClient = createDefaultHttpClient(),
  env = process.env,
  baseUrl = GRAPH_API_BASE_URL,
  apiVersion = GRAPH_API_VERSION,
  languageCode = DEFAULT_LANGUAGE_CODE,
  otpTemplate = DEFAULT_OTP_TEMPLATE,
  notificationTemplates = DEFAULT_NOTIFICATION_TEMPLATES,
  logger = defaultLogger,
} = {}) {
  /**
   * Resolve the WhatsApp Cloud API credentials (phone number id + access token)
   * for server-side use. Returns `null` when either is missing.
   *
   * @returns {Promise<{ phoneNumberId: string, accessToken: string } | null>}
   */
  async function resolveConfig() {
    const phoneNumberId = await getCredential("whatsapp", "phoneNumberId", { env });
    const accessToken = await getCredential("whatsapp", "accessToken", { env });
    if (!phoneNumberId || !accessToken) return null;
    return { phoneNumberId, accessToken };
  }

  /**
   * Send a WhatsApp template message. This is the single, internal send path
   * shared by `sendOtp` and `sendNotification`. It is fully non-blocking: every
   * failure mode is caught, logged server-side, and reported via the returned
   * result object — it NEVER throws (Req 13 non-blocking).
   *
   * @param {object} args
   * @param {string} args.phone destination phone number
   * @param {string} args.templateName registered WhatsApp template name
   * @param {string[]} [args.bodyParams=[]] positional body parameters
   * @param {string} [args.kind] descriptive label for log context
   * @returns {Promise<{ ok: boolean, reason?: string, messageId?: string }>}
   */
  async function sendTemplate({ phone, templateName, bodyParams = [], kind }) {
    try {
      const to = normalizePhone(phone);
      if (!to) {
        logger.warn("WhatsApp send skipped: invalid recipient phone number.", {
          kind,
          template: templateName,
        });
        return { ok: false, reason: "INVALID_PHONE" };
      }

      const config = await resolveConfig();
      if (!config) {
        logger.warn("WhatsApp send skipped: messaging is not configured.", {
          kind,
          template: templateName,
        });
        return { ok: false, reason: "NOT_CONFIGURED" };
      }

      const url = `${baseUrl}/${apiVersion}/${config.phoneNumberId}/messages`;
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: buildComponents(bodyParams),
        },
      };

      const { status, data } = await httpClient.request({
        method: "POST",
        url,
        headers: { Authorization: `Bearer ${config.accessToken}` },
        body: payload,
      });

      if (status < 200 || status >= 300) {
        // A non-2xx Graph API response is a delivery failure: log and swallow.
        logger.error("WhatsApp send failed: Graph API returned a non-2xx status.", {
          kind,
          template: templateName,
          status,
          error: data?.error,
        });
        return { ok: false, reason: "SEND_FAILED" };
      }

      const messageId = data?.messages?.[0]?.id;
      return { ok: true, messageId };
    } catch (error) {
      // Network errors and any other unexpected failure are non-blocking.
      logger.error("WhatsApp send failed: unexpected error.", {
        kind,
        template: templateName,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: "ERROR" };
    }
  }

  /**
   * Send a one-time password to a customer using the WhatsApp OTP template
   * (Req 6.1). Non-blocking: never throws.
   *
   * @param {string} phone the customer phone number
   * @param {string|number} code the OTP code to deliver
   * @returns {Promise<{ ok: boolean, reason?: string, messageId?: string }>}
   */
  async function sendOtp(phone, code) {
    return sendTemplate({
      phone,
      templateName: otpTemplate,
      bodyParams: [String(code ?? "")],
      kind: "otp",
    });
  }

  /**
   * Send an order-lifecycle notification using one of the supported templates
   * (Req 13.1–13.5). Non-blocking: never throws. An unknown logical template is
   * logged and rejected via the result object without attempting a send.
   *
   * @param {string} phone the customer phone number
   * @param {"order-confirmed"|"shipment-created"|"order-shipped"|"out-for-delivery"|"delivered"|"cancelled"} template
   * @param {object|Array<unknown>} [params] template body parameters
   * @returns {Promise<{ ok: boolean, reason?: string, messageId?: string }>}
   */
  async function sendNotification(phone, template, params) {
    const templateName = notificationTemplates[template];
    if (!templateName) {
      logger.warn("WhatsApp send skipped: unknown notification template.", {
        template,
      });
      return { ok: false, reason: "UNKNOWN_TEMPLATE" };
    }

    return sendTemplate({
      phone,
      templateName,
      bodyParams: normalizeBodyParams(params),
      kind: "notification",
    });
  }

  return Object.freeze({
    sendOtp,
    sendNotification,
    // Exposed for callers/tests that need the supported logical template ids.
    supportedTemplates: Object.freeze(Object.keys(notificationTemplates)),
  });
}

/**
 * Default application WhatsApp_Service instance (uses the real fetch-based HTTP
 * client and process.env).
 */
export const whatsappService = createWhatsAppService();

/** Bound convenience exports over the default instance. */
export const sendOtp = (...args) => whatsappService.sendOtp(...args);
export const sendNotification = (...args) =>
  whatsappService.sendNotification(...args);

export default whatsappService;
