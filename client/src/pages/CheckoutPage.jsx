import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";

import apiClient, { ApiError } from "../lib/apiClient.js";
import pixel from "../lib/pixel.js";
import { getUtm } from "../lib/utm.js";
import { formatINR, mediaUrl } from "../lib/format.js";
import logoSrc from "../assets/logo.webp";
import "./CheckoutPage.css";

/** Footer links matching the landing page (Req 20.2). */
const FOOTER_LINKS = [
  { to: "/privacy-policy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/shipping-policy", label: "Shipping Policy" },
  { to: "/terms-of-service", label: "Terms & Conditions" },
];

/** SVG trust icons (matching the landing-page design language). */
function IconLock() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="checkout__trust-svg">
      <rect x="8" y="20" width="32" height="22" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M14 20V14a10 10 0 0120 0v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="31" r="3" fill="currentColor" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="checkout__trust-svg">
      <rect x="4" y="10" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M24 20v8M21 22h6M21 26h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="checkout__trust-svg">
      <path d="M4 10h24v22H4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M28 18h8l6 8v6h-6" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="34" r="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <circle cx="36" cy="34" r="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M16 32h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="checkout__trust-svg">
      <path d="M8 8h32a4 4 0 014 4v18a4 4 0 01-4 4H18l-8 8v-8a4 4 0 01-4-4V12a4 4 0 014-4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M16 20h16M16 26h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Trust items displayed below the order summary for ad-traffic confidence. */
const TRUST_ITEMS = [
  { Icon: IconLock, label: "Secure Payments" },
  { Icon: IconCash, label: "COD Available" },
  { Icon: IconTruck, label: "Fast Shipping" },
  { Icon: IconChat, label: "Customer Support" },
];

/**
 * Branded header shared across all checkout states. Deliberately minimal for
 * paid-ad traffic: logo + a single WhatsApp support action, no exit links.
 */
function CheckoutHeader() {
  return (
    <header className="checkout__header">
      <span className="checkout__logo">
        <img src={logoSrc} alt="Planet of Toys" className="checkout__logo-img" />
      </span>
      <a className="checkout__whatsapp" href="https://wa.me/918448617222" target="_blank" rel="noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor" className="checkout__whatsapp-icon" aria-hidden="true">
          <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.4-3c-.3-.4 0-.6.2-.8l.4-.5c.1-.2.1-.3.2-.5v-.5L9.5 8c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.2s1 2.6 1.1 2.8c.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.4z" />
        </svg>
        <span>WhatsApp Us</span>
      </a>
    </header>
  );
}

/** Branded footer shared across all checkout states. */
function CheckoutFooter() {
  return (
    <footer className="checkout__footer">
      <nav className="checkout__footer-links">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.label} to={link.to} className="checkout__footer-link">{link.label}</Link>
        ))}
      </nav>
      <p className="checkout__footer-copy">© {new Date().getFullYear()} Planet of Toys</p>
    </footer>
  );
}

/**
 * Checkout Page (Req 4, 5, 6).
 *
 * Entered from the Landing Page Buy Now control, which navigates here with
 * `{ slug, quantity }` in the router location state. The page:
 *   - Renders an order summary: product, selected quantity, total (Req 4.1).
 *   - Collects name, phone, email, full address, city, state, and pincode with
 *     per-field inline validation that names the affected field and blocks
 *     submission (Req 4.2, 4.5).
 *   - Checks Shiprocket pincode serviceability and blocks submission with a
 *     non-serviceable message when delivery is unavailable (Req 4.4).
 *   - Offers an Online / Cash-on-Delivery payment selector (Req 4.6).
 *   - Online: creates a Razorpay order, opens Razorpay checkout, and posts the
 *     payment signature for server-side verification + order creation (Req 5.1).
 *   - COD: requests a WhatsApp OTP, then verifies the entered OTP as part of
 *     order creation; a mismatch shows a verification-failed message
 *     (Req 6.1, 6.2, 6.3).
 *   - Fires the Meta Pixel InitiateCheckout event on entry (Req 3.2).
 *
 * All visual styling consumes the shared design tokens in styles/tokens.css via
 * CheckoutPage.css, following the Form Design tokens (min 48px input height,
 * 10px radius, inline validation in the error/success colors).
 */

