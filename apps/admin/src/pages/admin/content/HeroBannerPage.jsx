// apps/admin/src/pages/admin/content/HeroBannerPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { ApiError, API_BASE_URL } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { HeroEngineView } from "@planet-of-toys/shared-web";
import "@planet-of-toys/shared-web/hero/hero-views.css";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "../catalog/DevicePreview.jsx";
import "../catalog/CatalogPage.css";

const HERO = "/api/admin/hero";
const TYPES = ["campaign", "product", "video", "collection", "category", "seasonal"];
// Image-based layouts (the "video" displayMode is chosen via the Media type switch).
const LAYOUT_MODES = ["full_banner", "split", "collection_grid", "event"];
const CTA_TYPES = ["none", "product", "collection", "category", "customUrl"];
const empty = {
  type: "campaign", displayMode: "full_banner", title: "", subtitle: "", ctaText: "",
  ctaType: "none", productId: "", collectionId: "", categoryId: "", customUrl: "",
  desktopMedia: null, mobileMedia: null, video: null, posterImage: null,
  status: "draft", priority: 0, startDate: "", endDate: "", active: true,
};

// Which media slots each displayMode exposes. `kind` (image|video) drives the
// file accept filter + the thumbnail preview. collection_grid pulls its imagery
// from the linked collection's products, so it needs no per-slide media.
const MEDIA_SLOTS = {
  full_banner: [
    { field: "desktopMedia", label: "Desktop image", kind: "image" },
    { field: "mobileMedia", label: "Mobile image", kind: "image" },
  ],
  split: [
    { field: "desktopMedia", label: "Desktop image", kind: "image" },
    { field: "mobileMedia", label: "Mobile image", kind: "image" },
  ],
  event: [
    { field: "desktopMedia", label: "Desktop image", kind: "image" },
    { field: "mobileMedia", label: "Mobile image", kind: "image" },
  ],
  video: [
    { field: "video", label: "Video", kind: "video" },
    { field: "posterImage", label: "Poster image", kind: "image" },
    { field: "desktopMedia", label: "Desktop image (fallback)", kind: "image" },
    { field: "mobileMedia", label: "Mobile image (fallback)", kind: "image" },
  ],
  collection_grid: [],
};

