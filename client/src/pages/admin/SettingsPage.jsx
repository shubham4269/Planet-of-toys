import { useCallback, useEffect, useState } from "react";

import apiClient, { ApiError } from "../../lib/apiClient.js";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import "./SettingsPage.css";

/**
 * Admin System Settings page (Req 30).
 *
 * Surfaces the four integration configuration sections — Razorpay, Shiprocket,
 * WhatsApp, and Meta Pixel (Req 30.2–30.6) — against the System_Settings_Service
 * API:
 *   - List sections with masked credentials (`GET /api/admin/settings`). Secret
 *     values are never returned by the backend; the UI shows only a masked,
 *     non-secret suffix or a "configured / not set" indicator (Req 30.8, 30.9).
 *   - Save a section after per-field format validation feedback
 *     (`PUT /api/admin/settings/:section`). Invalid input is flagged inline and
 *     not submitted; a server-side format rejection surfaces its message and
 *     persists nothing (Req 30.14).
 *   - Test a connection / verify credentials before saving
 *     (`POST /api/admin/settings/:section/verify`), displaying only the boolean
 *     outcome and a generic message — no secrets are echoed (Req 30.15, 30.20).
 *
 * Every call carries the admin bearer token (see adminAuth). A 401 clears the
 * session and signals the admin shell to redirect to login (Req 21.3, 30.1,
 * 30.13).
 *
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.9, 30.15.
 */

/**
 * Section + field descriptors. The client-side `validate` regexes mirror the
 * backend format validators so the UI can give immediate per-field feedback
 * (Req 30.14); the backend remains the authoritative gate. `secret` fields are
 * write-only — the backend never returns their value, only a `configured` flag.
 */
