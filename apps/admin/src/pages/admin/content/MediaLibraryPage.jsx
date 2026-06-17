// apps/admin/src/pages/admin/content/MediaLibraryPage.jsx
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl } from "@planet-of-toys/shared-web/format";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import "./MediaLibraryPage.css";

const ENDPOINT = `${API_BASE_URL}/api/admin/media`;

/**
 * Admin Content → Media Library. Lists every file in `server/media` with a
 * storage-summary card, search, type/usage filters, upload, and per-card
 * Open / Download / Copy URL / Delete. Delete is blocked for in-use files
 * (server returns 409 with `usedBy`).
 */
export default function MediaLibraryPage() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ q, type, filter });
      const res = await fetch(`${ENDPOINT}?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.status === 401) return notifyUnauthorized();
      if (!res.ok) throw new Error("load failed");
      setData(await res.json());
    } catch {
      setErr("Could not load media.");
    }
  }, [q, type, filter]);
  useEffect(() => { load(); }, [load]);

  const onUpload = useCallback(async (file) => {
    if (!file) return;
    setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      if (res.status === 401) return notifyUnauthorized();
      if (!res.ok) throw new Error("upload failed");
      await load();
    } catch { setErr("Upload failed."); }
  }, [load]);

  const onDelete = useCallback(async (item) => {
    if (item.inUse) return;
    if (!window.confirm(`Delete ${item.filename}? This cannot be undone.`)) return;
    setErr(null);
    try {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(item.filename)}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.status === 401) return notifyUnauthorized();
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const who = (body.usedBy || []).map((u) => `${u.type} "${u.label}"`).join(", ");
        setErr(`Cannot delete — in use by ${who || "another item"}.`);
        return;
      }
      if (!res.ok) throw new Error("delete failed");
      await load();
    } catch { setErr("Delete failed."); }
  }, [load]);

  const onCopy = useCallback(async (item) => {
    try { await navigator.clipboard.writeText(`${API_BASE_URL}${item.url}`); } catch { /* ignore */ }
  }, []);

  const onDownload = useCallback(async (item) => {
    try {
      const res = await fetch(mediaUrl(item.filename));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = item.filename; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(href);
    } catch { setErr("Download failed."); }
  }, []);

  if (data === null && err) return <p className="medialib__err" role="alert">{err}</p>;
  if (data === null) return <p className="medialib__status">Loading…</p>;

  const { items, summary } = data;

  return (
    <div className="medialib">
      <header className="medialib__head">
        <h1>Media Library</h1>
        <label className="medialib__upload-btn">
          Upload
          <input type="file" accept="image/*,video/*" hidden onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        </label>
      </header>

      {err && <p className="medialib__err" role="alert">{err}</p>}

      <section className="medialib__summary" aria-label="Storage summary">
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.totalLabel}</div><div className="medialib__stat-label">{summary.totalFiles} files</div></div>
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.imageCount}</div><div className="medialib__stat-label">images</div></div>
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.videoCount}</div><div className="medialib__stat-label">videos</div></div>
        <div className="medialib__stat"><div className="medialib__stat-value">{summary.unusedFiles}</div><div className="medialib__stat-label">unused ({summary.unusedLabel})</div></div>
      </section>

      <section className="medialib__toolbar" aria-label="Filters">
        <input type="search" placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search filename" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type filter">
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Usage filter">
          <option value="all">All</option>
          <option value="unused">Unused only</option>
        </select>
      </section>

      <section className="medialib__grid" aria-label="Media files">
        {items.length === 0 && <p className="medialib__empty">No media found.</p>}
        {items.map((it) => (
          <article key={it.filename} className="medialib__card">
            <div className="medialib__thumb">
              {it.kind === "video"
                ? <video src={mediaUrl(it.filename)} muted />
                : <img src={mediaUrl(it.filename)} alt={it.filename} loading="lazy" />}
            </div>
            <div className="medialib__meta">
              <span className="medialib__name">{it.filename}</span>
              <span className="medialib__sub">{it.sizeLabel} · {new Date(it.modifiedAt).toLocaleDateString()}</span>
              <span className={`medialib__badge ${it.inUse ? "medialib__badge--used" : "medialib__badge--unused"}`}>{it.inUse ? "In use" : "Unused"}</span>
            </div>
            <div className="medialib__actions">
              <a href={mediaUrl(it.filename)} target="_blank" rel="noreferrer">Open</a>
              <button type="button" onClick={() => onDownload(it)}>Download</button>
              <button type="button" onClick={() => onCopy(it)} aria-label={`Copy URL ${it.filename}`}>Copy URL</button>
              <button type="button" className="medialib__delete" disabled={it.inUse} onClick={() => onDelete(it)} aria-label={`Delete ${it.filename}`}>Delete</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
