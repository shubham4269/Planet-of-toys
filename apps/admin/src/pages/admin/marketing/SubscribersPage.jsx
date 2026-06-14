// apps/admin/src/pages/admin/marketing/SubscribersPage.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError, API_BASE_URL } from "@planet-of-toys/shared-web/apiClient";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import "./SubscribersPage.css";

const PER_PAGE = 20;

export default function SubscribersPage() {
  const [data, setData] = useState({ subscribers: [], total: 0, page: 1, limit: PER_PAGE });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async (searchValue, pageValue) => {
    setLoading(true); setErr(null);
    const qs = new URLSearchParams({ search: searchValue, page: String(pageValue), limit: String(PER_PAGE) }).toString();
    try { setData(await apiClient.get(`/api/admin/newsletter/subscribers?${qs}`, { token: getToken() })); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { notifyUnauthorized(); return; } setErr("Could not load subscribers."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(search, page); }, [load, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(e) { e.preventDefault(); setPage(1); load(search, 1); }
  async function unsubscribe(id) {
    try { await apiClient.patch(`/api/admin/newsletter/subscribers/${id}/unsubscribe`, undefined, { token: getToken() }); load(search, page); }
    catch (e) { if (e instanceof ApiError && e.status === 401) notifyUnauthorized(); }
  }
  function exportCsv() {
    const qs = new URLSearchParams({ search }).toString();
    // Authenticated CSV: fetch as blob then trigger a download.
    fetch(`${API_BASE_URL}/api/admin/newsletter/subscribers/export?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "subscribers.csv"; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setErr("Export failed."));
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  return (
    <section className="subs-page">
      <header className="subs-page__head">
        <h1>Newsletter Subscribers</h1>
        <button type="button" className="subs-page__export" onClick={exportCsv}>Export CSV</button>
      </header>
      <form role="search" className="subs-page__search" onSubmit={onSearch}>
        <input type="search" aria-label="Search subscribers" placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit">Search</button>
      </form>
      {err && <p className="subs-page__err">{err}</p>}
      {loading ? <p>Loading…</p> : (
        <>
          <table className="subs-page__table">
            <thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Subscribed</th><th></th></tr></thead>
            <tbody>
              {data.subscribers.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td><td>{s.status}</td><td>{s.source}</td>
                  <td>{s.subscribedAt ? new Date(s.subscribedAt).toLocaleDateString() : ""}</td>
                  <td>{s.status === "subscribed" && (
                    <button type="button" aria-label={`Unsubscribe ${s.email}`} onClick={() => unsubscribe(s.id)}>Unsubscribe</button>
                  )}</td>
                </tr>
              ))}
              {data.subscribers.length === 0 && <tr><td colSpan="5">No subscribers.</td></tr>}
            </tbody>
          </table>
          <div className="subs-page__pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {data.page} of {totalPages} ({data.total})</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  );
}