/** A single media slot: current asset thumbnail + Upload/Replace + Remove. */
function MediaField({ label, kind, value, resolveUrl, onUpload, onRemove }) {
  return (
    <div className="hero-media">
      <span className="hero-media__label">{label}</span>
      <div className="hero-media__preview">
        {value
          ? (kind === "video"
              ? <video className="hero-media__thumb" src={resolveUrl(value)} muted playsInline />
              : <img className="hero-media__thumb" src={resolveUrl(value)} alt={label} />)
          : <span className="hero-media__empty">No media</span>}
      </div>
      <div className="hero-media__actions">
        <label className="catalog-page__upload" aria-label={`${value ? "Replace" : "Upload"} ${label}`}>
          {value ? "Replace" : "Upload"}
          <input type="file" accept={kind === "video" ? "video/*" : "image/*"} hidden
            onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        </label>
        {value && <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
}

export default function HeroBannerPage() {
  const [slides, setSlides] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [cols, setCols] = useState([]);
  const [cats, setCats] = useState([]);
  const [err, setErr] = useState(null);
  const auth = () => ({ token: getToken() });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async (deleted) => {
    setErr(null);
    try {
      const [h, k, c] = await Promise.all([
        apiClient.get(`${HERO}?includeDeleted=${deleted ? "true" : "false"}`, auth()),
        apiClient.get(`/api/admin/catalog/collections`, auth()),
        apiClient.get(`/api/admin/catalog/categories`, auth()),
      ]);
      setSlides(h?.slides ?? []);
      setCols((k?.collections ?? []).map((x) => ({ id: x.id, name: x.name })));
      setCats((c?.categories ?? []).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load hero slides."); }
  }, []);
  useEffect(() => { load(showDeleted); }, [load, showDeleted]);

  function bodyFromForm(f) {
    return {
      type: f.type, displayMode: f.displayMode, title: f.title.trim(), subtitle: f.subtitle, ctaText: f.ctaText,
      ctaType: f.ctaType, customUrl: f.ctaType === "customUrl" ? f.customUrl : "",
      productId: f.ctaType === "product" ? (f.productId || null) : null,
      collectionId: f.collectionId || null, categoryId: f.categoryId || null,
      desktopMedia: f.desktopMedia, mobileMedia: f.mobileMedia, video: f.video, posterImage: f.posterImage,
      status: f.status, priority: Number(f.priority) || 0, active: f.active,
      startDate: f.startDate || null, endDate: f.endDate || null,
    };
  }

  async function save() {
    if (!form.title.trim()) return;
    setErr(null);
    try {
      if (editingId) await apiClient.put(`${HERO}/${editingId}`, bodyFromForm(form), auth());
      else await apiClient.post(HERO, bodyFromForm(form), auth());
      setForm(empty); setEditingId(null); await load(showDeleted);
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save slide."); }
  }
  function editSlide(s) {
    setEditingId(s.id);
    setForm({ ...empty, ...s, productId: s.productId || "", collectionId: s.collectionId || "", categoryId: s.categoryId || "",
      startDate: s.startDate ? String(s.startDate).slice(0, 10) : "", endDate: s.endDate ? String(s.endDate).slice(0, 10) : "" });
  }
  async function toggleActive(s) {
    try { await apiClient.patch(`${HERO}/${s.id}/active`, { active: !s.active }, auth()); await load(showDeleted); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not update."); }
  }
  async function act(id, action) {
    try { await apiClient.post(`${HERO}/${id}/${action}`, {}, auth()); await load(showDeleted); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not update."); }
  }
  async function move(id, delta) {
    const list = slides.filter((x) => !x.deletedAt);
    const i = list.findIndex((x) => x.id === id);
    if (i + delta < 0 || i + delta >= list.length) return;
    const r = list.slice(); const [m] = r.splice(i, 1); r.splice(i + delta, 0, m);
    try { await apiClient.put(`${HERO}/reorder`, { items: r.map((x, idx) => ({ id: x.id, sortOrder: idx, priority: x.priority })) }, auth()); await load(showDeleted); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not reorder."); }
  }
  async function upload(field, file) {
    setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/admin/media`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Upload failed (${res.status}).`);
      }
      const data = await res.json();
      const ref = data?.media?.filename || data?.media?.url;
      if (!ref) throw new Error("Upload succeeded but no media reference was returned.");
      set({ [field]: ref });
    } catch (e) { setErr(e.message || "Upload failed."); }
  }

  // Media type is derived from displayMode: "video" mode is video-based, the rest are image-based.
  const mediaType = form.displayMode === "video" ? "video" : "image";
  function setMediaType(next) {
    if (next === "video") set({ displayMode: "video" });
    else if (form.displayMode === "video") set({ displayMode: "full_banner" });
  }

  const previewSlides = useMemo(() => {
    const b = bodyFromForm(form);
    return [{ id: "draft", ...b, ctaHref: form.ctaType === "customUrl" ? form.customUrl : "#",
      desktopMedia: form.desktopMedia, mobileMedia: form.mobileMedia, video: form.video, posterImage: form.posterImage, gridItems: [] }];
  }, [form]);

  if (slides === null) return <p className="catalog-page__status">Loading…</p>;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Hero Banner</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><HeroEngineView slides={previewSlides} autoPlay={false} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>{editingId ? "Edit slide" : "Add slide"}</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>Slide title</span>
            <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="catalog-page__field"><span>Type</span>
            <select value={form.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="catalog-page__field"><span>Media type</span>
            <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select></label>
          {mediaType === "image" && (
            <label className="catalog-page__field"><span>Layout</span>
              <select value={form.displayMode} onChange={(e) => set({ displayMode: e.target.value })}>{LAYOUT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          )}
          <label className="catalog-page__field"><span>Subtitle</span>
            <input type="text" value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></label>
          <label className="catalog-page__field"><span>CTA text</span>
            <input type="text" value={form.ctaText} onChange={(e) => set({ ctaText: e.target.value })} /></label>
          <label className="catalog-page__field"><span>CTA type</span>
            <select value={form.ctaType} onChange={(e) => set({ ctaType: e.target.value })}>{CTA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          {form.ctaType === "product" && (
            <label className="catalog-page__field"><span>Product id</span>
              <input type="text" value={form.productId} onChange={(e) => set({ productId: e.target.value })} placeholder="product _id" /></label>
          )}
          {(form.ctaType === "collection" || form.displayMode === "collection_grid") && (
            <label className="catalog-page__field"><span>Collection</span>
              <select value={form.collectionId} onChange={(e) => set({ collectionId: e.target.value })}>
                <option value="">Select…</option>{cols.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          )}
          {form.ctaType === "category" && (
            <label className="catalog-page__field"><span>Category</span>
              <select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">Select…</option>{cats.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          )}
          {form.ctaType === "customUrl" && (
            <label className="catalog-page__field"><span>Custom URL</span>
              <input type="text" value={form.customUrl} onChange={(e) => set({ customUrl: e.target.value })} /></label>
          )}
          <label className="catalog-page__field"><span>Status</span>
            <select value={form.status} onChange={(e) => set({ status: e.target.value })}><option value="draft">draft</option><option value="published">published</option></select></label>
          <label className="catalog-page__field"><span>Priority</span>
            <input type="number" value={form.priority} onChange={(e) => set({ priority: e.target.value })} /></label>
          <label className="catalog-page__field"><span>Start date</span>
            <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
          <label className="catalog-page__field"><span>End date</span>
            <input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
          {(MEDIA_SLOTS[form.displayMode] || []).length === 0 ? (
            <p className="hero-media__note">Grid images come from the linked collection’s products — no slide image needed.</p>
          ) : (
            <div className="hero-media-grid">
              {(MEDIA_SLOTS[form.displayMode] || []).map((slot) => (
                <MediaField key={slot.field} label={slot.label} kind={slot.kind} value={form[slot.field]}
                  resolveUrl={(f) => mediaUrl(f)} onUpload={(file) => upload(slot.field, file)}
                  onRemove={() => set({ [slot.field]: null })} />
              ))}
            </div>
          )}
          <label className="catalog-page__check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
          <button type="button" onClick={save}>{editingId ? "Save slide" : "Add slide"}</button>
          {editingId && <button type="button" onClick={() => { setForm(empty); setEditingId(null); }}>Cancel</button>}
        </div>
      </section>

      <section className="catalog-card">
        <div className="catalog-page__add" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Slides</h2>
          <label className="catalog-page__check"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted</label>
        </div>
        <ul className="catalog-page__list">
          {slides.map((s) => (
            <li key={s.id} className="catalog-page__row">
              <span className="catalog-page__row-name">{s.title || "(untitled)"} <small>· {s.type}/{s.displayMode} · {s.status}{s.deletedAt ? " · deleted" : ""}</small></span>
              <span className="catalog-page__row-actions">
                {s.deletedAt ? (
                  <button type="button" onClick={() => act(s.id, "restore")}>Restore</button>
                ) : (
                  <>
                    <label className="catalog-page__check"><input type="checkbox" checked={!!s.active} onChange={() => toggleActive(s)} /> Active</label>
                    <button type="button" aria-label={`Move up ${s.title}`} onClick={() => move(s.id, -1)}>↑</button>
                    <button type="button" aria-label={`Move down ${s.title}`} onClick={() => move(s.id, 1)}>↓</button>
                    <button type="button" onClick={() => editSlide(s)}>Edit</button>
                    <button type="button" aria-label={`Delete ${s.title}`} onClick={() => act(s.id, "soft-delete")}>Delete</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