/** Backend endpoints consumed by the checkout flow. */
const ENDPOINTS = {
  product: (slug) => `/api/products/${slug}`,
  serviceability: (pincode) =>
    `/api/shipping/serviceability?pincode=${encodeURIComponent(pincode)}`,
  razorpayOrder: "/api/payment/razorpay-order",
  otpRequest: "/api/otp/request",
  orders: "/api/orders",
};

/** URL of the Razorpay hosted checkout script. */
const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/; // 10-digit Indian mobile number
const PINCODE_RE = /^\d{6}$/; // 6-digit Indian postal code

/**
 * The customer form fields, in render order, with human-readable labels.
 * `digitsOnly` fields strip non-digits as the user types and cap at
 * `maxLength`; `prefix` renders a fixed visual prefix (the stored value
 * remains the bare 10-digit number the OTP/order APIs expect).
 */
const FIELDS = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name", placeholder: "Your full name" },
  { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel", inputMode: "numeric", placeholder: "10-digit mobile number", maxLength: 10, digitsOnly: true, prefix: "+91" },
  { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@example.com" },
  { name: "address", label: "Full address", type: "text", autoComplete: "street-address", textarea: true, placeholder: "House no., street, area, landmark" },
  { name: "city", label: "City", type: "text", autoComplete: "address-level2", placeholder: "City" },
  { name: "state", label: "State", type: "text", autoComplete: "address-level1", placeholder: "State" },
  { name: "pincode", label: "Pincode", type: "text", autoComplete: "postal-code", inputMode: "numeric", placeholder: "6-digit pincode", maxLength: 6, digitsOnly: true },
];

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};

/**
 * Validate a single field value, returning an error message naming the field
 * when invalid, or an empty string when the value is acceptable (Req 4.5).
 */
function validateField(name, value) {
  const trimmed = (value ?? "").trim();
  switch (name) {
    case "name":
      return trimmed ? "" : "Please enter your full name.";
    case "phone":
      if (!trimmed) return "Please enter your phone number.";
      return PHONE_RE.test(trimmed)
        ? ""
        : "Enter a valid 10-digit mobile number.";
    case "email":
      if (!trimmed) return "Please enter your email address.";
      return EMAIL_RE.test(trimmed) ? "" : "Enter a valid email address.";
    case "address":
      return trimmed ? "" : "Please enter your full address.";
    case "city":
      return trimmed ? "" : "Please enter your city.";
    case "state":
      return trimmed ? "" : "Please enter your state.";
    case "pincode":
      if (!trimmed) return "Please enter your pincode.";
      return PINCODE_RE.test(trimmed) ? "" : "Enter a valid 6-digit pincode.";
    default:
      return "";
  }
}

/** Validate the whole form; returns a map of fieldName -> error message. */
function validateForm(form) {
  const errors = {};
  for (const { name } of FIELDS) {
    const message = validateField(name, form[name]);
    if (message) errors[name] = message;
  }
  return errors;
}

/**
 * Load the Razorpay checkout script on demand and resolve the `Razorpay`
 * constructor. Resolves immediately when it is already available (e.g. injected
 * by a test). Rejects when the script cannot be loaded.
 */
function loadRazorpay() {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Razorpay checkout is unavailable."));
      return;
    }
    const existing = document.querySelector(
      `script[src="${RAZORPAY_CHECKOUT_SRC}"]`
    );
    const onLoaded = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay checkout failed to initialize."));
    };
    if (existing) {
      existing.addEventListener("load", onLoaded, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay checkout failed to load.")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.addEventListener("load", onLoaded, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Razorpay checkout failed to load.")),
      { once: true }
    );
    document.body.appendChild(script);
  });
}

