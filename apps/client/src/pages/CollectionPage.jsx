// apps/client/src/pages/CollectionPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView, FilterView, ProductGrid, SortControl } from "@planet-of-toys/shared-web";
import { toQueryString } from "@planet-of-toys/shared-web/catalog";
import "@planet-of-toys/shared-web/catalog/catalog-views.css";
import useFilterState from "../hooks/useFilterState.js";
import "./CollectionPage.css";

export default function CollectionPage() {
  const { slug } = useParams();
  const { selection, sort, page, setSelection, setSort, setPage } = useFilterState();
  const [meta, setMeta] = useState({ status: "loading", collection: null });
  const [filters, setFilters] = useState([]);
  const [result, setResult] = useState(null);
  const [drawer, setDrawer] = useState(false);

  // Collection meta + filter definitions (per slug).
  useEffect(() => {
    let active = true;
    setMeta({ status: "loading", collection: null });
    apiClient.get(`/api/catalog/collections/${slug}`)
      .then((res) => { if (active) setMeta({ status: "ready", collection: res.collection }); })
      .catch((e) => { if (active) setMeta({ status: e?.status === 404 ? "notfound" : "error", collection: null }); });
    apiClient.get(`/api/catalog/collections/${slug}/filters`)
      .then((res) => { if (active) setFilters(res.filters || []); })
      .catch(() => { if (active) setFilters([]); });
    return () => { active = false; };
  }, [slug]);

  // Product page (per slug + selection + sort + page).
  useEffect(() => {
    let active = true;
    const qs = toQueryString({ selection, sort, page });
    apiClient.get(`/api/catalog/collections/${slug}/products${qs ? `?${qs}` : ""}`)
      .then((res) => { if (active) setResult(res); })
      .catch(() => { if (active) setResult({ products: [], total: 0, page: 1, pageCount: 1 }); });
    return () => { active = false; };
  }, [slug, JSON.stringify(selection), sort, page]);

  if (meta.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (meta.status === "notfound") return <p className="collection-page__status">Collection not found.</p>;
  if (meta.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  const pageCount = result?.pageCount ?? 1;
  return (
    <main className="collection-page">
      <CollectionView collection={meta.collection} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />

      <div className="collection-page__browse">
        <FilterView filters={filters} selection={selection} onChange={setSelection}
          open={drawer} onClose={() => setDrawer(false)} />

        <section className="collection-page__results">
          <div className="collection-page__toolbar">
            <button type="button" className="collection-page__filters-btn" onClick={() => setDrawer(true)}>Filters</button>
            <SortControl value={sort} onChange={setSort} />
          </div>

          <ProductGrid products={result?.products ?? []} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />

          {pageCount > 1 && (
            <nav className="collection-page__pager" aria-label="Pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="collection-page__pageinfo">Page {page} of {pageCount}</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