export const SETTINGS_SECTIONS = [
  {
    id: "whatsapp",
    tabLabel: "WhatsApp",
    title: "WhatsApp Settings",
    description: "WhatsApp Business Cloud API credentials.",
    // Meta delivers inbound messages and delivery/read receipts to this path.
    // The admin pastes the full URL as the Callback URL in the Meta WhatsApp
    // webhook configuration and uses the Verify Token below as the verify
    // token; Meta's GET handshake is validated against it server-side.
    webhookPath: "/api/webhooks/whatsapp",
    webhookAriaLabel: "WhatsApp webhook URL",
    webhookDescription: (
      <>
        Paste this URL as the <strong>Callback URL</strong> in your Meta WhatsApp
        webhook configuration, and use the <strong>Verify Token</strong> below as
        the verify token. Then subscribe to the <code>messages</code> field to
        receive inbound messages and delivery/read receipts.
      </>
    ),
    fields: [
      {
        key: "phoneNumberId",
        label: "Phone Number ID",
        secret: false,
        placeholder: "123456789012345",
        hint: "Numeric, at least 6 digits.",
        validate: (v) => /^\d{6,}$/.test(v.trim()),
      },
      {
        key: "accessToken",
        label: "Access Token",
        secret: true,
        placeholder: "Enter a new token to update",
        hint: "At least 20 characters (letters, digits, . _ -).",
        validate: (v) => /^[A-Za-z0-9._-]{20,}$/.test(v.trim()),
      },
      {
        key: "verifyToken",
        label: "Verify Token",
        secret: true,
        placeholder: "Enter a new verify token to update",
        hint: "At least 8 characters.",
        validate: (v) => v.trim().length >= 8,
      },
    ],
  },
  {
    id: "razorpay",
    tabLabel: "Razorpay",
    title: "Razorpay Settings",
    description: "Online payment gateway credentials.",
    // Razorpay delivers payment events (captured, failed, refunds) to this
    // path. The admin pastes the full URL into the Razorpay dashboard webhook
    // setup and configures the same Webhook Secret below; deliveries are
    // verified server-side against the x-razorpay-signature HMAC.
    webhookPath: "/api/webhooks/razorpay",
    webhookAriaLabel: "Razorpay webhook URL",
    webhookDescription: (
      <>
        Paste this URL as the <strong>Webhook URL</strong> in your Razorpay
        dashboard (Settings → Webhooks) and set the same{" "}
        <strong>Webhook Secret</strong> below. Subscribe to{" "}
        <code>payment.captured</code> and <code>payment.failed</code>;
        unsigned or mismatched deliveries are rejected.
      </>
    ),
    fields: [
      {
        key: "keyId",
        label: "Razorpay Key ID",
        secret: false,
        placeholder: "rzp_live_XXXXXXXXXXXX",
        hint: "Starts with rzp_test_ or rzp_live_.",
        validate: (v) => /^rzp_(test|live)_[A-Za-z0-9]+$/.test(v.trim()),
      },
      {
        key: "keySecret",
        label: "Razorpay Key Secret",
        secret: true,
        placeholder: "Enter a new secret to update",
        hint: "At least 16 alphanumeric characters.",
        validate: (v) => /^[A-Za-z0-9]{16,}$/.test(v.trim()),
      },
      {
        key: "webhookSecret",
        label: "Razorpay Webhook Secret",
        secret: true,
        placeholder: "Enter a new webhook secret to update",
        hint: "At least 8 characters. Must match the secret configured in the Razorpay webhook setup.",
        validate: (v) => v.trim().length >= 8,
      },
    ],
  },
  {
    id: "shiprocket",
    tabLabel: "Shiprocket",
    title: "Shiprocket Settings",
    description: "Shipping provider account credentials.",
    // Inbound status webhooks are delivered to this path. The admin pastes the
    // full URL into the Shiprocket dashboard; authenticity is verified against
    // the server-side SHIPROCKET_WEBHOOK_TOKEN (sent as the x-api-key header).
    // NOTE: the path deliberately avoids the words "shiprocket"/"sr"/"kr" — the
    // Shiprocket dashboard rejects webhook URLs containing those keywords with
    // "Address is not allowed". The backend also still accepts the legacy
    // /api/webhooks/shiprocket path for compatibility.
    webhookPath: "/api/webhooks/courier",
    webhookAriaLabel: "Shiprocket webhook URL",
    webhookDescription: (
      <>
        Paste this URL into your Shiprocket dashboard to receive shipment status
        updates. Shiprocket must send the configured webhook token in the{" "}
        <code>x-api-key</code> header; otherwise requests are rejected.
      </>
    ),
    fields: [
      {
        key: "email",
        label: "Shiprocket Email",
        secret: false,
        placeholder: "ops@example.com",
        hint: "A valid email address.",
        validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      },
      {
        key: "password",
        label: "Shiprocket Password",
        secret: true,
        placeholder: "Enter a new password to update",
        hint: "At least 6 characters.",
        validate: (v) => v.length >= 6,
      },
      {
        key: "webhookToken",
        label: "Shiprocket Webhook Token",
        secret: true,
        placeholder: "Enter a new webhook token to update",
        hint: "At least 8 characters. Shiprocket sends this in the x-api-key header to authenticate webhooks.",
        validate: (v) => v.trim().length >= 8,
      },
    ],
  },
  {
    id: "metaPixel",
    tabLabel: "Meta Pixel",
    title: "Meta Pixel Settings",
    description: "Meta Pixel for ad-conversion tracking.",
    fields: [
      {
        key: "pixelId",
        label: "Meta Pixel ID",
        secret: false,
        placeholder: "1234567890",
        hint: "Numeric, 10–20 digits.",
        validate: (v) => /^\d{10,20}$/.test(v.trim()),
      },
    ],
  },
];

/** Describe a stored field's current state for read-only display (Req 30.9). */
function currentLabel(field, fieldState) {
  if (!fieldState || !fieldState.configured) return "Not set";
  if (field.secret) return "Configured";
  return fieldState.masked ? `Configured: ${fieldState.masked}` : "Configured";
}

/**
 * One configuration section: read-only masked state, per-field inputs with
 * format validation feedback, a Save action (PUT), and a Test-Connection /
 * Verify action (POST verify). Manages its own form/feedback state and reports
 * the refreshed masked settings to the parent on a successful save.
 */
