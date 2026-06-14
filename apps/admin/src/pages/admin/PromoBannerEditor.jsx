// apps/admin/src/pages/admin/PromoBannerEditor.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { PromoBannerView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";

/**
 * Promotional header editor. Loads the banner, lets the admin toggle it, set
 * default colors / rotation interval / rightText, and manage the ordered list of
 * announcements (add / remove / reorder by drag-and-drop with up/down fallback).
 * A framed live preview renders the shared PromoBannerView from current form
 * state, with a Desktop/Mobile toggle. Saves the full banner via PUT.
 */

const API_PATH = "/api/admin/content/promo-banner";

/** Inline SVG icons (project rule: no icon fonts). */
function IconDrag() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" fill="currentColor" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}
function IconUp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconDown() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRemove() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A blank announcement row for the editor. */
function blankAnnouncement() {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    text: "",
    url: "",
    couponCode: "",
    bgColor: "",
    textColor: "",
    startAt: "",
    endAt: "",
    showOnMobile: true,
    showOnDesktop: true,
    enabled: true,
  };
}

/** Convert an ISO date (or null) to a value usable by <input type=datetime-local>. */
function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalize a loaded banner into editable form state. */
function toFormState(banner) {
  return {
    enabled: Boolean(banner?.enabled),
    bgColor: banner?.bgColor || "#E11B22",
    textColor: banner?.textColor || "#FFFFFF",
    rotationIntervalMs: banner?.rotationIntervalMs || 5000,
    rightText: banner?.rightText || "",
    announcements: (banner?.announcements ?? []).map((a) => ({
      id: a.id || `loaded-${Math.random().toString(36).slice(2)}`,
      text: a.text || "",
      url: a.url || "",
      couponCode: a.couponCode || "",
      bgColor: a.bgColor || "",
      textColor: a.textColor || "",
      startAt: toLocalInput(a.startAt),
      endAt: toLocalInput(a.endAt),
      showOnMobile: a.showOnMobile !== false,
      showOnDesktop: a.showOnDesktop !== false,
      enabled: a.enabled !== false,
    })),
  };
}

/** Build the API payload from form state (drop client-only ids/empties). */
function toPayload(form) {
  return {
    enabled: form.enabled,
    bgColor: form.bgColor,
    textColor: form.textColor,
    rotationIntervalMs: Number(form.rotationIntervalMs) || 5000,
    rightText: form.rightText.trim() || null,
    announcements: form.announcements.map((a) => ({
      text: a.text,
      url: a.url.trim() || null,
      couponCode: a.couponCode.trim() || null,
      bgColor: a.bgColor || null,
      textColor: a.textColor || null,
      startAt: a.startAt ? new Date(a.startAt).toISOString() : null,
      endAt: a.endAt ? new Date(a.endAt).toISOString() : null,
      showOnMobile: a.showOnMobile,
      showOnDesktop: a.showOnDesktop,
      enabled: a.enabled,
    })),
  };
}

