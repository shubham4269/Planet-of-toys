// apps/admin/src/pages/admin/catalog/CollectionsPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
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
    </div>
  );
}