function SettingsSection({ section, masked, onSettingsUpdate, onUnauthorized }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const fieldValue = (key) => values[key] ?? "";

  // Absolute URL the admin pastes into the provider dashboard (Req 12, 24).
  const webhookUrl =
    section.webhookPath && typeof window !== "undefined"
      ? `${window.location.origin}${section.webhookPath}`
      : section.webhookPath || "";

  async function copyWebhookUrl() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(webhookUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the URL stays selectable in the field.
    }
  }

  function setField(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  }

  /** Inline per-field format error, or null. Empty = "leave unchanged". */
  function fieldError(field) {
    const value = fieldValue(field.key);
    if (value.trim() === "") return null;
    return field.validate(value)
      ? null
      : `${field.label} is not in a valid format.`;
  }

  /** Collect only the non-empty fields the administrator filled in. */
  function buildPayload() {
    const payload = {};
    for (const field of section.fields) {
      const value = fieldValue(field.key);
      if (value.trim() !== "") payload[field.key] = value.trim();
    }
    return payload;
  }

  /** First client-side format problem among provided fields, or null. */
  function firstFormatError() {
    for (const field of section.fields) {
      const err = fieldError(field);
      if (err) return err;
    }
    return null;
  }

  function handleApiError(err, fallback) {
    if (err instanceof ApiError && err.status === 401) {
      onUnauthorized();
      return;
    }
    setError((err instanceof ApiError && err.message) || fallback);
  }

  async function handleSave(event) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setNotice(null);
    setVerifyResult(null);

    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      setError("Enter at least one value to save.");
      return;
    }
    const formatError = firstFormatError();
    if (formatError) {
      setError(formatError);
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.put(
        `/api/admin/settings/${section.id}`,
        payload,
        { token: getToken() }
      );
      if (res?.settings) onSettingsUpdate(res.settings);
      setValues({});
      setNotice("Settings saved.");
    } catch (err) {
      handleApiError(err, "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    if (verifying) return;
    setError(null);
    setNotice(null);
    setVerifyResult(null);

    const formatError = firstFormatError();
    if (formatError) {
      setError(formatError);
      return;
    }

    setVerifying(true);
    try {
      const res = await apiClient.post(
        `/api/admin/settings/${section.id}/verify`,
        buildPayload(),
        { token: getToken() }
      );
      setVerifyResult({
        verified: Boolean(res?.verified),
        message:
          res?.message ||
          (res?.verified
            ? "Connection verified successfully."
            : "Verification failed. Please check the credentials and try again."),
      });
    } catch (err) {
      handleApiError(err, "Unable to verify credentials.");
    } finally {
      setVerifying(false);
    }
  }

  const busy = saving || verifying;

  return (
    <section
      className="admin-settings__section"
      data-testid={`settings-section-${section.id}`}
    >
      <header className="admin-settings__section-head">
        <h2 className="admin-settings__section-title">{section.title}</h2>
        <p className="admin-settings__section-desc">{section.description}</p>
      </header>

      <form
        className="admin-settings__form"
        onSubmit={handleSave}
        autoComplete="off"
      >
        {/* Off-screen decoy username/password pair. Browsers autofill saved
            login credentials into the FIRST username+password fields they find;
            these hidden decoys absorb that autofill so the real integration
            inputs (Razorpay key/secret, Shiprocket email/password, WhatsApp
            token, etc.) are never overwritten with the admin login. */}
        <input
          type="text"
          name="pot-decoy-username"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
        <input
          type="password"
          name="pot-decoy-password"
          autoComplete="new-password"
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
        {section.webhookPath ? (
          <div
            className="admin-settings__webhook"
            data-testid={`webhook-${section.id}`}
          >
            <span className="admin-settings__label">Webhook URL</span>
            <span className="admin-settings__hint">
              {section.webhookDescription ??
                "Paste this URL into the provider dashboard to receive event callbacks."}
            </span>
            <div className="admin-settings__webhook-row">
              <input
                className="admin-settings__input admin-settings__webhook-url"
                type="text"
                readOnly
                value={webhookUrl}
                data-testid={`webhook-url-${section.id}`}
                onFocus={(e) => e.target.select()}
                aria-label={section.webhookAriaLabel ?? "Webhook URL"}
              />
              <button
                type="button"
                className="admin-settings__ghost admin-settings__webhook-copy"
                onClick={copyWebhookUrl}
                data-testid={`webhook-copy-${section.id}`}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}

        {section.fields.map((field) => {
          const inlineError = fieldError(field);
          const errorId = `${section.id}-${field.key}-error`;
          return (
            <div className="admin-settings__field" key={field.key}>
              <label
                className="admin-settings__label"
                htmlFor={`${section.id}-${field.key}`}
              >
                {field.label}
              </label>
              <span
                className="admin-settings__current"
                data-testid={`current-${section.id}-${field.key}`}
              >
                {currentLabel(field, masked?.[field.key])}
              </span>
              <input
                id={`${section.id}-${field.key}`}
                name={`pot-setting-${section.id}-${field.key}`}
                className={`admin-settings__input${
                  inlineError ? " admin-settings__input--invalid" : ""
                }`}
                type={field.secret ? "password" : "text"}
                value={fieldValue(field.key)}
                placeholder={field.placeholder}
                autoComplete={field.secret ? "new-password" : "off"}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={inlineError ? "true" : "false"}
                aria-describedby={inlineError ? errorId : undefined}
                onChange={(e) => setField(field.key, e.target.value)}
              />
              {inlineError ? (
                <span
                  id={errorId}
                  className="admin-settings__field-error"
                  role="alert"
                >
                  {inlineError}
                </span>
              ) : (
                <span className="admin-settings__hint">{field.hint}</span>
              )}
            </div>
          );
        })}

        {error ? (
          <p className="admin-settings__error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="admin-settings__notice" role="status">
            {notice}
          </p>
        ) : null}
        {verifyResult ? (
          <p
            className={`admin-settings__verify admin-settings__verify--${
              verifyResult.verified ? "ok" : "fail"
            }`}
            role="status"
            data-testid={`verify-result-${section.id}`}
          >
            {verifyResult.message}
          </p>
        ) : null}

        <div className="admin-settings__actions">
          <button
            type="button"
            className="admin-settings__ghost"
            onClick={handleVerify}
            disabled={busy}
          >
            {verifying ? "Testing…" : "Test connection"}
          </button>
          <button
            type="submit"
            className="admin-settings__primary"
            disabled={busy}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(SETTINGS_SECTIONS[0].id);

  const handleUnauthorized = useCallback(() => {
    notifyUnauthorized();
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/api/admin/settings", {
        token: getToken(),
      });
      setSettings(res?.settings ?? {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError(
        (err instanceof ApiError && err.message) || "Unable to load settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const activeSection =
    SETTINGS_SECTIONS.find((s) => s.id === activeTab) ?? SETTINGS_SECTIONS[0];

  return (
    <section className="admin-settings">
      <header className="admin-settings__head">
        <h1 className="admin-settings__title">System Settings</h1>
        <p className="admin-settings__subtitle">
          Manage integration credentials. Stored secrets are encrypted and shown
          only in masked form.
        </p>
      </header>

      {error ? (
        <p className="admin-settings__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-settings__muted">Loading settings…</p>
      ) : (
        <div className="admin-settings__tabbed">
          <div
            className="admin-settings__tabs"
            role="tablist"
            aria-label="Integration settings"
          >
            {SETTINGS_SECTIONS.map((section) => {
              const isActive = section.id === activeTab;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${section.id}`}
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${section.id}`}
                  data-testid={`settings-tab-${section.id}`}
                  className={`admin-settings__tab${
                    isActive ? " admin-settings__tab--active" : ""
                  }`}
                  onClick={() => setActiveTab(section.id)}
                >
                  {section.tabLabel}
                </button>
              );
            })}
          </div>

          <div
            className="admin-settings__panel"
            role="tabpanel"
            id={`settings-panel-${activeSection.id}`}
            aria-labelledby={`settings-tab-${activeSection.id}`}
          >
            <SettingsSection
              key={activeSection.id}
              section={activeSection}
              masked={settings?.[activeSection.id]}
              onSettingsUpdate={setSettings}
              onUnauthorized={handleUnauthorized}
            />
          </div>
        </div>
      )}
    </section>
  );
}