export default function PromoBannerEditor() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [previewDevice, setPreviewDevice] = useState("desktop");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(API_PATH, { token: getToken() });
      setForm(toFormState(res?.banner));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError("Could not load the promotional header.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateAnnouncement(index, key, value) {
    setForm((f) => {
      const announcements = f.announcements.slice();
      announcements[index] = { ...announcements[index], [key]: value };
      return { ...f, announcements };
    });
  }

  function addAnnouncement() {
    setForm((f) => ({ ...f, announcements: [...f.announcements, blankAnnouncement()] }));
  }

  function removeAnnouncement(index) {
    setForm((f) => ({
      ...f,
      announcements: f.announcements.filter((_, i) => i !== index),
    }));
  }

  function move(from, to) {
    setForm((f) => {
      if (to < 0 || to >= f.announcements.length) return f;
      const announcements = f.announcements.slice();
      const [item] = announcements.splice(from, 1);
      announcements.splice(to, 0, item);
      return { ...f, announcements };
    });
  }

  function onDrop(index) {
    if (dragIndex === null || dragIndex === index) return;
    move(dragIndex, index);
    setDragIndex(null);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiClient.put(API_PATH, toPayload(form), { token: getToken() });
      setForm(toFormState(res?.banner));
      setMessage("Saved.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        notifyUnauthorized();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not save the promotional header.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="promo-editor__status">Loading…</p>;
  if (!form) return <p className="promo-editor__status">{error || "Unavailable."}</p>;

  // Preview mirrors the public endpoint's eligibility (enabled + schedule window)
  // and the storefront's device filter for the currently selected preview device.
  const previewNow = Date.now();
  const withinPreviewWindow = (a) => {
    if (a.startAt && previewNow < new Date(a.startAt).getTime()) return false;
    if (a.endAt && previewNow > new Date(a.endAt).getTime()) return false;
    return true;
  };
  const matchesDevice = (a) =>
    previewDevice === "mobile" ? a.showOnMobile : a.showOnDesktop;
  const previewAnnouncements = form.announcements
    .filter((a) => a.enabled && a.text.trim() && withinPreviewWindow(a) && matchesDevice(a))
    .map((a) => ({
      id: a.id,
      text: a.text,
      url: a.url || null,
      couponCode: a.couponCode || null,
      bgColor: a.bgColor || null,
      textColor: a.textColor || null,
    }));

  return (
    <form className="promo-editor" onSubmit={handleSave}>
      <header className="promo-editor__head">
        <h1>Promotional Header</h1>
        <div className="promo-editor__actions">
          <button type="submit" className="promo-editor__save" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <span className="promo-editor__ok">{message}</span>}
          {error && <span className="promo-editor__err">{error}</span>}
        </div>
      </header>

      <section className="promo-card">
        <div className="promo-card__head">
          <h2>Live preview</h2>
          <div className="promo-editor__device" role="group" aria-label="Preview device">
            <button
              type="button"
              className={`promo-editor__device-btn${previewDevice === "desktop" ? " promo-editor__device-btn--active" : ""}`}
              aria-pressed={previewDevice === "desktop"}
              aria-label="Desktop preview"
              onClick={() => setPreviewDevice("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              className={`promo-editor__device-btn${previewDevice === "mobile" ? " promo-editor__device-btn--active" : ""}`}
              aria-pressed={previewDevice === "mobile"}
              aria-label="Mobile preview"
              onClick={() => setPreviewDevice("mobile")}
            >
              Mobile
            </button>
          </div>
        </div>
        <div className={`promo-editor__preview promo-editor__preview--${previewDevice}`}>
          {form.enabled && previewAnnouncements.length > 0 ? (
            <PromoBannerView
              announcements={previewAnnouncements}
              bgColor={form.bgColor}
              textColor={form.textColor}
              rotationIntervalMs={Number(form.rotationIntervalMs) || 5000}
              rightText={form.rightText || null}
            />
          ) : (
            <p className="promo-editor__preview-empty">
              {form.enabled
                ? "No announcement is eligible for this device/time."
                : "Banner is disabled."}
            </p>
          )}
        </div>
      </section>

      <section className="promo-card">
        <div className="promo-card__head"><h2>Banner settings</h2></div>
        <div className="promo-editor__grid">
          <label className="promo-editor__check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => updateField("enabled", e.target.checked)}
            />
            Enable banner
          </label>
          <label className="promo-editor__field">
            <span>Default background</span>
            <input type="color" value={form.bgColor}
              onChange={(e) => updateField("bgColor", e.target.value)} />
          </label>
          <label className="promo-editor__field">
            <span>Default text color</span>
            <input type="color" value={form.textColor}
              onChange={(e) => updateField("textColor", e.target.value)} />
          </label>
          <label className="promo-editor__field">
            <span>Rotation interval (seconds)</span>
            <input type="number" min="2" step="1"
              value={Math.round(form.rotationIntervalMs / 1000)}
              onChange={(e) => updateField("rotationIntervalMs", Number(e.target.value) * 1000)} />
          </label>
          <label className="promo-editor__field promo-editor__field--wide">
            <span>Right text (e.g. customer care)</span>
            <input type="text" value={form.rightText}
              placeholder="Customer Care: 011-41410060"
              onChange={(e) => updateField("rightText", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="promo-card">
        <div className="promo-card__head">
          <h2>Announcements</h2>
          <button type="button" className="promo-editor__add" onClick={addAnnouncement}>
            Add announcement
          </button>
        </div>
        <ul className="promo-editor__list">
          {form.announcements.map((a, index) => (
            <li
              key={a.id}
              className="promo-editor__item"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
            >
              <div className="promo-editor__item-bar">
                <span className="promo-editor__drag" aria-hidden="true"><IconDrag /></span>
                <span className="promo-editor__item-title">Announcement {index + 1}</span>
                <div className="promo-editor__item-controls">
                  <button type="button" className="promo-editor__icon-btn"
                    aria-label={`Move up announcement ${index + 1}`}
                    onClick={() => move(index, index - 1)} disabled={index === 0}>
                    <IconUp />
                  </button>
                  <button type="button" className="promo-editor__icon-btn"
                    aria-label={`Move down announcement ${index + 1}`}
                    onClick={() => move(index, index + 1)}
                    disabled={index === form.announcements.length - 1}>
                    <IconDown />
                  </button>
                  <button type="button" className="promo-editor__icon-btn promo-editor__icon-btn--danger"
                    aria-label={`Remove announcement ${index + 1}`}
                    onClick={() => removeAnnouncement(index)}>
                    <IconRemove />
                  </button>
                </div>
              </div>

              <div className="promo-editor__grid">
                <label className="promo-editor__field promo-editor__field--wide">
                  <span>Announcement {index + 1} text</span>
                  <input type="text" value={a.text}
                    onChange={(e) => updateAnnouncement(index, "text", e.target.value)} />
                </label>
                <label className="promo-editor__field promo-editor__field--wide">
                  <span>Link URL (optional)</span>
                  <input type="url" value={a.url}
                    onChange={(e) => updateAnnouncement(index, "url", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Coupon code (optional)</span>
                  <input type="text" value={a.couponCode}
                    onChange={(e) => updateAnnouncement(index, "couponCode", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Slide background</span>
                  <input type="color" value={a.bgColor || form.bgColor}
                    onChange={(e) => updateAnnouncement(index, "bgColor", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Slide text color</span>
                  <input type="color" value={a.textColor || form.textColor}
                    onChange={(e) => updateAnnouncement(index, "textColor", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>Start date</span>
                  <input type="datetime-local" value={a.startAt}
                    onChange={(e) => updateAnnouncement(index, "startAt", e.target.value)} />
                </label>
                <label className="promo-editor__field">
                  <span>End date</span>
                  <input type="datetime-local" value={a.endAt}
                    onChange={(e) => updateAnnouncement(index, "endAt", e.target.value)} />
                </label>
                <label className="promo-editor__check">
                  <input type="checkbox" checked={a.showOnDesktop}
                    onChange={(e) => updateAnnouncement(index, "showOnDesktop", e.target.checked)} />
                  Show on desktop
                </label>
                <label className="promo-editor__check">
                  <input type="checkbox" checked={a.showOnMobile}
                    onChange={(e) => updateAnnouncement(index, "showOnMobile", e.target.checked)} />
                  Show on mobile
                </label>
                <label className="promo-editor__check">
                  <input type="checkbox" checked={a.enabled}
                    onChange={(e) => updateAnnouncement(index, "enabled", e.target.checked)} />
                  Enabled
                </label>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
