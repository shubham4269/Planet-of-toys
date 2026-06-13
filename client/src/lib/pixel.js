/**
 * Pixel Tracker (Req 3)
 *
 * A thin wrapper over the Meta Pixel global (`window.fbq`). `bootstrap()` —
 * called once at app startup (main.jsx) — installs the standard fbq queueing
 * stub, loads Meta's fbevents.js, and initializes the pixel with an id
 * resolved at RUNTIME from the server (`GET /api/config`, which serves the
 * value the admin saved in System Settings) with the Vite build-time
 * `VITE_META_PIXEL_ID` as fallback (Req 3.4). Everything degrades to a safe
 * no-op when no id is configured, in tests, or when a blocker removes `fbq`.
 *
 * Exposed events:
 *   - pageView()          -> standard `PageView`        (Req 3.1)
 *   - viewContent()       -> standard `ViewContent`     (Req 3.1)
 *   - initiateCheckout()  -> standard `InitiateCheckout` (Req 3.2)
 *   - purchase(value)     -> standard `Purchase` with value (Req 3.3)
 */

import apiClient from "./apiClient.js";

// Pixel identifier resolved at build time from the Vite environment (Req 3.4).
// Used by init() and as the fallback when the runtime config has no id.
export const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

/** Meta's pixel runtime script. */
const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

// Currency for monetary events. The platform operates in India (Razorpay /
// Shiprocket / COD), so Purchase values are reported in INR.
const CURRENCY = "INR";

/**
 * Forward a call to the Meta Pixel global if it is available.
 * Returns true when the call was dispatched, false when `fbq` is unavailable.
 */
function dispatch(...args) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return false;
  }
  window.fbq(...args);
  return true;
}

/**
 * Initialize the pixel with the build-time id. Safe to call more than once.
 * No-ops when no pixel id is configured.
 */
export function init() {
  if (!PIXEL_ID) {
    return false;
  }
  return dispatch("init", PIXEL_ID);
}

/**
 * Install the standard Meta fbq queueing stub so tracking calls made before
 * fbevents.js finishes loading are queued and replayed by the real runtime.
 * Returns false outside a browser; never overwrites an existing fbq.
 */
function installFbqStub() {
  if (typeof window === "undefined") return false;
  if (typeof window.fbq === "function") return true;
  const fbq = function (...args) {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, args);
    } else {
      fbq.queue.push(args);
    }
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = window._fbq || fbq;
  return true;
}

/** Inject Meta's fbevents.js exactly once. */
function injectFbevents() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src="${FBEVENTS_SRC}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
  document.head.appendChild(script);
}

/**
 * Bootstrap the pixel at app startup: resolve the pixel id (runtime config
 * from the server first, build-time env as fallback), install the fbq stub,
 * load fbevents.js, init the pixel, and fire the initial PageView (Req 3.1).
 *
 * Resolution and loading failures degrade silently — analytics must never
 * break the storefront. Returns true when the pixel was initialized.
 *
 * @param {object} [options]
 * @param {() => Promise<string|null>} [options.fetchPixelId] resolver override
 *   for tests; defaults to GET /api/config
 */
export async function bootstrap({ fetchPixelId } = {}) {
  let id = null;
  try {
    const resolve =
      fetchPixelId ??
      (async () => {
        const res = await apiClient.get("/api/config");
        return res?.metaPixelId ?? null;
      });
    id = await resolve();
  } catch {
    id = null;
  }
  if (!id) id = PIXEL_ID || null;
  if (!id) return false;

  if (!installFbqStub()) return false;
  injectFbevents();
  dispatch("init", id);
  dispatch("track", "PageView");
  return true;
}

/** Fire a standard PageView event (Req 3.1). */
export function pageView() {
  return dispatch("track", "PageView");
}

/** Fire a standard ViewContent event (Req 3.1). */
export function viewContent() {
  return dispatch("track", "ViewContent");
}

/** Fire a standard InitiateCheckout event (Req 3.2). */
export function initiateCheckout() {
  return dispatch("track", "InitiateCheckout");
}

/**
 * Fire a standard Purchase event including the order value (Req 3.3).
 * @param {number} value - the order total value.
 */
export function purchase(value) {
  return dispatch("track", "Purchase", { value, currency: CURRENCY });
}

const pixel = {
  PIXEL_ID,
  init,
  bootstrap,
  pageView,
  viewContent,
  initiateCheckout,
  purchase,
};

export default pixel;
