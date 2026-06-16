// apps/admin/src/pages/admin/catalog/CollectionsPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView, FilterView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "./DevicePreview.jsx";
import "./CatalogPage.css";

const BASE = "/api/admin/catalog/collections";

export default function CollectionsPage() {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiClient.get(BASE, auth());
      const cols = res?.collections ?? [];
      setList(cols);
      setSelectedId((cur) => cur ?? cols[0]?.id ?? null);
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load collections."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try { const r = await apiClient.post(BASE, { name: name.trim() }, auth()); setName(""); setSelectedId(r?.collection?.id ?? null); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create collection."); }
    finally { setBusy(false); }
  }

  async function patch(id, body) {
    try { await apiClient.put(`${BASE}/${id}`, body, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save."); }
  }

  async function archive(id) {
    try { await apiClient.post(`${BASE}/${id}/archive`, {}, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not archive."); }
  }

  async function uploadHero(id, file) {
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: form });
    const data = await res.json();
    await patch(id, { heroImage: data.filename });
  }

  // ---- per-collection filter configuration (Sub-project B) ----
  const [config, setConfig] = useState(null);   // { filters: [...] }
  const [attrs, setAttrs] = useState([]);
  const [cfgMsg, setCfgMsg] = useState(null);

  useEffect(() => {
    if (!selectedId) { setConfig(null); return undefined; }
    let on = true;
    (async () => {
      try {
        const [cfg, a] = await Promise.all([
          apiClient.get(`${BASE}/${selectedId}/filter-config`, { token: getToken() }),
          apiClient.get(`/api/admin/catalog/attributes`, { token: getToken() }),
        ]);
        if (!on) return;
        setAttrs(a?.attributes ?? []);
        setConfig({ filters: cfg?.config?.filters ?? [] });
      } catch (e) { if (e instanceof ApiError && e.status === 401) notifyUnauthorized(); }
    })();
    return () => { on = false; };
  }, [selectedId]);

  const setEntry = (i, patch_) => setConfig((c) => ({ filters: c.filters.map((f, x) => (x === i ? { ...f, ...patch_ } : f)) }));
  const moveEntry = (i, d) => setConfig((c) => {
    const t = i + d; if (t < 0 || t >= c.filters.length) return c;
    const f = c.filters.slice(); const [m] = f.splice(i, 1); f.splice(t, 0, m);
    return { filters: f.map((e, x) => ({ ...e, sortOrder: x })) };
  });
  const labelFor = (f) => f.type === "attribute"
    ? (attrs.find((a) => a.id === String(f.attributeId))?.name ?? "Attribute")
    : (f.type === "price" ? "Price" : "Category");
  async function saveConfig() {
    setCfgMsg(null);
    try {
      await apiClient.put(`${BASE}/${selectedId}/filter-config`,
        { filters: config.filters.map((f, i) => ({ type: f.type, attributeId: f.attributeId ?? null, enabled: f.enabled !== false, sortOrder: i })) },
        { token: getToken() });
      setCfgMsg("Filters saved.");
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save filters."); }
  }

  // Resolved preview definitions from the in-progress config (enabled only).
  const previewFilters = (config?.filters ?? []).filter((f) => f.enabled !== false).map((f) => {
    if (f.type === "attribute") {
      const a = attrs.find((x) => x.id === String(f.attributeId));
      return a ? { key: `f_${a.id}`, type: "attribute", attributeSlug: a.id, name: a.name, displayType: a.displayType,
        values: (a.values ?? []).map((v) => ({ slug: v.slug ?? v.id, name: v.name, swatchHex: v.swatchHex ?? null })) } : null;
    }
    if (f.type === "price") return { key: "price", type: "price", min: 0, max: 1000 };
    return { key: "category", type: "category", options: [] };
  }).filter(Boolean);

  if (list === null) return <p className="catalog-page__status">Loading…</p>;
  const selected = list.find((c) => c.id === selectedId) || list[0] || null;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Collections</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><CollectionView collection={selected} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add collection</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>New collection name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button type="button" onClick={add} disabled={busy}>Add collection</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Collections</h2>
        <ul className="catalog-page__list">
          {list.map((c) => (
            <li key={c.id} className="catalog-page__row">
              <button type="button" className="catalog-page__row-name" onClick={() => setSelectedId(c.id)}>{c.name}</button>
              <span className="catalog-page__row-actions">
                <label className="catalog-page__check"><input type="checkbox" checked={!!c.featuredOnHome} onChange={(e) => patch(c.id, { featuredOnHome: e.target.checked })} /> Home</label>
                <label className="catalog-page__check"><input type="checkbox" checked={!!c.showInNavigation} onChange={(e) => patch(c.id, { showInNavigation: e.target.checked })} /> Nav</label>
                <label className="catalog-page__upload" aria-label={`Upload hero for ${c.name}`}>Hero<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadHero(c.id, e.target.files[0])} /></label>
                <button type="button" aria-label={`Archive ${c.name}`} onClick={() => archive(c.id)}>Archive</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {selected && config && (
        <section className="catalog-card">
          <h2>Filters — {selected.name}</h2>
          <div className="catalog-page__add" style={{ marginBottom: 12 }}>
            <button type="button" onClick={saveConfig}>Save filters</button>
            {cfgMsg && <span className="catalog-page__count">{cfgMsg}</span>}
          </div>
          <ul className="catalog-page__list">
            {config.filters.map((f, i) => (
              <li key={`${f.type}-${f.attributeId ?? i}`} className="catalog-page__row">
                <span className="catalog-page__row-name">{labelFor(f)}</span>
                <span className="catalog-page__row-actions">
                  <label className="catalog-page__check">
                    <input type="checkbox" checked={f.enabled !== false} onChange={(e) => setEntry(i, { enabled: e.target.checked })} /> Enabled
                  </label>
                  <button type="button" aria-label={`Move up ${labelFor(f)}`} onClick={() => moveEntry(i, -1)}>↑</button>
                  <button type="button" aria-label={`Move down ${labelFor(f)}`} onClick={() => moveEntry(i, 1)}>↓</button>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="catalog-card__sub">Preview</h3>
          <DevicePreview><FilterView filters={previewFilters} selection={{}} onChange={() => {}} /></DevicePreview>
        </section>
      )}
    </div>
  );
}
