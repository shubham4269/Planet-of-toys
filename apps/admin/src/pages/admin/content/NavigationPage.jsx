// apps/admin/src/pages/admin/content/NavigationPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { ApiError, API_BASE_URL } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { NavigationView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "../catalog/DevicePreview.jsx";
import "../catalog/CatalogPage.css";

const NAV = "/api/admin/catalog/navigation";
const MENU_KEY = "header";
const TARGET_TYPES = ["category", "collection", "internalRoute", "externalUrl"];
const empty = { label: "", targetType: "collection", targetId: "", url: "", parentId: "", isMegaMenu: false, featured: false };

/** Flatten a category tree into [{id,name}]. */
function flattenCats(nodes, depth = 0, out = []) {
  for (const n of nodes) { out.push({ id: n.id, name: `${"— ".repeat(depth)}${n.name}` }); if (n.children?.length) flattenCats(n.children, depth + 1, out); }
  return out;
}

export default function NavigationPage() {
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [cols, setCols] = useState([]);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(null);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [n, c, k] = await Promise.all([
        apiClient.get(`${NAV}?menuKey=${MENU_KEY}`, auth()),
        apiClient.get(`/api/admin/catalog/categories`, auth()),
        apiClient.get(`/api/admin/catalog/collections`, auth()),
      ]);
      setItems(n?.items ?? []);
      setCats(flattenCats(c?.categories ?? []));
      setCols((k?.collections ?? []).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load navigation."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function bodyFromForm(f) {
    const body = { label: f.label.trim(), targetType: f.targetType, menuKey: MENU_KEY, isMegaMenu: f.isMegaMenu, featured: f.featured };
    if (f.parentId) body.parentId = f.parentId;
    if (f.targetType === "category" || f.targetType === "collection") body.targetId = f.targetId;
    else body.url = f.url;
    return body;
  }

  async function addItem() {
    if (!form.label.trim()) return;
    setErr(null);
    try { await apiClient.post(NAV, bodyFromForm(form), auth()); setForm(empty); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create item."); }
  }
  async function patch(id, body) {
    try { await apiClient.put(`${NAV}/${id}`, body, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not save."); }
  }
  async function archive(id) {
    try { await apiClient.post(`${NAV}/${id}/archive`, {}, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not archive."); }
  }
  async function move(id, delta) {
    const cur = items.find((y) => y.id === id);
    const siblings = items.filter((x) => String(x.parentId ?? "") === String(cur?.parentId ?? ""));
    const pos = siblings.findIndex((s) => s.id === id);
    if (pos + delta < 0 || pos + delta >= siblings.length) return;
    const reordered = siblings.slice(); const [m] = reordered.splice(pos, 1); reordered.splice(pos + delta, 0, m);
    try { await apiClient.put(`${NAV}/reorder`, { items: reordered.map((s, i) => ({ id: s.id, parentId: s.parentId ?? null, sortOrder: i })) }, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not reorder."); }
  }
  async function uploadImage(id, file) {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/admin/media`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
    const data = await res.json();
    await patch(id, { image: data.filename });
  }

  const topLevel = useMemo(() => (items ?? []).filter((i) => !i.parentId), [items]);
  const previewTree = useMemo(() => {
    const nodes = new Map(); const roots = [];
    for (const i of (items ?? [])) nodes.set(String(i.id), { id: i.id, label: i.label, href: "#", isMegaMenu: i.isMegaMenu, featured: i.featured, image: i.image, children: [] });
    for (const i of (items ?? [])) { const n = nodes.get(String(i.id)); const p = i.parentId ? String(i.parentId) : null; if (p && nodes.has(p)) nodes.get(p).children.push(n); else roots.push(n); }
    return roots;
  }, [items]);

  if (items === null) return <p className="catalog-page__status">Loading…</p>;
  const entity = form.targetType === "category" ? cats : cols;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Navigation</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><NavigationView items={previewTree} resolveImageUrl={(f) => mediaUrl(f)} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add menu item</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>Item label</span>
            <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
          <label className="catalog-page__field"><span>Target type</span>
            <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
              {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          {(form.targetType === "category" || form.targetType === "collection") ? (
            <label className="catalog-page__field"><span>Target</span>
              <select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}>
                <option value="">Select…</option>
                {entity.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></label>
          ) : (
            <label className="catalog-page__field"><span>URL</span>
              <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          )}
          <label className="catalog-page__field"><span>Parent</span>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None (top level)</option>
              {topLevel.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select></label>
          <label className="catalog-page__check"><input type="checkbox" checked={form.isMegaMenu} onChange={(e) => setForm({ ...form, isMegaMenu: e.target.checked })} /> Mega</label>
          <label className="catalog-page__check"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured</label>
          <button type="button" onClick={addItem}>Add item</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Menu items</h2>
        <ul className="catalog-page__list">
          {items.map((i) => (
            <li key={i.id} className="catalog-page__row" style={{ paddingLeft: i.parentId ? 24 : 0 }}>
              <span className="catalog-page__row-name">{i.label}</span>
              <span className="catalog-page__row-actions">
                <label className="catalog-page__check"><input type="checkbox" checked={!!i.isMegaMenu} onChange={(e) => patch(i.id, { isMegaMenu: e.target.checked })} /> Mega</label>
                <label className="catalog-page__check"><input type="checkbox" checked={!!i.featured} onChange={(e) => patch(i.id, { featured: e.target.checked })} /> Featured</label>
                <label className="catalog-page__upload" aria-label={`Upload image for ${i.label}`}>Image<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadImage(i.id, e.target.files[0])} /></label>
                <button type="button" aria-label={`Move up ${i.label}`} onClick={() => move(i.id, -1)}>↑</button>
                <button type="button" aria-label={`Move down ${i.label}`} onClick={() => move(i.id, 1)}>↓</button>
                <button type="button" aria-label={`Archive ${i.label}`} onClick={() => archive(i.id)}>Archive</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
