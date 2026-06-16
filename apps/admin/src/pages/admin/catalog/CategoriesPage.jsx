// apps/admin/src/pages/admin/catalog/CategoriesPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { CategoryView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "./DevicePreview.jsx";
import "./CatalogPage.css";

const BASE = "/api/admin/catalog/categories";

/** Flatten the tree into depth-tagged rows for the editor list. */
function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

export default function CategoriesPage() {
  const [tree, setTree] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try { const res = await apiClient.get(BASE, auth()); setTree(res?.categories ?? []); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load categories."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addCategory() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try { await apiClient.post(BASE, { name: name.trim() }, auth()); setName(""); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create category."); }
    finally { setBusy(false); }
  }

  async function archive(id) {
    setErr(null);
    try { await apiClient.post(`${BASE}/${id}/archive`, {}, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not archive."); }
  }

  /** Move a sibling within the flat sibling group and persist the new order. */
  async function move(rows, index, delta) {
    const row = rows[index];
    const siblings = rows.filter((r) => String(r.parentId ?? "") === String(row.parentId ?? ""));
    const pos = siblings.findIndex((s) => s.id === row.id);
    const swapWith = siblings[pos + delta];
    if (!swapWith) return;
    const reordered = siblings.slice();
    reordered.splice(pos, 1);
    reordered.splice(pos + delta, 0, row);
    const items = reordered.map((s, i) => ({ id: s.id, parentId: s.parentId ?? null, sortOrder: i }));
    try { await apiClient.put(`${BASE}/reorder`, { items }, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not reorder."); }
  }

  async function uploadImage(id, file) {
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/admin/media", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: form });
    const data = await res.json();
    await apiClient.put(`${BASE}/${id}`, { image: data.filename }, auth());
    await load();
  }

  const rows = useMemo(() => (tree ? flatten(tree) : []), [tree]);
  const previewCategories = useMemo(
    () => (tree ?? []).map((c) => ({ id: c.id, name: c.name, image: c.image, childCount: c.children?.length || 0 })),
    [tree]
  );

  if (tree === null) return <p className="catalog-page__status">Loading…</p>;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Categories</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><CategoryView categories={previewCategories} resolveImageUrl={(f) => mediaUrl(f)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add category</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>New category name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button type="button" onClick={addCategory} disabled={busy}>Add category</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Tree</h2>
        <ul className="catalog-page__list">
          {rows.map((r, i) => (
            <li key={r.id} className="catalog-page__row" style={{ paddingLeft: `${r.depth * 20}px` }}>
              <span className="catalog-page__row-name">{r.name}</span>
              <span className="catalog-page__row-actions">
                <button type="button" aria-label={`Move up ${r.name}`} onClick={() => move(rows, i, -1)}>↑</button>
                <button type="button" aria-label={`Move down ${r.name}`} onClick={() => move(rows, i, 1)}>↓</button>
                <label className="catalog-page__upload" aria-label={`Upload image for ${r.name}`}>
                  Image<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadImage(r.id, e.target.files[0])} />
                </label>
                <button type="button" aria-label={`Archive ${r.name}`} onClick={() => archive(r.id)}>Archive</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
