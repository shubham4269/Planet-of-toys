// apps/admin/src/pages/admin/catalog/AttributesPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { AttributeFilterView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import DevicePreview from "./DevicePreview.jsx";
import "./CatalogPage.css";

const BASE = "/api/admin/catalog/attributes";
const DISPLAY_TYPES = ["checkbox", "radio", "dropdown", "color", "button", "range"];

export default function AttributesPage() {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [displayType, setDisplayType] = useState("checkbox");
  const [valueName, setValueName] = useState("");
  const [err, setErr] = useState(null);
  const auth = () => ({ token: getToken() });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiClient.get(BASE, auth());
      const attrs = res?.attributes ?? [];
      setList(attrs);
      setSelectedId((cur) => cur ?? attrs[0]?.id ?? null);
    } catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not load attributes."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addAttribute() {
    if (!name.trim()) return;
    setErr(null);
    try { const r = await apiClient.post(BASE, { name: name.trim(), displayType }, auth()); setName(""); setSelectedId(r?.attribute?.id ?? null); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not create attribute."); }
  }

  async function addValue() {
    if (!selectedId || !valueName.trim()) return;
    setErr(null);
    try { await apiClient.post(`${BASE}/${selectedId}/values`, { name: valueName.trim() }, auth()); setValueName(""); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr(e instanceof ApiError ? e.message : "Could not add value."); }
  }

  async function setType(id, type) {
    try { await apiClient.put(`${BASE}/${id}`, { displayType: type }, auth()); await load(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) return notifyUnauthorized(); setErr("Could not update."); }
  }

  if (list === null) return <p className="catalog-page__status">Loading…</p>;
  const selected = list.find((a) => a.id === selectedId) || list[0] || null;

  return (
    <div className="catalog-page">
      <header className="catalog-page__head"><h1>Attributes</h1></header>
      {err && <p className="catalog-page__err" role="alert">{err}</p>}

      <section className="catalog-card">
        <h2>Live preview</h2>
        <DevicePreview><AttributeFilterView attribute={selected} /></DevicePreview>
      </section>

      <section className="catalog-card">
        <h2>Add attribute</h2>
        <div className="catalog-page__add">
          <label className="catalog-page__field"><span>New attribute name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="catalog-page__field"><span>Display type</span>
            <select value={displayType} onChange={(e) => setDisplayType(e.target.value)}>
              {DISPLAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <button type="button" onClick={addAttribute}>Add attribute</button>
        </div>
      </section>

      <section className="catalog-card">
        <h2>Attributes</h2>
        <ul className="catalog-page__list">
          {list.map((a) => (
            <li key={a.id} className="catalog-page__row">
              <button type="button" className="catalog-page__row-name" onClick={() => setSelectedId(a.id)}>{a.name}</button>
              <span className="catalog-page__row-actions">
                <select aria-label={`Display type for ${a.name}`} value={a.displayType} onChange={(e) => setType(a.id, e.target.value)}>
                  {DISPLAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="catalog-page__count">{a.values?.length || 0} values</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="catalog-card">
          <h2>Values — {selected.name}</h2>
          <div className="catalog-page__add">
            <label className="catalog-page__field"><span>New value name</span>
              <input type="text" value={valueName} onChange={(e) => setValueName(e.target.value)} /></label>
            <button type="button" onClick={addValue}>Add value</button>
          </div>
          <ul className="catalog-page__list">
            {(selected.values ?? []).map((v) => (
              <li key={v.id} className="catalog-page__row"><span>{v.name}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