export default function CheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug: paramSlug } = useParams();

  const slug = location.state?.slug || paramSlug;
  const rawQuantity = location.state?.quantity;
  const initialQty = Number.isInteger(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;
  const [quantity, setQuantity] = useState(initialQty);

  const [product, setProduct] = useState(null);
  // status: "empty" | "loading" | "ready" | "notfound" | "error"
  const [status, setStatus] = useState(slug ? "loading" : "empty");

  // Selected color variation; null for products without variants.
  const [selectedColor, setSelectedColor] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState("ONLINE");

  // Serviceability for the currently entered pincode (Req 4.4).
  // state: "idle" | "checking" | "serviceable" | "non-serviceable" | "error"
  const [service, setService] = useState({ state: "idle", pincode: "" });

  // COD OTP flow (Req 6). stage: "form" | "otp".
  const [codStage, setCodStage] = useState("form");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Fire InitiateCheckout exactly once on entry (Req 3.2). The ref guards
  // against React 18 StrictMode double-invocation in development.
  const checkoutFired = useRef(false);
  useEffect(() => {
    if (checkoutFired.current) return;
    checkoutFired.current = true;
    pixel.initiateCheckout();
  }, []);

  // Resolve the product for the order summary (Req 4.1).
  useEffect(() => {
    if (!slug) {
      setStatus("empty");
      return;
    }
    let active = true;
    setStatus("loading");
    apiClient
      .get(ENDPOINTS.product(slug))
      .then((res) => {
        if (!active) return;
        const resolved = res?.product ?? res;
        if (!resolved) {
          setStatus("notfound");
          return;
        }
        setProduct(resolved);
        // Default to the first in-stock color for variant products.
        const productVariants = Array.isArray(resolved.variants)
          ? resolved.variants
          : [];
        if (productVariants.length > 0) {
          const firstAvailable =
            productVariants.find((v) => Number(v.stock) > 0) ??
            productVariants[0];
          setSelectedColor(firstAvailable.color);
        }
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setStatus("notfound");
        } else {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const total = useMemo(() => {
    if (!product) return 0;
    return Number(product.price) * quantity;
  }, [product, quantity]);

  const discountPercent = useMemo(() => {
    if (!product) return 0;
    if (Number.isFinite(product.discountPercent)) return product.discountPercent;
    const compare = Number(product.compareAtPrice);
    const price = Number(product.price);
    if (compare > 0 && price >= 0 && price <= compare) {
      return Math.round(((compare - price) / compare) * 100);
    }
    return 0;
  }, [product]);

  const hasCompareAt =
    product &&
    Number.isFinite(Number(product.compareAtPrice)) &&
    Number(product.compareAtPrice) > Number(product.price);

  function increaseQuantity() { setQuantity((q) => q + 1); }
  function decreaseQuantity() { setQuantity((q) => Math.max(1, q - 1)); }

  function handleFieldChange(name, value) {
    const field = FIELDS.find((f) => f.name === name);
    if (field?.digitsOnly) {
      value = value.replace(/\D/g, "").slice(0, field.maxLength);
    }
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear a field error as soon as the user edits it.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
    setSubmitError("");
    if (name === "pincode") {
      // A changed pincode invalidates any previous serviceability result.
      setService({ state: "idle", pincode: "" });
    }
  }

  function handleFieldBlur(name) {
    const message = validateField(name, form[name]);
    setErrors((prev) => ({ ...prev, [name]: message }));
    if (name === "pincode" && !message) {
      // Proactively confirm serviceability once the pincode is well-formed.
      void runServiceabilityCheck(form.pincode.trim());
    }
  }

  /**
   * Query Shiprocket serviceability for a pincode and record the outcome
   * (Req 4.4). Returns true only when delivery is available. Network/transport
   * failures resolve to a blocking "error" state so submission is never allowed
   * against an unverified pincode.
   */
  async function runServiceabilityCheck(pincode) {
    if (!PINCODE_RE.test(pincode)) {
      setService({ state: "idle", pincode: "" });
      return false;
    }
    setService({ state: "checking", pincode });
    try {
      const res = await apiClient.get(ENDPOINTS.serviceability(pincode));
      const serviceable = Boolean(res?.serviceable);
      setService({
        state: serviceable ? "serviceable" : "non-serviceable",
        pincode,
      });
      return serviceable;
    } catch {
      setService({ state: "error", pincode });
      return false;
    }
  }

  /** Shared customer payload used by both payment paths. */
  function buildCustomer() {
    return {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
    };
  }

  /**
   * Validate the form and confirm serviceability before any payment path runs.
   * Returns true when the order may proceed (Req 4.4, 4.5).
   */
  async function validateBeforeSubmit() {
    setSubmitError("");
    const formErrors = validateForm(form);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return false;
    }
    const pincode = form.pincode.trim();
    // Reuse a confirmed result for the same pincode; otherwise check now.
    if (service.state === "serviceable" && service.pincode === pincode) {
      return true;
    }
    const serviceable = await runServiceabilityCheck(pincode);
    return serviceable;
  }

  /** Navigate to the success page once an order has been created. */
  function completeOrder(order) {
    navigate("/order/success", { state: { order } });
  }

  /** Online payment: Razorpay create-order, checkout, then verify on the server. */
  async function payOnline() {
    let orderInfo;
    try {
      orderInfo = await apiClient.post(ENDPOINTS.razorpayOrder, {
        amount: total,
      });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "We couldn't start the payment. Please try again."
      );
      setSubmitting(false);
      return;
    }

    let Razorpay;
    try {
      Razorpay = await loadRazorpay();
    } catch {
      setSubmitError("Online payment is unavailable right now. Please try Cash on Delivery.");
      setSubmitting(false);
      return;
    }

    const checkout = new Razorpay({
      key: orderInfo.keyId,
      amount: orderInfo.amount,
      currency: orderInfo.currency ?? "INR",
      order_id: orderInfo.razorpayOrderId,
      name: "Planet of Toys",
      description: product?.name ?? "Order",
      prefill: {
        name: form.name.trim(),
        email: form.email.trim(),
        contact: form.phone.trim(),
      },
      handler: async (response) => {
        try {
          const result = await apiClient.post(ENDPOINTS.orders, {
            slug,
            quantity,
            color: selectedColor,
            amount: total,
            customer: buildCustomer(),
            paymentMethod: "ONLINE",
            razorpay: {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
            utm: getUtm(),
          });
          completeOrder(result?.order ?? result);
        } catch (err) {
          setSubmitError(
            err instanceof ApiError
              ? err.message
              : "Payment could not be verified. Please try again."
          );
          setSubmitting(false);
        }
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
    });

    // Surface payment failures (declined card, UPI timeout, etc.) instead of
    // failing silently; the Pay button re-enables so the customer can retry.
    if (typeof checkout.on === "function") {
      checkout.on("payment.failed", () => {
        setSubmitError(
          "Payment failed or was declined. Please try again, or choose Cash on Delivery."
        );
        setSubmitting(false);
      });
    }

    checkout.open();
  }

  /** COD step 1: request a WhatsApp OTP for the entered phone number (Req 6.1). */
  async function requestCodOtp() {
    setOtpError("");
    try {
      await apiClient.post(ENDPOINTS.otpRequest, { phone: form.phone.trim() });
      setCodStage("otp");
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "We couldn't send the verification code. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** COD step 2: verify the entered OTP as part of order creation (Req 6.2, 6.3). */
  async function submitCodOtp(event) {
    event.preventDefault();
    setOtpError("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError("Enter the 6-digit code sent to your phone.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiClient.post(ENDPOINTS.orders, {
        slug,
        quantity,
        color: selectedColor,
        amount: total,
        customer: buildCustomer(),
        paymentMethod: "COD",
        otp: { phone: form.phone.trim(), code: otp.trim() },
        utm: getUtm(),
      });
      completeOrder(result?.order ?? result);
    } catch (err) {
      // A 400/401 here means the OTP did not match or has expired (Req 6.3).
      setOtpError(
        err instanceof ApiError && err.status >= 400 && err.status < 500
          ? "That code is incorrect or has expired. Please try again."
          : "We couldn't verify your code. Please try again."
      );
      setSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const ok = await validateBeforeSubmit();
    if (!ok) {
      setSubmitting(false);
      return;
    }

    if (paymentMethod === "ONLINE") {
      await payOnline();
    } else {
      await requestCodOtp();
    }
  }

  function resendOtp() {
    setSubmitting(true);
    void requestCodOtp();
  }

  // ---- Non-ready states -----------------------------------------------------

  if (status === "empty") {
    return (
      <>
        <CheckoutHeader />
        <main className="checkout checkout--state">
          <section className="checkout__notice">
            <h1 className="checkout__heading">Checkout</h1>
            <p>Your cart is empty. Please use the link from our ad or message us to order.</p>
            <a className="checkout__link-cta" href="https://wa.me/918448617222" target="_blank" rel="noreferrer">Order on WhatsApp</a>
          </section>
        </main>
        <CheckoutFooter />
      </>
    );
  }

  if (status === "loading") {
    return (
      <>
        <CheckoutHeader />
        <main className="checkout checkout--state" aria-busy="true">
          <section className="checkout__notice">
            <h1 className="checkout__heading">Checkout</h1>
            <p>Loading checkout…</p>
          </section>
        </main>
        <CheckoutFooter />
      </>
    );
  }

  if (status === "notfound" || status === "error") {
    return (
      <>
        <CheckoutHeader />
        <main className="checkout checkout--state">
          <section className="checkout__notice">
            <h1 className="checkout__heading">Checkout</h1>
            <p>We couldn't load your order. The product is unavailable — please try the ad link again or message us.</p>
            <a className="checkout__link-cta" href="https://wa.me/918448617222" target="_blank" rel="noreferrer">Chat on WhatsApp</a>
          </section>
        </main>
        <CheckoutFooter />
      </>
    );
  }

  // Variant products show the selected color's images in the summary; the
  // base product images are the fallback for colors without their own photos.
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const selectedVariant =
    variants.find((v) => v.color === selectedColor) ?? null;
  const galleryImages =
    selectedVariant && Array.isArray(selectedVariant.images) &&
    selectedVariant.images.length > 0
      ? selectedVariant.images
      : Array.isArray(product.images)
        ? product.images
        : [];
  const heroImage = galleryImages[0] ?? null;
  const allVariantsOut =
    variants.length > 0 && variants.every((v) => Number(v.stock) <= 0);
  const nonServiceable = service.state === "non-serviceable";
  const serviceErrored = service.state === "error";

  return (
    <>
      <CheckoutHeader />
      <main className="checkout">
        <h1 className="checkout__heading">Checkout</h1>

        <div className="checkout__layout">
          {/* ---- Order summary with enhanced product display (Req 4.1) ---- */}
          <aside className="checkout__summary checkout__card" aria-label="Order summary">
            <h2 className="checkout__summary-title">Order Summary</h2>

            {/* Enhanced product display for ad traffic */}
            <div className="checkout__product-hero">
              {heroImage ? (
                <img
                  className="checkout__product-image"
                  src={mediaUrl(heroImage)}
                  alt={product.name}
                />
              ) : (
                <div className="checkout__product-image checkout__product-image--placeholder" aria-hidden="true" />
              )}
            </div>

            <h3 className="checkout__product-name" data-testid="summary-name">
              {product.name}
            </h3>

            <div className="checkout__pricing">
              <span className="checkout__price">{formatINR(product.price)}</span>
              {hasCompareAt && (
                <span className="checkout__compare-price">{formatINR(product.compareAtPrice)}</span>
              )}
              {hasCompareAt && discountPercent > 0 && (
                <span className="checkout__discount-badge">{discountPercent}% OFF</span>
              )}
            </div>

            {/* Color selector for variant products — switching swaps images */}
            {variants.length > 0 && (
              <div className="checkout__colors">
                <span className="checkout__colors-label">
                  Color:{" "}
                  <strong data-testid="selected-color">{selectedColor}</strong>
                </span>
                <div
                  className="checkout__color-options"
                  role="group"
                  aria-label="Choose a color"
                >
                  {variants.map((variant) => {
                    const out = Number(variant.stock) <= 0;
                    const active = variant.color === selectedColor;
                    return (
                      <button
                        key={variant.color}
                        type="button"
                        className={`checkout__color-btn${active ? " checkout__color-btn--active" : ""}${out ? " checkout__color-btn--out" : ""}`}
                        onClick={() => setSelectedColor(variant.color)}
                        disabled={out}
                        aria-pressed={active}
                        data-testid={`color-${variant.color}`}
                      >
                        {Array.isArray(variant.images) && variant.images[0] ? (
                          <img
                            src={mediaUrl(variant.images[0])}
                            alt=""
                            className="checkout__color-thumb"
                          />
                        ) : null}
                        <span>{variant.color}</span>
                        {out ? (
                          <span className="checkout__color-oos">Out of stock</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {product.description && (
              <p className="checkout__product-desc">{product.description}</p>
            )}

            {/* Quantity selector */}
            <div className="checkout__qty-row">
              <span className="checkout__qty-label">Quantity</span>
              <div className="checkout__qty-control">
                <button type="button" className="checkout__qty-btn" onClick={decreaseQuantity} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
                <span className="checkout__qty-value" data-testid="summary-quantity">{quantity}</span>
                <button type="button" className="checkout__qty-btn" onClick={increaseQuantity} aria-label="Increase quantity">+</button>
              </div>
            </div>

            <div className="checkout__summary-total">
              <span>Total</span>
              <strong data-testid="summary-total">{formatINR(total)}</strong>
            </div>

            {/* Trust elements for ad-traffic confidence */}
            <div className="checkout__trust-strip">
              {TRUST_ITEMS.map((item) => (
                <div key={item.label} className="checkout__trust-badge">
                  <item.Icon />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Info bar */}
            <div className="checkout__info-bar">
              <span>✓ Free Shipping</span>
              <span>✓ Easy Returns</span>
              <span>✓ WhatsApp Support</span>
            </div>
          </aside>

        {/* ---- Customer form + payment ---- */}
        <section className="checkout__form-panel checkout__card">
          {codStage === "otp" ? (
            <form className="checkout__otp" onSubmit={submitCodOtp} noValidate>
              <h2 className="checkout__section-title">Verify your phone</h2>
              <p className="checkout__otp-help">
                We sent a 6-digit code to {form.phone.trim()} on WhatsApp. Enter
                it below to confirm your Cash on Delivery order.
              </p>
              <div className="checkout__field">
                <label className="checkout__label" htmlFor="otp-code">
                  Verification code
                </label>
                <input
                  id="otp-code"
                  className={`checkout__input${otpError ? " checkout__input--invalid" : ""}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  data-testid="otp-input"
                  onChange={(e) => {
                    setOtp(e.target.value);
                    setOtpError("");
                  }}
                  aria-invalid={Boolean(otpError)}
                  aria-describedby={otpError ? "otp-error" : undefined}
                />
                {otpError ? (
                  <p className="checkout__error" id="otp-error" role="alert" data-testid="otp-error">
                    {otpError}
                  </p>
                ) : null}
              </div>
              <button
                type="submit"
                className="checkout__cta checkout__cta--primary"
                data-testid="verify-otp"
                disabled={submitting}
              >
                {submitting ? "Verifying…" : "Verify & Place Order"}
              </button>
              <div className="checkout__otp-actions">
                <button
                  type="button"
                  className="checkout__link-btn"
                  onClick={resendOtp}
                  disabled={submitting}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="checkout__link-btn"
                  onClick={() => {
                    setCodStage("form");
                    setOtp("");
                    setOtpError("");
                  }}
                  disabled={submitting}
                >
                  Edit details
                </button>
              </div>
              {submitError ? (
                <p className="checkout__error" role="alert" data-testid="submit-error">
                  {submitError}
                </p>
              ) : null}
            </form>
          ) : (
            <form className="checkout__form" onSubmit={handleSubmit} noValidate>
              <h2 className="checkout__section-title">Delivery Details</h2>

              {FIELDS.map((field) => {
                const fieldError = errors[field.name];
                const errorId = `${field.name}-error`;
                const control = field.textarea ? (
                  <textarea
                    id={field.name}
                    name={field.name}
                    className={`checkout__input checkout__textarea${fieldError ? " checkout__input--invalid" : ""}`}
                    autoComplete={field.autoComplete}
                    placeholder={field.placeholder}
                    value={form[field.name]}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    onBlur={() => handleFieldBlur(field.name)}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? errorId : undefined}
                    rows={3}
                  />
                ) : (
                  <input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    inputMode={field.inputMode}
                    maxLength={field.maxLength}
                    className={`checkout__input${fieldError ? " checkout__input--invalid" : ""}`}
                    autoComplete={field.autoComplete}
                    placeholder={field.placeholder}
                    value={form[field.name]}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    onBlur={() => handleFieldBlur(field.name)}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? errorId : undefined}
                  />
                );
                return (
                  <div className="checkout__field" key={field.name}>
                    <label className="checkout__label" htmlFor={field.name}>
                      {field.label}
                    </label>
                    {field.prefix ? (
                      <div className={`checkout__prefix-wrap${fieldError ? " checkout__prefix-wrap--invalid" : ""}`}>
                        <span className="checkout__prefix" aria-hidden="true">{field.prefix}</span>
                        {control}
                      </div>
                    ) : (
                      control
                    )}
                    {fieldError ? (
                      <p
                        className="checkout__error"
                        id={errorId}
                        role="alert"
                        data-testid={`error-${field.name}`}
                      >
                        {fieldError}
                      </p>
                    ) : null}
                    {field.name === "pincode" && service.pincode === form.pincode.trim() ? (
                      <ServiceabilityNotice service={service} />
                    ) : null}
                  </div>
                );
              })}

              {/* ---- Payment method selector (Req 4.6) ---- */}
              <fieldset className="checkout__payment">
                <legend className="checkout__label">Payment method</legend>
                <label className="checkout__radio">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={paymentMethod === "ONLINE"}
                    onChange={() => setPaymentMethod("ONLINE")}
                    data-testid="payment-online"
                  />
                  <span>Pay Online</span>
                </label>
                <label className="checkout__radio">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={() => setPaymentMethod("COD")}
                    data-testid="payment-cod"
                  />
                  <span>Cash on Delivery</span>
                </label>
              </fieldset>

              {submitError ? (
                <p className="checkout__error" role="alert" data-testid="submit-error">
                  {submitError}
                </p>
              ) : null}

              <button
                type="submit"
                className="checkout__cta checkout__cta--primary"
                data-testid="place-order"
                disabled={submitting || nonServiceable || serviceErrored || allVariantsOut}
              >
                {allVariantsOut
                  ? "Out of Stock"
                  : submitting
                    ? "Processing…"
                    : paymentMethod === "ONLINE"
                      ? `Pay ${formatINR(total)}`
                      : "Continue to Verify"}
              </button>
            </form>
          )}
        </section>
        </div>
      </main>
      <CheckoutFooter />
    </>
  );
}

/** Inline serviceability feedback shown beneath the pincode field (Req 4.4). */
function ServiceabilityNotice({ service }) {
  if (service.state === "checking") {
    return (
      <p className="checkout__hint" data-testid="serviceability-checking">
        Checking delivery availability…
      </p>
    );
  }
  if (service.state === "serviceable") {
    return (
      <p className="checkout__success" data-testid="serviceability-ok">
        Delivery is available to this pincode.
      </p>
    );
  }
  if (service.state === "non-serviceable") {
    return (
      <p className="checkout__error" role="alert" data-testid="serviceability-blocked">
        Sorry, we don't deliver to this pincode yet.
      </p>
    );
  }
  if (service.state === "error") {
    return (
      <p className="checkout__error" role="alert" data-testid="serviceability-error">
        We couldn't check delivery for this pincode. Please try again.
      </p>
    );
  }
  return null;
}
